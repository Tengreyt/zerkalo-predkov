/** Автоматическая проверка размеров, alpha-канала и безопасных границ ассетов. */
import sharp from 'sharp';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = resolve(root, 'public/assets/costumes');
const manifest = JSON.parse(readFileSync(resolve(assets, 'manifest.json'), 'utf8'));
const reports = [];
let fatal = 0;

async function inspect(file, expectedCanvas = null, role = 'asset') {
  const path = resolve(assets, file);
  if (!existsSync(path)) {
    reports.push({ file, role, status: 'MISSING' });
    fatal++;
    return;
  }
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  let semitransparent = 0;
  let opaqueEdge = 0;
  let lightEdge = 0;
  let darkEdge = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const p = (y * info.width + x) * 4;
      const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
      if (a === 0) transparent++;
      else if (a < 255) semitransparent++;
      if (x !== 0 && y !== 0 && x !== info.width - 1 && y !== info.height - 1) continue;
      if (a > 8) opaqueEdge++;
      if (a > 180 && Math.min(r, g, b) > 225 && Math.max(r, g, b) - Math.min(r, g, b) < 18) lightEdge++;
      if (a > 180 && Math.max(r, g, b) < 24) darkEdge++;
    }
  }
  const sizeMatches = !expectedCanvas || (
    expectedCanvas[0] === info.width && expectedCanvas[1] === info.height
  );
  if (!sizeMatches) fatal++;
  reports.push({
    file,
    role,
    size: `${info.width}x${info.height}`,
    alpha: transparent > 0 || semitransparent > 0,
    transparent,
    semitransparent,
    opaqueEdge,
    suspiciousLightEdge: lightEdge,
    suspiciousDarkEdge: darkEdge,
    sizeMatches,
    potentialCrop: role !== 'background' && opaqueEdge > 0,
  });
}

for (const [id, costume] of Object.entries(manifest.costumes)) {
  const assetId = costume.asset ?? id;
  const sizes = costume.sizes.length ? costume.sizes : [''];
  for (const size of sizes) {
    await inspect(`${assetId}${size ? `_${size}` : ''}.png`, costume.anchors.canvas, `costume:${id}`);
  }
}
for (const [id, item] of Object.entries(manifest.headwear)) {
  await inspect(`${id}.png`, item.anchors.canvas, `headwear:${id}`);
}
for (const file of new Set(Object.values(manifest.backgrounds))) {
  await inspect(file, null, 'background');
}

console.table(reports);
if (fatal) {
  console.error(`Asset audit: ${fatal} критических ошибок (файл отсутствует или размер не совпадает с manifest).`);
  process.exitCode = 1;
} else {
  const cropped = reports.filter((item) => item.potentialCrop).length;
  console.log(`Asset audit: критических ошибок нет; файлов с непрозрачной границей: ${cropped}.`);
}
