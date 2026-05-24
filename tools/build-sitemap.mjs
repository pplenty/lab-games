import { readFile, writeFile } from 'node:fs/promises';

const baseUrl = 'https://games.jdgrid.com';

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderUrlset(urls) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => [
      '  <url>',
      `    <loc>${xmlEscape(url.loc)}</loc>`,
      `    <changefreq>${url.changefreq}</changefreq>`,
      `    <priority>${url.priority}</priority>`,
      '  </url>'
    ].join('\n')),
    '</urlset>',
    ''
  ].join('\n');
}

const brain = JSON.parse(await readFile('public/brain/games.json', 'utf8'));

const rootUrls = [
  { loc: `${baseUrl}/`, changefreq: 'weekly', priority: '1.0' },
  { loc: `${baseUrl}/brain/`, changefreq: 'daily', priority: '0.9' },
  { loc: `${baseUrl}/brain/privacy/`, changefreq: 'yearly', priority: '0.2' },
  ...brain.games.map((game) => ({
    loc: `${baseUrl}/brain/${game.path}`,
    changefreq: 'weekly',
    priority: '0.7'
  })),
  { loc: `${baseUrl}/narrative/`, changefreq: 'monthly', priority: '0.6' },
  { loc: `${baseUrl}/narrative/mailbox/`, changefreq: 'monthly', priority: '0.5' },
  { loc: `${baseUrl}/narrative/phone-call/`, changefreq: 'monthly', priority: '0.5' }
];

const brainUrls = [
  { loc: `${baseUrl}/brain/`, changefreq: 'daily', priority: '1.0' },
  ...brain.games.map((game) => ({
    loc: `${baseUrl}/brain/${game.path}`,
    changefreq: 'weekly',
    priority: '0.8'
  }))
];

await writeFile('public/sitemap.xml', renderUrlset(rootUrls));
await writeFile('public/brain/sitemap.xml', renderUrlset(brainUrls));

console.log(`sitemap generated: ${rootUrls.length} URLs`);
