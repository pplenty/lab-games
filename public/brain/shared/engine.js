/* =========================================================
   5분 퍼즐 — Shared Engine
   공통 유틸리티. 각 게임은 window.Brain.* 로 접근한다.
   ========================================================= */

(function (global) {
  'use strict';

  /* ---------- PRNG ---------- */
  function mulberry32(seed){
    return function(){
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function todaySeed(){
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  function randomSeed(){
    return (Date.now() & 0xffffffff) ^ Math.floor(Math.random() * 0x7fffffff);
  }
  function shuffle(arr, rng){
    const a = [...arr];
    rng = rng || Math.random;
    for (let i = a.length - 1; i > 0; i--){
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function seededPick(arr, rng){
    return arr[Math.floor(rng() * arr.length)];
  }
  function rand(rng, lo, hi){
    return lo + Math.floor(rng() * (hi - lo + 1));
  }

  /* ---------- Time formatting ---------- */
  function formatMs(ms){
    return (ms / 1000).toFixed(2) + 's';
  }
  function formatClock(ms){
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const ss = (s % 60).toString().padStart(2, '0');
    return m + ':' + ss;
  }
  function todayDateString(){
    return new Date().toISOString().slice(0, 10);
  }
  function todayPretty(){
    return todayDateString().replace(/-/g, '.');
  }

  /* ---------- LocalStorage ---------- */
  function loadStats(key, defaults){
    try {
      const raw = localStorage.getItem(key);
      return raw ? Object.assign({}, defaults || {}, JSON.parse(raw)) : Object.assign({}, defaults || {});
    } catch (e) { return Object.assign({}, defaults || {}); }
  }
  function saveStats(key, stats){
    try { localStorage.setItem(key, JSON.stringify(stats)); } catch (e) {}
  }
  function recordBestScore(key, score, extra){
    const s = loadStats(key, { played: 0, bestScore: 0, recent: [] });
    s.played = (s.played || 0) + 1;
    if (score > (s.bestScore || 0)) s.bestScore = score;
    const entry = Object.assign({ score }, extra || {});
    s.recent = [entry].concat(s.recent || []).slice(0, 5);
    saveStats(key, s);
    return s;
  }
  function recordBestTime(key, ms, extra){
    const s = loadStats(key, { played: 0, bestMs: null, recent: [] });
    s.played = (s.played || 0) + 1;
    if (s.bestMs == null || ms < s.bestMs) s.bestMs = ms;
    const entry = Object.assign({ ms }, extra || {});
    s.recent = [entry].concat(s.recent || []).slice(0, 5);
    saveStats(key, s);
    return s;
  }
  function bumpStreak(key){
    const s = loadStats(key, { count: 0, last: null, maxStreak: 0 });
    const today = todayDateString();
    if (s.last === today) return s;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    s.count = (s.last === yesterday) ? (s.count || 0) + 1 : 1;
    if (s.count > (s.maxStreak || 0)) s.maxStreak = s.count;
    s.last = today;
    saveStats(key, s);
    return s;
  }
  function resetStreak(key){
    const s = loadStats(key, { count: 0, last: null, maxStreak: 0 });
    s.count = 0;
    s.last = todayDateString();
    saveStats(key, s);
    return s;
  }

  /* ---------- DOM helpers ---------- */
  function $el(tag, cls, html){
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function clear(root){
    (root || document.getElementById('app')).innerHTML = '';
  }
  function escapeHtml(t){
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------- Scoring ---------- */
  function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }
  function gradeFor(avg){
    if (avg >= 90) return { grade: 'S', label: '탁월함',   color: 'var(--green-dark)' };
    if (avg >= 75) return { grade: 'A', label: '훌륭함',   color: 'var(--accent-dark)' };
    if (avg >= 60) return { grade: 'B', label: '좋음',     color: 'var(--blue)' };
    if (avg >= 40) return { grade: 'C', label: '준비 중',   color: 'var(--purple)' };
    return              { grade: 'D', label: '재도전',     color: 'var(--ink-dim)' };
  }

  /* ---------- Share (clipboard) ---------- */
  function shareToClipboard(text, btnEl){
    if (!navigator.clipboard) {
      try { prompt('아래 텍스트를 복사해 공유해주세요', text); } catch(e) {}
      return;
    }
    navigator.clipboard.writeText(text).then(function (){
      if (btnEl) {
        const orig = btnEl.textContent;
        btnEl.textContent = '✓ 복사됨';
        setTimeout(function (){ btnEl.textContent = orig; }, 1500);
      }
    });
  }

  /* ---------- Nav (back-to-portal link) ---------- */
  function injectBackLink(href){
    const link = $el('a', 'nav-back');
    link.href = href || '../../';
    link.textContent = '← 홈';
    document.body.appendChild(link);
  }

  /* ---------- Safe expression evaluator (for arithmetic games) ---------- */
  function evalSafeExpr(expr, required){
    if (!/^[\d+\-*/() .]+$/.test(expr)) {
      return { ok: false, reason: '숫자와 연산자만 사용할 수 있어요.' };
    }
    if (required) {
      const nums = (expr.match(/\d+/g) || []).map(Number);
      const a = [...required].sort((x, y) => x - y).join(',');
      const b = [...nums].sort((x, y) => x - y).join(',');
      if (a !== b) return { ok: false, reason: '주어진 숫자를 한 번씩 모두 사용해주세요.' };
    }
    try {
      const val = Function('"use strict";return (' + expr + ')')();
      if (typeof val !== 'number' || !isFinite(val)) {
        return { ok: false, reason: '평가 불가' };
      }
      return { ok: true, value: val };
    } catch (e) {
      return { ok: false, reason: '수식 오류' };
    }
  }

  /* ---------- Pipeline runner (for multi-puzzle games like warmup/stretch) ---------- */
  function createRunner(steps, rootEl){
    const state = {
      steps: steps,
      idx: 0,
      results: [],
      root: rootEl || document.getElementById('app')
    };
    function renderTopbar(){
      const tb = $el('div', 'topbar');
      const dots = state.steps.map(function (_, i){
        let cls = 'dot';
        if (i < state.idx) cls += ' done';
        else if (i === state.idx) cls += ' active';
        return '<span class="' + cls + '"></span>';
      }).join('');
      tb.innerHTML =
        '<div>퍼즐 ' + (state.idx + 1) + ' / ' + state.steps.length + '</div>' +
        '<div class="progress-dots">' + dots + '</div>';
      return tb;
    }
    function next(){
      if (state.idx >= state.steps.length){
        if (state.onComplete) state.onComplete(state.results);
        return;
      }
      clear(state.root);
      state.root.appendChild(renderTopbar());
      const step = state.steps[state.idx];
      const started = performance.now();
      step.run(function (score){
        state.results.push({
          id: step.id,
          title: step.title,
          icon: step.icon,
          score: clamp(Math.round(score), 0, 100),
          time: performance.now() - started
        });
        state.idx++;
        setTimeout(next, 380);
      });
    }
    state.start = next;
    return state;
  }

  /* ---------- Public API ---------- */
  global.Brain = {
    // PRNG
    mulberry32: mulberry32,
    todaySeed: todaySeed,
    randomSeed: randomSeed,
    shuffle: shuffle,
    seededPick: seededPick,
    rand: rand,
    // Time
    formatMs: formatMs,
    formatClock: formatClock,
    todayDateString: todayDateString,
    todayPretty: todayPretty,
    // Storage
    loadStats: loadStats,
    saveStats: saveStats,
    recordBestScore: recordBestScore,
    recordBestTime: recordBestTime,
    bumpStreak: bumpStreak,
    resetStreak: resetStreak,
    // DOM
    $el: $el,
    clear: clear,
    escapeHtml: escapeHtml,
    // Scoring
    clamp: clamp,
    gradeFor: gradeFor,
    // Share
    shareToClipboard: shareToClipboard,
    // Nav
    injectBackLink: injectBackLink,
    // Eval
    evalSafeExpr: evalSafeExpr,
    // Pipeline
    createRunner: createRunner
  };
})(typeof window !== 'undefined' ? window : globalThis);
