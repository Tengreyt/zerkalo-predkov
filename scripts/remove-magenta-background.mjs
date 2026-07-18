/**
 * Удаляет яркий magenta chroma-key у сгенерированных AR-ассетов.
 * Sharp уже используется проектом для подготовки реальных костюмов.
 */
import sharp from 'sharp';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/remove-magenta-background.mjs <input> <output>');
  process.exit(1);
}

const source = sharp(input).ensureAlpha();
const { data, info } = await source.raw().toBuffer({ resolveWithObject: true });

for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  // У фона одновременно высокие R/B и низкий G. У чёрно-белого меха каналы близки.
  const chroma = Math.min(r, b) - g;
  const brightness = Math.min(r, b);
  const score = chroma * Math.min(1, brightness / 150);
  const opaque = 38;
  const transparent = 118;
  const alpha = score <= opaque
    ? 255
    : score >= transparent
      ? 0
      : Math.round(255 * (transparent - score) / (transparent - opaque));
  data[i + 3] = Math.min(data[i + 3], alpha);

  // На полупрозрачной кромке убираем цветной magenta-ореол.
  if (alpha === 0) {
    data[i] = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
  } else if (alpha < 255) {
    const neutral = Math.max(g, Math.min(r, b));
    data[i] = Math.min(r, neutral + 12);
    data[i + 2] = Math.min(b, neutral + 12);
  }
}

const keyed = await sharp(data, {
  raw: { width: info.width, height: info.height, channels: 4 },
}).png().toBuffer();

await sharp(keyed)
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
  .extend({
    top: 24,
    bottom: 24,
    left: 24,
    right: 24,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toFile(output);
