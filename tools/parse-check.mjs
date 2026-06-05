/* Parse-check every inline <script> in the TD game pages (and td-core.js).
 * Catches syntax errors introduced by edits before they ship — the kind of
 * breakage check-site.mjs (structure/links only) never sees.
 *   node tools/parse-check.mjs
 * Exit 1 on any parse failure. Extend TARGET_GLOBS to cover more pages.
 */
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';

const GAME_DIR = 'public/td/games';
const EXTRA_PAGES = ['public/rogue/index.html'];     // single-file games outside td/games
const EXTRA_FILES = ['public/td/lib/td-core.js'];   // shared module (if present)

async function gamePages(){
  let dirs = [];
  try { dirs = await readdir(GAME_DIR, { withFileTypes: true }); }
  catch { return []; }
  return dirs.filter(d => d.isDirectory()).map(d => path.join(GAME_DIR, d.name, 'index.html'));
}

function extractScripts(html){
  // inline <script> blocks only (skip <script src=...>)
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))){
    if (/\bsrc\s*=/.test(m[1])) continue;
    out.push(m[2]);
  }
  return out;
}

async function exists(p){ try { await readFile(p); return true; } catch { return false; } }

const failures = [];
let checked = 0;

// 1) inline game scripts (td games + standalone pages)
for (const page of [...await gamePages(), ...EXTRA_PAGES]){
  let html;
  try { html = await readFile(page, 'utf8'); }
  catch { continue; }
  const scripts = extractScripts(html);
  if (scripts.length === 0){ failures.push(`${page}: no inline <script> found`); continue; }
  scripts.forEach((code, i) => {
    checked++;
    try { new vm.Script(code, { filename: `${page}#script[${i}]` }); }
    catch (e){ failures.push(`${page}#script[${i}]: ${e.message}`); }
  });
}

// 2) standalone shared modules
for (const f of EXTRA_FILES){
  if (!(await exists(f))) continue;
  const code = await readFile(f, 'utf8');
  checked++;
  try { new vm.Script(code, { filename: f }); }
  catch (e){ failures.push(`${f}: ${e.message}`); }
}

if (failures.length){
  console.error('parse-check FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`parse-check passed: ${checked} script blocks OK`);
