/* Visual QA — drives a real headless Chrome over CDP (no npm deps; uses Node's
 * built-in WebSocket) to screenshot the TD games' key interactive states and
 * flag console errors. Catches *visual/layout* regressions that the headless
 * logic harness (runtime-check.mjs) can't see — e.g. a flex button stretching
 * to full overlay height.
 *
 * LOCAL ONLY (needs a Chrome binary; not wired into CI). Usage:
 *   node tools/visual-qa.mjs
 *   CHROME_BIN=/path/to/chrome node tools/visual-qa.mjs
 * Screenshots land in $TMPDIR/lab-games-qa/. Exit 1 on a real console error
 * (the favicon 404 every static page emits is ignored).
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 8746, DBG = 9223;
const OUT = path.join(os.tmpdir(), 'lab-games-qa');
const CHROME = process.env.CHROME_BIN ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!existsSync(CHROME)){
  console.error(`Chrome not found at ${CHROME}. Set CHROME_BIN=/path/to/chrome.`);
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const kids = [];
const spawnBg = (cmd, args, opts) => { const c = spawn(cmd, args, { stdio: 'ignore', ...opts }); kids.push(c); return c; };
const cleanup = () => { for (const c of kids){ try { c.kill('SIGKILL'); } catch {} } };
process.on('exit', cleanup);

// --- static server + headless chrome ---
spawnBg('python3', ['-m', 'http.server', String(PORT)], { cwd: 'public' });
spawnBg(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${DBG}`, '--window-size=480,1200',
  `--user-data-dir=${path.join(OUT, 'profile')}`, 'about:blank']);
await sleep(2200);

// --- minimal CDP client ---
async function pageWsUrl(){
  for (let i = 0; i < 30; i++){
    try {
      const list = await (await fetch(`http://localhost:${DBG}/json`)).json();
      const p = list.find(t => t.type === 'page');
      if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no page target — is Chrome up?');
}
class CDP {
  constructor(ws){
    this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)){ this.pending.get(m.id)(m); this.pending.delete(m.id); }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
        this.errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
      if (m.method === 'Runtime.exceptionThrown')
        this.errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
        this.errors.push('log: ' + m.params.entry.text);
    });
  }
  send(method, params = {}){
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise(res => this.pending.set(id, res));
  }
}
const ws = new WebSocket(await pageWsUrl());
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
const cdp = new CDP(ws);
await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');

const shot = async (name) => {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64'));
};
const ev = async (expr) => (await cdp.send('Runtime.evaluate',
  { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const go = async (url) => { await cdp.send('Page.navigate', { url: `http://localhost:${PORT}${url}` }); await sleep(1300); };

// --- scenarios ---
await go('/td/games/neon-defense/');
await shot('neon-title');
await ev(`document.getElementById('btn-start').click()`);
await sleep(600);
await shot('neon-tutorial');
await ev(`(document.getElementById('tut-ok')||{click(){}}).click()`);
await sleep(300);
await ev(`selectPlaceTower && selectPlaceTower('pulse')`);
await ev(`(()=>{for(let y=0;y<20;y++)for(let x=0;x<15;x++){if(typeof canPlace==='function'&&canPlace(x,y)){handleCellClick({cx:x,cy:y,px:x*32+16,py:y*32+16});return;}}})()`);
await sleep(300);
await shot('neon-ingame');

await go('/td/games/roll-defense/');
await shot('roll-title-or-tutorial');
await ev(`(document.getElementById('btn-start')||{click(){}}).click()`);
await sleep(500);
await shot('roll-after-start');

const real = cdp.errors.filter(e => !/favicon|status of 404/.test(e));
ws.close();
console.log(`\nscreenshots: ${OUT}`);
console.log(`console errors (excl. favicon 404): ${real.length}`);
for (const e of real.slice(0, 10)) console.log('  ! ' + e);
cleanup();
process.exit(real.length ? 1 : 0);
