import fs from 'node:fs';

export function readStyles() {
  const manifest = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  return [...manifest.matchAll(/@import url\('\.\/(styles\/[^']+)'\);/g)]
    .map((match) => fs.readFileSync(new URL(`../${match[1]}`, import.meta.url), 'utf8'))
    .join('');
}
