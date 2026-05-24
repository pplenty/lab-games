import { readFile } from 'node:fs/promises';

const brain = JSON.parse(await readFile('public/brain/games.json', 'utf8'));
const counts = new Map();

for (const game of brain.games) {
  for (const tag of game.tags || []) {
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
}

const categoryLines = Object.entries(brain.categories)
  .map(([key, info]) => {
    const count = counts.get(key) || 0;
    return `- ${key}: ${info.label} (${count})`;
  })
  .join('\n');

console.log(`Lab Games Codex Context

Domain:
- https://games.jdgrid.com/
- public output: public/

Collections:
- /brain/ : ${brain.games.length} games
- /narrative/ : 2 stories

URL rules:
- No public .html URLs
- Brain game URL: /brain/games/{slug}/
- Brain game file: public/brain/games/{slug}/index.html
- Metadata source: public/brain/games.json

Categories:
${categoryLines}

Commands:
- npm run game:new -- --id slug --title "Title" --short "Short copy" --tags logic,focus
- npm run build
- npm run check
- npm run verify
- npm run dev
`);

