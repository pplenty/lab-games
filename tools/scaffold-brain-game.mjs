import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function usage() {
  console.error(`Usage:
  npm run game:new -- --id slug --title "게임 제목" --short "짧은 설명" --tags logic,focus [--icon "?" --duration "2분" --accent "#2f7d62"]
`);
}

function assertSlug(slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`invalid slug: ${slug}`);
  }
}

function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildGameHtml({ slug, title, short, icon, accent }) {
  const safeTitle = htmlEscape(title);
  const safeShort = htmlEscape(short);
  const safeIcon = htmlEscape(icon);
  const jsTitle = JSON.stringify(title);
  const jsShort = JSON.stringify(short);
  const jsSlug = JSON.stringify(slug);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle} | 5분 퍼즐</title>
<meta name="description" content="${safeShort}">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeShort}">
<link rel="canonical" href="https://games.jdgrid.com/brain/games/${slug}/">
<link rel="stylesheet" href="../../shared/core.css">
<style>
  :root{ --accent:${accent}; --accent-dark:${accent}; --accent-soft:#dbece4; }
  .prompt-box{ text-align:center; font-size:24px; font-weight:800; margin:16px 0; }
  .choice-grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .choice-grid .btn{ width:100%; padding-inline:12px; }
  .result-line{ text-align:center; color:var(--ink-dim); min-height:28px; margin-top:14px; }
  @media(max-width:420px){ .choice-grid{ grid-template-columns:1fr; } }
</style>
</head>
<body>
<main>
  <div id="app"></div>
</main>
<script src="../../shared/engine.js"></script>
<script>
const { $el, clear, loadStats, recordBestScore, injectBackLink, shareToClipboard } = Brain;
injectBackLink('../../');

const GAME_ID = ${jsSlug};
const GAME_TITLE = ${jsTitle};
const GAME_SHORT = ${jsShort};
const STORAGE_KEY = GAME_ID + '_stats';

let score = 0;
let round = 0;
let answer = null;

function makeRound(){
  const a = 2 + Math.floor(Math.random() * 18);
  const b = 2 + Math.floor(Math.random() * 18);
  answer = a + b;
  const options = Brain.shuffle([answer, answer + 1, answer - 1, answer + 2]).filter((v, i, arr) => arr.indexOf(v) === i);
  return { prompt: a + ' + ' + b, options };
}

function renderHome(){
  clear();
  const stats = loadStats(STORAGE_KEY, { played: 0, bestScore: 0 });
  const root = document.getElementById('app');
  const wrap = $el('section', '', '');
  wrap.innerHTML =
    '<div id="title-screen">' +
      '<div class="brand-icon">${safeIcon}</div>' +
      '<h1 class="hero-title">' + Brain.escapeHtml(GAME_TITLE) + '</h1>' +
      '<p class="hero-sub">' + Brain.escapeHtml(GAME_SHORT) + '</p>' +
      '<div class="today-card"><div class="today-label">BEST</div><div class="today-date">' + (stats.bestScore || 0) + '점</div></div>' +
      '<button class="btn" id="start-btn">시작</button>' +
    '</div>';
  root.appendChild(wrap);
  document.getElementById('start-btn').onclick = start;
}

function start(){
  score = 0;
  round = 0;
  renderRound();
}

function renderRound(message){
  clear();
  round += 1;
  if (round > 10) return renderResult();
  const data = makeRound();
  const root = document.getElementById('app');
  const card = $el('section', 'card', '');
  card.innerHTML =
    '<div class="topbar"><span>' + round + ' / 10</span><span class="stat">' + score + '점</span></div>' +
    '<h1 class="title">' + Brain.escapeHtml(GAME_TITLE) + '</h1>' +
    '<p class="puzzle-desc">' + Brain.escapeHtml(GAME_SHORT) + '</p>' +
    '<div class="prompt-box">' + Brain.escapeHtml(data.prompt) + '</div>' +
    '<div class="choice-grid" id="choices"></div>' +
    '<div class="result-line">' + Brain.escapeHtml(message || '') + '</div>';
  root.appendChild(card);

  const choices = document.getElementById('choices');
  for (const value of data.options) {
    const btn = $el('button', 'btn secondary', String(value));
    btn.onclick = () => {
      if (value === answer) {
        score += 10;
        renderRound('정답');
      } else {
        renderRound('오답');
      }
    };
    choices.appendChild(btn);
  }
}

function renderResult(){
  clear();
  const stats = recordBestScore(STORAGE_KEY, score);
  const root = document.getElementById('app');
  const card = $el('section', 'card', '');
  card.innerHTML =
    '<h1 class="title">결과</h1>' +
    '<div class="score-hero">' + score + '점</div>' +
    '<p class="puzzle-desc">최고 기록: ' + (stats.bestScore || score) + '점</p>' +
    '<div class="btn-row">' +
      '<button class="btn" id="again-btn">다시</button>' +
      '<button class="btn secondary" id="share-btn">공유</button>' +
    '</div>';
  root.appendChild(card);
  document.getElementById('again-btn').onclick = start;
  document.getElementById('share-btn').onclick = (event) => {
    shareToClipboard(GAME_TITLE + ' ' + score + '점 https://games.jdgrid.com/brain/games/' + GAME_ID + '/', event.currentTarget);
  };
}

renderHome();
</script>
</body>
</html>
`;
}

const args = parseArgs(process.argv.slice(2));
const slug = args.id || args.slug;
const title = args.title;
const short = args.short;
const icon = args.icon || '?';
const duration = args.duration || '2~3분';
const accent = args.accent || '#2f7d62';
const tags = String(args.tags || '')
  .split(',')
  .map((tag) => tag.trim())
  .filter(Boolean);

if (!slug || !title || !short || tags.length === 0) {
  usage();
  process.exit(1);
}

assertSlug(slug);

const registryPath = 'public/brain/games.json';
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const categories = registry.categories || {};
const unknownTags = tags.filter((tag) => !categories[tag]);

if (unknownTags.length > 0) {
  console.error(`unknown tags: ${unknownTags.join(', ')}`);
  console.error(`available tags: ${Object.keys(categories).join(', ')}`);
  process.exit(1);
}

if (registry.games.some((game) => game.id === slug || game.slug === slug)) {
  console.error(`game already exists in registry: ${slug}`);
  process.exit(1);
}

const gameDir = path.join('public/brain/games', slug);
await mkdir(gameDir, { recursive: false });

await writeFile(path.join(gameDir, 'index.html'), buildGameHtml({ slug, title, short, icon, accent }));

registry.games.push({
  id: slug,
  title,
  short,
  icon,
  tags,
  tagLabels: tags.slice(0, 3).map((tag) => categories[tag].label),
  accent,
  duration,
  slug,
  path: `games/${slug}/`
});

await writeFile(registryPath, JSON.stringify(registry, null, 2) + '\n');

console.log(`created public/brain/games/${slug}/index.html`);
console.log(`registered /brain/games/${slug}/`);
