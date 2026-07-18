/**
 * Генерирует PNG-заглушки костюмов/уборов/фонов по manifest.json.
 * Нужны только до распаковки реального архива zerkalo_predkov_assets_v2.zip:
 * реальные файлы кладутся поверх и полностью заменяют заглушки.
 *
 * Чистый Node без зависимостей: PNG собирается вручную (RGBA + zlib deflate).
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/assets/costumes');
const manifest = JSON.parse(readFileSync(resolve(ASSETS_DIR, 'manifest.json'), 'utf8'));

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Рисует прямоугольник в RGBA-буфере. */
function fillRect(buf, W, x0, y0, w, h, [r, g, b, a]) {
  const x1 = Math.min(W, x0 + w);
  for (let y = y0; y < y0 + h; y++) {
    for (let x = Math.max(0, x0); x < x1; x++) {
      const i = (y * W + x) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
    }
  }
}

const COSTUME_COLORS = {
  cherkeska_grey: [120, 120, 128],
  cherkeska_white: [235, 232, 224],
  beshmet: [90, 60, 30],
  gabali: [170, 40, 70],
  gown: [30, 30, 60],
  burka: [40, 40, 40],
};
const SIZE_WIDTH_FACTOR = { slim: 0.82, regular: 1.0, large: 1.18, '': 1.0 };

function drawCostume(name, size, anchors) {
  const [W, H] = anchors.canvas;
  const buf = Buffer.alloc(W * H * 4); // прозрачный фон
  const [r, g, b] = COSTUME_COLORS[name] ?? [100, 100, 100];
  const [lx, ly] = anchors.left_shoulder;
  const [rx] = anchors.right_shoulder;
  const baseW = (rx - lx) * 1.35 * (SIZE_WIDTH_FACTOR[size] ?? 1);
  const cx = (lx + rx) / 2;
  // «Торс»: от линии плеч вниз
  fillRect(buf, W, Math.round(cx - baseW / 2), ly - 40, Math.round(baseW), H - ly - 60, [r, g, b, 235]);
  // «Рукава»
  fillRect(buf, W, Math.round(cx - baseW / 2 - 90), ly - 20, 90, 520, [r, g, b, 235]);
  fillRect(buf, W, Math.round(cx + baseW / 2), ly - 20, 90, 520, [r, g, b, 235]);
  // Метки якорей плеч (для визуальной сверки в debug)
  fillRect(buf, W, lx - 6, ly - 6, 12, 12, [255, 0, 0, 255]);
  fillRect(buf, W, rx - 6, ly - 6, 12, 12, [0, 255, 0, 255]);
  return encodePng(W, H, buf);
}

function drawHeadwear(name, anchors) {
  const [W, H] = anchors.canvas;
  const buf = Buffer.alloc(W * H * 4);
  const colors = { papakha: [60, 50, 45], kortali: [240, 240, 245], mortarboard: [20, 20, 30] };
  const [r, g, b] = colors[name] ?? [80, 80, 80];
  const [lx, ly] = anchors.left_ear;
  const [rx] = anchors.right_ear;
  fillRect(buf, W, lx - 30, 40, rx - lx + 60, ly - 40, [r, g, b, 240]);
  fillRect(buf, W, lx - 4, ly - 4, 8, 8, [255, 0, 0, 255]);
  fillRect(buf, W, rx - 4, ly - 4, 8, 8, [0, 255, 0, 255]);
  return encodePng(W, H, buf);
}

function drawBackground(name) {
  const W = 1920, H = 1080;
  const buf = Buffer.alloc(W * H * 4);
  const top = name.includes('campus') ? [140, 170, 210] : [110, 140, 180];
  const bottom = name.includes('campus') ? [180, 160, 130] : [80, 100, 70];
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const r = Math.round(top[0] + (bottom[0] - top[0]) * t);
    const g = Math.round(top[1] + (bottom[1] - top[1]) * t);
    const b = Math.round(top[2] + (bottom[2] - top[2]) * t);
    fillRect(buf, W, 0, y, W, 1, [r, g, b, 255]);
  }
  return encodePng(W, H, buf);
}

let written = 0;
function writeIfMissing(file, makeBuf) {
  const path = resolve(ASSETS_DIR, file);
  if (existsSync(path)) return; // реальный ассет уже на месте — не трогаем
  writeFileSync(path, makeBuf());
  written++;
  console.log('placeholder:', file);
}

for (const [name, costume] of Object.entries(manifest.costumes)) {
  const sizes = costume.sizes.length ? costume.sizes : [''];
  for (const size of sizes) {
    const file = size ? `${name}_${size}.png` : `${name}.png`;
    writeIfMissing(file, () => drawCostume(name, size, costume.anchors));
  }
}
for (const [name, hw] of Object.entries(manifest.headwear)) {
  writeIfMissing(`${name}.png`, () => drawHeadwear(name, hw.anchors));
}
for (const file of Object.values(manifest.backgrounds)) {
  writeIfMissing(file, () => drawBackground(file));
}

console.log(written ? `Готово: ${written} заглушек.` : 'Все ассеты на месте, заглушки не нужны.');
