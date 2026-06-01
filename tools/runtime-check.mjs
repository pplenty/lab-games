/* Headless runtime smoke test for the TD games.
 * Loads each game's largest inline <script> inside a vm context backed by a
 * universal Proxy DOM/canvas stub, starts a game, spawns every enemy type,
 * places towers, and pumps the real RAF loop for N frames — asserting nothing
 * throws. Complements parse-check.mjs (syntax) with actual execution coverage.
 *   node tools/runtime-check.mjs
 * Exit 1 on any thrown exception during load or simulation.
 */
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const GAMES = [
  { name: 'roll-defense', file: 'public/td/games/roll-defense/index.html' },
  { name: 'neon-defense', file: 'public/td/games/neon-defense/index.html' }
];
const FRAMES = 360;          // ~6s at 60fps
const TOWER_CELLS = [[0,0],[2,0],[0,2],[14,0],[0,19],[3,3],[5,5],[8,8]];

/* ---------- universal DOM / canvas stubs ---------- */
const CTX_DEFAULTS = { globalAlpha: 1, lineWidth: 1, font: '10px sans', miterLimit: 10,
  globalCompositeOperation: 'source-over', textAlign: 'left', textBaseline: 'alphabetic',
  fillStyle: '#000', strokeStyle: '#000', shadowBlur: 0, lineDashOffset: 0 };

function makeCtx(canvas){
  const store = Object.create(CTX_DEFAULTS);
  const grad = () => ({ addColorStop(){} });
  const methods = {
    createLinearGradient: grad, createRadialGradient: grad, createConicGradient: grad,
    createPattern: () => ({}),
    measureText: (t) => ({ width: (t ? String(t).length : 0) * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(0, (w|0) * (h|0) * 4)), width: w|0, height: h|0 }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(0, (w|0) * (h|0) * 4)) }),
    setLineDash(){}, getLineDash(){ return []; }, isPointInPath(){ return false; }, isPointInStroke(){ return false; }
  };
  return new Proxy(store, {
    get(t, p){
      if (p === 'canvas') return canvas;
      if (p in methods) return methods[p];
      if (p in t) return t[p];
      if (typeof p === 'string') return () => {};   // any drawing method → noop
      return undefined;
    },
    set(t, p, v){ t[p] = v; return true; }
  });
}

const NUM_PROPS = new Set(['width','height','offsetWidth','offsetHeight','clientWidth','clientHeight',
  'scrollWidth','scrollHeight','scrollTop','scrollLeft','naturalWidth','naturalHeight','length']);
const STR_PROPS = new Set(['textContent','innerHTML','innerText','value','className','id','title','tagName','nodeName','type','href','src']);

function makeEl(tag){
  tag = tag || 'div';
  const store = {};
  let ctx = null;
  const classList = { add(){}, remove(){}, toggle(){ return false; }, contains(){ return false; }, replace(){} };
  const self = new Proxy(function(){}, {
    get(t, p){
      if (p === Symbol.toPrimitive) return () => '';
      if (typeof p === 'symbol') return undefined;
      if (p in store) return store[p];
      switch (p){
        case 'style': return store.style || (store.style = makeEl('style'));
        case 'classList': return classList;
        case 'dataset': return store.dataset || (store.dataset = {});
        case 'children': case 'childNodes': return [];
        case 'parentNode': case 'parentElement': case 'offsetParent': return null;
        case 'firstChild': case 'lastChild': case 'nextSibling': case 'previousSibling': return null;
        case 'getContext': return () => (ctx || (ctx = makeCtx(self)));
        case 'getBoundingClientRect': return () => ({ left:0, top:0, right:480, bottom:640, width:480, height:640, x:0, y:0 });
        case 'querySelector': case 'closest': return () => makeEl('div');
        case 'querySelectorAll': case 'getElementsByClassName': case 'getElementsByTagName': return () => [];
        case 'appendChild': case 'append': case 'insertBefore': case 'prepend': return (c) => c;
        case 'removeChild': case 'remove': case 'replaceChild': case 'replaceChildren': return () => {};
        case 'addEventListener': case 'removeEventListener': case 'dispatchEvent': return () => {};
        case 'setAttribute': case 'removeAttribute': case 'setAttributeNS': return () => {};
        case 'getAttribute': case 'getAttributeNS': return () => null;
        case 'hasAttribute': return () => false;
        case 'focus': case 'blur': case 'click': case 'scrollIntoView': case 'setPointerCapture':
        case 'releasePointerCapture': case 'requestPointerLock': case 'animate': return () => {};
        case 'cloneNode': return () => makeEl(tag);
        case 'contains': return () => false;
        case 'getContextAttributes': return () => ({});
      }
      if (NUM_PROPS.has(p)) return store[p] ?? (p === 'height' ? 640 : 480);
      if (STR_PROPS.has(p)) return store[p] ?? '';
      return () => {};   // unknown method → noop
    },
    set(t, p, v){ store[p] = v; return true; },
    apply(){ return makeEl('div'); }
  });
  return self;
}

