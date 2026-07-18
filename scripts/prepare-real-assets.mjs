/**
 * Подготовка реальных фото костюмов из assets_src/ для наложения в кадре:
 *  1) удаление фона заливкой от краёв (region-growing — держит градиентный фон,
 *     не «выедает» внутренние цвета костюма, т.к. растёт только по связному фону);
 *  2) trim прозрачных полей → срез верха (голова/убор манекена) — лицо у посетителя своё;
 *  3) запись PNG в public/assets/costumes/ и якорей плеч в manifest.json.
 *
 * Доли (fracs) якорей и topCrop измерены визуально по итоговым кадрам; при замене
 * исходников перепроверить через ?debug=1 (метки якорей рисуются в debug-режиме).
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'assets_src');
const OUT = resolve(ROOT, 'public/assets/costumes');
const MANIFEST_PATH = resolve(OUT, 'manifest.json');

const COSTUMES = {
  cherkeska: {
    src: 'cherkeska_src.png',
    background: 'checker',
    bgTol: 40,
    topCrop: 0.17,
    padding: 16,
    shoulders: { lx: 0.30, rx: 0.70, y: 0.05 },
  },
  burka: {
    src: 'burka_src.png',
    background: 'gradient',
    bgTol: 30,
    topCrop: 0.16,
    padding: 16,
    shoulders: { lx: 0.22, rx: 0.78, y: 0.05 },
  },
  gabali_green: {
    src: 'gabali_green_src.png',
    background: 'checker',
    bgTol: 40,
    topCrop: 0.15,
    shoulders: { lx: 0.30, rx: 0.70, y: 0.06 },
  },
  gabali_red: {
    src: 'gabali_red_src.png',
    background: 'checker',
    bgTol: 40,
    topCrop: 0.17,
    shoulders: { lx: 0.30, rx: 0.70, y: 0.05 },
  },
};

/** Папаха вырезается из фото черкески: box в долях trimmed-изображения. */
const PAPAKHA = {
  src: 'cherkeska_src.png',
  bgTol: 40,
  box: { x: 0.35, y: 0.0, w: 0.30, h: 0.098 },
  ears: { lx: 0.18, rx: 0.82, y: 0.9 },
};

/**
 * Удаляет фон: заливка от всех граничных пикселей, сосед считается фоном,
 * если его цвет близок к цвету ТЕКУЩЕГО фонового пикселя (локальный допуск →
 * плавный градиент проходит, резкая граница костюма останавливает заливку).
 */
function removeBackground(data, w, h, tol) {
  const N = w * h;
  const bg = new Uint8Array(N);
  const stack = new Int32Array(N);
  let sp = 0;

  const push = (i) => {
    if (!bg[i] && data[i * 4 + 3] > 0) {
      bg[i] = 1;
      stack[sp++] = i;
    } else if (data[i * 4 + 3] === 0 && !bg[i]) {
      bg[i] = 1; // уже прозрачный пиксель тоже сеет заливку
      stack[sp++] = i;
    }
  };

  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }

  const close = (i, j) => {
    const a = i * 4, b = j * 4;
    return (
      Math.abs(data[a] - data[b]) +
      Math.abs(data[a + 1] - data[b + 1]) +
      Math.abs(data[a + 2] - data[b + 2])
    ) <= tol;
  };

  while (sp > 0) {
    const i = stack[--sp];
    const x = i % w, y = (i / w) | 0;
    const neigh = [];
    if (x > 0) neigh.push(i - 1);
    if (x < w - 1) neigh.push(i + 1);
    if (y > 0) neigh.push(i - w);
    if (y < h - 1) neigh.push(i + w);
    for (const j of neigh) {
      if (bg[j]) continue;
      if (data[j * 4 + 3] === 0 || close(i, j)) {
        bg[j] = 1;
        stack[sp++] = j;
      }
    }
  }

  for (let i = 0; i < N; i++) if (bg[i]) data[i * 4 + 3] = 0;
}

/**
 * Шахматный фон — почти нейтральные светлые клетки. Удаляем только такие
 * пиксели, связанные с границей, и не шагаем по градиенту внутрь белой ткани.
 */
