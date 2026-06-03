import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const requiredFiles = [
  'public/index.html',
  'public/_redirects',
  'public/site.css',
  'public/robots.txt',
  'public/sitemap.xml',
  'public/brain/index.html',
  'public/brain/games.json',
  'public/brain/privacy/index.html',
  'public/brain/shared/core.css',
  'public/brain/shared/engine.js',
  'public/narrative/index.html',
  'public/narrative/mailbox/index.html',
  'public/narrative/phone-call/index.html'
];

const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.txt',
  '.xml'
]);

const issues = [];
const warnings = [];   // non-fatal: things that are expected during WIP (e.g. a
                       // game listed in games.json before its file is committed)

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function addIssue(message) {
  issues.push(message);
}

function stripHashAndQuery(value) {
  return value.split('#')[0].split('?')[0];
}

function shouldCheckAsset(value) {
  return value &&
    !value.startsWith('#') &&
    !/^(https?:|mailto:|tel:|data:|javascript:)/.test(value);
}

async function checkLinkedAsset(sourceFile, rawValue) {
  if (!shouldCheckAsset(rawValue)) return;

  const value = stripHashAndQuery(rawValue);
  if (!value) return;

  const target = value.startsWith('/')
    ? path.join('public', value)
    : path.normalize(path.join(path.dirname(sourceFile), value));

  const candidates = value.endsWith('/') || path.extname(value) === ''
    ? [path.join(target, 'index.html'), target]
    : [target];

  for (const candidate of candidates) {
    if (await exists(candidate)) return;
  }

  addIssue(`${sourceFile}: broken local asset/link ${rawValue}`);
}

for (const file of requiredFiles) {
  if (!(await exists(file))) addIssue(`missing required file: ${file}`);
}

const brain = JSON.parse(await readFile('public/brain/games.json', 'utf8'));
const categories = brain.categories || {};
const categoryKeys = new Set(Object.keys(categories));
const seenIds = new Set();
const seenSlugs = new Set();
const seenPaths = new Set();

if (!brain.site || brain.site.url !== 'https://games.jdgrid.com/brain') {
  addIssue('public/brain/games.json: site.url must be https://games.jdgrid.com/brain');
}

if (brain.$schema) {
  addIssue('public/brain/games.json: remove stale $schema references unless the schema file is public');
}

if (Object.keys(categories).length === 0) {
  addIssue('public/brain/games.json: categories must not be empty');
}

for (const game of brain.games || []) {
  const label = game.id || game.slug || '(unknown game)';

  for (const field of ['id', 'title', 'short', 'icon', 'slug', 'path']) {
    if (!game[field]) addIssue(`public/brain/games.json: ${label} missing ${field}`);
  }

  if (game.file) addIssue(`public/brain/games.json: ${label} still uses legacy file field`);
  if (game.id && seenIds.has(game.id)) addIssue(`public/brain/games.json: duplicate id ${game.id}`);
  if (game.slug && seenSlugs.has(game.slug)) addIssue(`public/brain/games.json: duplicate slug ${game.slug}`);
  if (game.path && seenPaths.has(game.path)) addIssue(`public/brain/games.json: duplicate path ${game.path}`);

  seenIds.add(game.id);
  seenSlugs.add(game.slug);
  seenPaths.add(game.path);

  if (game.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game.slug)) {
    addIssue(`public/brain/games.json: invalid slug ${game.slug}`);
  }

  if (game.slug && game.path !== `games/${game.slug}/`) {
    addIssue(`public/brain/games.json: ${label} path must be games/${game.slug}/`);
  }

  if (!Array.isArray(game.tags) || game.tags.length === 0) {
    addIssue(`public/brain/games.json: ${label} must have at least one tag`);
  } else {
    for (const tag of game.tags) {
      if (!categoryKeys.has(tag)) addIssue(`public/brain/games.json: ${label} unknown tag ${tag}`);
    }
  }

  const gameFile = `public/brain/${game.path || ''}index.html`;
  // A listed-but-missing file is usually WIP (game added to games.json before
  // its index.html is committed) — warn, don't fail. Broken in-page asset
  // links are still hard-failed by checkLinkedAsset below.
  if (!(await exists(gameFile))) warnings.push(`game listed but file not committed (WIP?): ${gameFile}`);
}

const publicFiles = await walk('public');
const textFiles = publicFiles.filter((file) => {
  return textExtensions.has(path.extname(file)) || path.basename(file) === '_redirects';
});

for (const file of textFiles) {
  const content = await readFile(file, 'utf8');

  if (/your-domain\.com|your-email@example\.com/.test(content)) {
    addIssue(`${file}: contains deployment placeholder`);
  }

  if (/<loc>[^<]*\.html(?:[#?][^<]*)?<\/loc>/.test(content)) {
    addIssue(`${file}: sitemap loc exposes .html URL`);
  }

  const publicHtmlLinkPattern = /\b(?:href|src)=["'][^"']*\.html(?:[#?][^"']*)?["']/g;
  const htmlLinkMatches = content.match(publicHtmlLinkPattern);
  if (htmlLinkMatches) {
    addIssue(`${file}: exposes .html link ${htmlLinkMatches[0]}`);
  }

  if (file.endsWith('.html')) {
    const attrPattern = /\b(?:href|src)=["']([^"']+)["']/g;
    for (const match of content.matchAll(attrPattern)) {
      await checkLinkedAsset(file, match[1]);
    }
  }
}

const redirects = await readFile('public/_redirects', 'utf8');
for (const pattern of [
  '/brain/privacy.html /brain/privacy/ 301',
  '/brain/games/:slug.html /brain/games/:slug/ 301',
  '/narrative/mailbox.html /narrative/mailbox/ 301',
  '/narrative/phone-call.html /narrative/phone-call/ 301'
]) {
  if (!redirects.includes(pattern)) addIssue(`public/_redirects: missing ${pattern}`);
}

if (warnings.length > 0) {
  console.warn(`site check warnings (${warnings.length}, non-fatal):`);
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (issues.length > 0) {
  console.error('site check failed:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`site check passed: ${brain.games.length} brain games, ${Object.keys(categories).length} categories` +
  (warnings.length ? ` (${warnings.length} non-fatal warnings)` : ''));