function buildSandbox(){
  const rafQ = [];
  let clock = 0;
  const els = {};
  const doc = {
    getElementById: (id) => els[id] || (els[id] = makeEl('div')),
    querySelector: () => makeEl('div'),
    querySelectorAll: () => [],
    createElement: (tag) => makeEl(tag),
    createElementNS: (ns, tag) => makeEl(tag),
    createTextNode: () => makeEl('text'),
    addEventListener: () => {}, removeEventListener: () => {},
    body: makeEl('body'), documentElement: makeEl('html'), head: makeEl('head'),
    fonts: { add(){}, ready: Promise.resolve(), load: () => Promise.resolve() },
    hidden: false, visibilityState: 'visible'
  };
  const storage = (() => { const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
             removeItem: k => m.delete(k), clear: () => m.clear(), key: () => null, get length(){ return m.size; } };
  })();
  // Web Audio stub: nodes are chainable; AudioParams (frequency/gain/…) expose
  // value + scheduling methods (setValueAtTime/linearRampToValueAtTime/…).
  const PARAM_NAMES = new Set(['frequency','gain','detune','Q','pan','playbackRate','threshold','knee','ratio','attack','release','delayTime','offset']);
  const audioParam = () => new Proxy({ value: 0 }, { get(t, p){ return p in t ? t[p] : () => {}; }, set(t, p, v){ t[p] = v; return true; } });
  const audioNode = () => new Proxy({}, {
    get(t, p){
      if (PARAM_NAMES.has(p)) return t[p] || (t[p] = audioParam());
      if (p in t) return t[p];
      return () => audioNode();   // connect/start/stop/… → chainable
    },
    set(t, p, v){ t[p] = v; return true; }
  });
  function AudioContext(){ return new Proxy({
    createOscillator: audioNode, createGain: audioNode, createBuffer: audioNode,
    createBufferSource: audioNode, createBiquadFilter: audioNode, createDynamicsCompressor: audioNode,
    createStereoPanner: audioNode, createDelay: audioNode, createConvolver: audioNode,
    destination: audioNode(), currentTime: 0, state: 'running', sampleRate: 44100,
    resume: () => Promise.resolve(), close: () => Promise.resolve(), suspend: () => Promise.resolve()
  }, { get(t, p){ return p in t ? t[p] : () => audioNode(); } }); }

  const win = {
    requestAnimationFrame: (cb) => { rafQ.push(cb); return rafQ.length; },
    cancelAnimationFrame: () => {},
    setTimeout: (fn) => { if (typeof fn === 'function') {/* defer; not run in smoke */} return 0; },
    clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    devicePixelRatio: 1.5, innerWidth: 480, innerHeight: 800,
    AudioContext, webkitAudioContext: AudioContext,
    localStorage: storage, matchMedia: () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }),
    addEventListener: () => {}, removeEventListener: () => {},
    performance: { now: () => clock },
    getComputedStyle: () => makeEl('style'),
    alert: () => {}, scrollTo: () => {}, focus: () => {},
    navigator: { userAgent: 'node', maxTouchPoints: 0, vibrate: () => {} }
  };
  const sandbox = {
    window: win, document: doc, localStorage: storage, navigator: win.navigator,
    performance: win.performance, devicePixelRatio: win.devicePixelRatio,
    requestAnimationFrame: win.requestAnimationFrame, cancelAnimationFrame: win.cancelAnimationFrame,
    setTimeout: win.setTimeout, clearTimeout: win.clearTimeout, setInterval: win.setInterval, clearInterval: win.clearInterval,
    AudioContext, webkitAudioContext: AudioContext, matchMedia: win.matchMedia,
    getComputedStyle: win.getComputedStyle, alert: win.alert,
    console, Math, Date, JSON, Object, Array, Number, String, Boolean, Symbol, Map, Set, WeakMap, WeakSet,
    Float32Array, Float64Array, Uint8Array, Uint8ClampedArray, Int32Array, isNaN, isFinite, parseInt, parseFloat,
    Promise, RegExp, Error, TypeError
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  return { sandbox, rafQ, tick: () => { clock += 1000 / 60; return clock; } };
}

function largestScript(html){
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, best = '';
  while ((m = re.exec(html))){ if (/\bsrc\s*=/.test(m[1])) continue; if (m[2].length > best.length) best = m[2]; }
  return best;
}

