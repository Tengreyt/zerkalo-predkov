/** Создаёт диагностические PNG с полигонами и опорами рукавов из manifest.json. */
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = resolve(root, 'public/assets/costumes');
const output = resolve(root, 'tmp/fit-guides');
mkdirSync(output, { recursive: true });
const manifest = JSON.parse(readFileSync(resolve(assets, 'manifest.json'), 'utf8'));

const escPoints = (points) => points.map(([x, y]) => `${x},${y}`).join(' ');

for (const [id, costume] of Object.entries(manifest.costumes)) {
  const sleeves = costume.fit?.sleeves;
  if (!sleeves) continue;
  const [width, height] = costume.anchors.canvas;
  const colors = { left: '#00e5ff', right: '#ffcf40' };
  const shapes = [];
  for (const side of ['left', 'right']) {
    const cfg = sleeves[side];
    const color = colors[side];
    shapes.push(`<polygon points="${escPoints(cfg.polygon)}" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="3"/>`);
    for (const [name, row] of Object.entries(cfg.rows)) {
      shapes.push(`<line x1="${row.left[0]}" y1="${row.left[1]}" x2="${row.right[0]}" y2="${row.right[1]}" stroke="${color}" stroke-width="4"/>`);
      shapes.push(`<circle cx="${row.left[0]}" cy="${row.left[1]}" r="6" fill="${color}"/>`);
      shapes.push(`<circle cx="${row.right[0]}" cy="${row.right[1]}" r="6" fill="${color}"/>`);
      shapes.push(`<text x="${row.left[0] + 8}" y="${row.left[1] - 8}" fill="${color}" font-family="sans-serif" font-size="18" font-weight="bold">${side} ${name}</text>`);
    }
  }
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shapes.join('')}</svg>`);
  await sharp(resolve(assets, `${id}.png`))
    .composite([{ input: svg }])
    .png()
    .toFile(resolve(output, `${id}-fit.png`));
  console.log(`${id}: tmp/fit-guides/${id}-fit.png`);
}
