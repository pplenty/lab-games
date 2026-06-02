/* td-core.js — shared low-level helpers for the TD games (games.jdgrid.com/td).
 *
 * Loaded as a classic <script> *before* each game's inline <script>, so these
 * top-level function declarations are plain globals the game code calls
 * directly (setText(...), tdOffscreen(...), …). No bundler, no modules.
 *
 * These are the exact patterns that were being hand-copied between
 * roll-defense and neon-defense; centralising them here means the next game
 * just adds the <script> tag instead of re-porting them.
 */

/* ---- DOM dirty-check: skip element writes whose value didn't change, to cut
 * per-frame layout/style recalculation. Each helper caches the last value on
 * the element under a private key. ---- */
function setText(el, v){ if (el && el._t !== v){ el._t = v; el.textContent = v; } }
function setDisabled(el, v){ if (el && el._d !== v){ el._d = v; el.disabled = v; } }
function setStyleProp(el, prop, v){ if (!el) return; const k = '_sp_' + prop; if (el[k] !== v){ el[k] = v; el.style[prop] = v; } }
function setClass(el, cls, on){ if (!el) return; const k = '_cls_' + cls; if (el[k] !== on){ el[k] = on; el.classList.toggle(cls, on); } }

/* ---- DPR-aware canvas helpers ---- */
// Device-pixel ratio capped (default 1.5) so high-DPR screens don't blow up
// per-frame pixel throughput.
function tdDpr(cap){ return Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, cap || 1.5); }

// Create an offscreen canvas backed at DPR resolution but pre-scaled so all
// drawing uses CSS-pixel coordinates. Returns { canvas, ctx, dpr }.
function tdOffscreen(cssW, cssH, cap){
  const dpr = tdDpr(cap);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(cssW * dpr);
  canvas.height = Math.ceil(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { canvas, ctx, dpr };
}

// Bake a sprite once into an offscreen canvas and return it for repeated blits.
// drawFn(ctx, cssW, cssH) draws in CSS-pixel coordinates.
function tdMakeSprite(cssW, cssH, drawFn, cap){
  const off = tdOffscreen(cssW, cssH, cap);
  drawFn(off.ctx, cssW, cssH);
  return off.canvas;
}

/* ---- Touch input: drag-to-aim, lift-to-commit ----
 * Desktop hovers to preview (range ring / valid slot) then clicks; touch had
 * no aim phase (tap committed instantly, blind under the finger). This binds
 * touchstart/move/end so the preview tracks the finger and commits on lift —
 * a plain tap still commits at one spot. mapFn(clientX, clientY) → local point
 * (the game's existing clientToLocal/clientToCell). cbs: { aim(pt), commit(pt),
 * end() }. Suppresses scroll + the synthetic 300ms click. */
function tdBindTouch(canvas, mapFn, cbs){
  let active = false, last = null;
  const at = (touch) => mapFn(touch.clientX, touch.clientY);
  canvas.addEventListener('touchstart', (e) => {
    if (!e.touches[0]) return;
    e.preventDefault();
    active = true; last = at(e.touches[0]);
    if (cbs.aim) cbs.aim(last);
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (!active || !e.touches[0]) return;
    e.preventDefault();
    last = at(e.touches[0]);
    if (cbs.aim) cbs.aim(last);
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    if (!active) return;
    e.preventDefault();
    active = false;
    if (last && cbs.commit) cbs.commit(last);
    if (cbs.end) cbs.end();
  }, { passive: false });
  canvas.addEventListener('touchcancel', () => { active = false; if (cbs.end) cbs.end(); });
}

/* ---- Web Audio SFX synth (no asset files) ----
 * Returns a small controller: lazy AudioContext, persisted mute (per game via
 * storageKey), and tone(freq, dur, type, vol, slideTo) — a single decaying
 * oscillator with an optional exponential frequency slide. Games build their
 * named SFX set on top of controller.tone(). */
function tdAudio(storageKey){
  let ctx = null;
  let muted = (function(){ try { return localStorage.getItem(storageKey) === '1'; } catch(e){ return false; } })();
  function ac(){
    if (!ctx){ try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){ ctx = null; } }
    return ctx;
  }
  return {
    get muted(){ return muted; },
    resume(){ const c = ac(); if (c && c.state === 'suspended') c.resume(); },
    toggleMute(){ muted = !muted; try { localStorage.setItem(storageKey, muted ? '1' : '0'); } catch(e){} return muted; },
    tone(freq, dur, type, vol, slideTo){
      if (muted) return;
      const c = ac(); if (!c) return;
      const t0 = c.currentTime;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
      g.gain.setValueAtTime(Math.max(0.0001, vol || 0.08), t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    }
  };
}

// Defensive: also hang them off window (classic-script fn decls are already
// global, but this keeps them reachable if the file is ever wrapped/imported).
if (typeof window !== 'undefined'){
  window.setText = setText; window.setDisabled = setDisabled;
  window.setStyleProp = setStyleProp; window.setClass = setClass;
  window.tdDpr = tdDpr; window.tdOffscreen = tdOffscreen; window.tdMakeSprite = tdMakeSprite;
  window.tdBindTouch = tdBindTouch; window.tdAudio = tdAudio;
}