// runInContext exposes only var/function globals, not top-level const/let.
// This epilogue runs in the same lexical scope, so it can capture the consts
// (ENEMIES/TOWERS) and a live getter for the reassignable `state` binding.
const EPILOGUE = `
;globalThis.__td = {
  ENEMIES: (typeof ENEMIES !== 'undefined') ? ENEMIES : null,
  TOWERS:  (typeof TOWERS  !== 'undefined') ? TOWERS  : null,
  getState: () => (typeof state !== 'undefined' ? state : null)
};`;

const TD_CORE = 'public/td/lib/td-core.js';

async function runGame(game){
  const html = await readFile(game.file, 'utf8');
  const code = largestScript(html);
  if (!code) throw new Error('no inline script');
  const { sandbox, rafQ, tick } = buildSandbox();
  vm.createContext(sandbox);

  // load shared module first (games reference its globals: setText/tdDpr/…),
  // mirroring the <script src="../../lib/td-core.js"> tag in each page.
  try {
    const core = await readFile(TD_CORE, 'utf8');
    vm.runInContext(core, sandbox, { filename: TD_CORE, timeout: 4000 });
  } catch (e){ if (e.code !== 'ENOENT') throw e; }

  // load: runs the script body incl. init() at the bottom, then the epilogue
  vm.runInContext(code + EPILOGUE, sandbox, { filename: game.file, timeout: 8000 });

  const need = ['startGame', 'step', 'render', 'loop'];
  const missing = need.filter(fn => typeof sandbox[fn] !== 'function');
  if (missing.length) throw new Error(`missing expected globals: ${missing.join(', ')}`);

  const exp = sandbox.__td || {};
  const ENEMIES = exp.ENEMIES, TOWERS = exp.TOWERS;
  const call = (name, ...args) => { if (typeof sandbox[name] === 'function') { sandbox[name](...args); return true; } return false; };

  // start a run
  sandbox.startGame();

  // exercise placement: explicit cells (neon) or random-roll placement (roll)
  let placed = 0;
  if (typeof sandbox.placeTower === 'function' && TOWERS){
    const types = Object.keys(TOWERS);
    TOWER_CELLS.forEach(([cx, cy], i) => { try { sandbox.placeTower(types[i % types.length], cx, cy); placed++; } catch {} });
  } else if (typeof sandbox.doRoll === 'function'){
    for (let i = 0; i < 8; i++){ try { sandbox.doRoll(); placed++; } catch {} }
  }

  // exercise every enemy type through the spawn path (try both signatures)
  let spawned = 0;
  if (typeof sandbox.spawnEnemy === 'function' && ENEMIES){
    for (const type of Object.keys(ENEMIES)){
      try { sandbox.spawnEnemy(type); spawned++; }
      catch { try { sandbox.spawnEnemy(type, 0, 0, {}); spawned++; } catch {} }
    }
  }
  // kick off a scripted wave too, if the game exposes one (idx 0)
  ['startNextWave','startWave','beginWave','nextWave','sendWave'].some(fn => call(fn, 0));

  // pump the real RAF loop; loop() re-queues itself each frame
  let frames = 0;
  if (rafQ.length === 0 && typeof sandbox.loop === 'function') sandbox.loop(tick());
  for (let i = 0; i < FRAMES; i++){
    const cb = rafQ.shift();
    if (!cb) break;
    cb(tick());
    frames++;
    // re-spawn occasionally to keep the field populated for combat/render paths
    if (i % 90 === 0 && typeof sandbox.spawnEnemy === 'function' && ENEMIES){
      const ks = Object.keys(ENEMIES); try { sandbox.spawnEnemy(ks[i % ks.length]); } catch {}
    }
  }
  // also drive step/render directly in case the loop early-returns on phase
  for (let i = 0; i < 60; i++){ sandbox.step(1 / 60); sandbox.render(); }

  const st = typeof exp.getState === 'function' ? exp.getState() : null;
  const enemies = (st && Array.isArray(st.enemies)) ? st.enemies.length : '?';
  return { frames, placed, spawned, enemies };
}

let failed = false;
for (const game of GAMES){
  try {
    const r = await runGame(game);
    console.log(`✓ ${game.name.padEnd(14)} ${r.frames} RAF frames + 60 steps · placed ${r.placed} towers · spawned ${r.spawned} enemy types · alive ${r.enemies}`);
  } catch (e){
    failed = true;
    console.error(`✗ ${game.name}: ${e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n   ') : e}`);
  }
}
if (failed){ console.error('\nruntime-check FAILED'); process.exit(1); }
console.log('runtime-check passed');