function removeCheckerBackground(data, w, h) {
  const N = w * h;
  const background = new Uint8Array(N);
  const stack = new Int32Array(N);
  let sp = 0;

  const looksLikeChecker = (i) => {
    const p = i * 4;
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const high = Math.max(r, g, b);
    const low = Math.min(r, g, b);
    return low >= 218 && high - low <= 15;
  };
  const push = (i) => {
    if (!background[i] && looksLikeChecker(i)) {
      background[i] = 1;
      stack[sp++] = i;
    }
  };

  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (sp > 0) {
    const i = stack[--sp];
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  for (let i = 0; i < N; i++) if (background[i]) data[i * 4 + 3] = 0;
}

/** Загружает src, чистит фон, возвращает trimmed sharp-объект + его размеры. */
async function cleaned(file, tol, background = 'gradient') {
  const { data, info } = await sharp(resolve(SRC, file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (background === 'checker') removeCheckerBackground(data, info.width, info.height);
  else removeBackground(data, info.width, info.height, tol);
  const trimmedBuf = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim()
    .png()
    .toBuffer();
  const meta = await sharp(trimmedBuf).metadata();
  return { buf: trimmedBuf, W: meta.width, H: meta.height };
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

function translateSleeveFit(fit, dx, dy) {
  if (!fit?.sleeves || (!dx && !dy)) return;
  for (const side of ['left', 'right']) {
    const sleeve = fit.sleeves[side];
    sleeve.polygon = sleeve.polygon.map(([x, y]) => [x + dx, y + dy]);
    for (const row of Object.values(sleeve.rows)) {
      row.left = [row.left[0] + dx, row.left[1] + dy];
      row.right = [row.right[0] + dx, row.right[1] + dy];
    }
  }
}

for (const [id, cfg] of Object.entries(COSTUMES)) {
  const { buf, W, H } = await cleaned(cfg.src, cfg.bgTol, cfg.background);
  const top = Math.round(H * cfg.topCrop);
  const outH = H - top;
  const padding = cfg.padding ?? 0;
  await sharp(buf)
    .extract({ left: 0, top, width: W, height: outH })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(resolve(OUT, `${id}.png`));

  const s = cfg.shoulders;
  const previousPadding = manifest.costumes[id]?.fit?.coordinate_padding ?? 0;
  const paddingDelta = padding - previousPadding;
  translateSleeveFit(manifest.costumes[id]?.fit, paddingDelta, paddingDelta);
  if (manifest.costumes[id]?.fit) {
    manifest.costumes[id].fit.coordinate_padding = padding;
  }
  manifest.costumes[id] = {
    ...(manifest.costumes[id] ?? {}),
    kind: 'body',
    sizes: [],
    anchors: {
      canvas: [W + padding * 2, outH + padding * 2],
      left_shoulder: [Math.round(W * s.lx) + padding, Math.round(outH * s.y) + padding],
      right_shoulder: [Math.round(W * s.rx) + padding, Math.round(outH * s.y) + padding],
    },
  };
  console.log(`${id}: ${W + padding * 2}x${outH + padding * 2} (padding ${padding}px)`);
}

{
  const { buf, W, H } = await cleaned(PAPAKHA.src, PAPAKHA.bgTol, 'checker');
  const b = PAPAKHA.box;
  const box = {
    left: Math.round(W * b.x),
    top: Math.round(H * b.y),
    width: Math.round(W * b.w),
    height: Math.round(H * b.h),
  };
  await sharp(buf).extract(box).png().toFile(resolve(OUT, 'papakha.png'));
  const e = PAPAKHA.ears;
  manifest.headwear.papakha = {
    anchors: {
      canvas: [box.width, box.height],
      left_ear: [Math.round(box.width * e.lx), Math.round(box.height * e.y)],
      right_ear: [Math.round(box.width * e.rx), Math.round(box.height * e.y)],
    },
  };
  console.log(`papakha: ${box.width}x${box.height}`);
}

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log('manifest.json обновлён.');
