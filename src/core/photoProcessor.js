/**
 * Обработка стоп-кадра: сегментация людей → подстановка фона по костюму →
 * тёплая цветокоррекция. Сегментация запускается ТОЛЬКО здесь, не в live-превью.
 * Всё on-device, снимок никуда не отправляется.
 */
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { settings } from '../config/settings.js';
import { getBackgroundImage } from './assets.js';

let segmenter = null;

/** Ленивая инициализация: граф сегментации создаётся при первом снимке. */
async function ensureSegmenter() {
  if (segmenter) return segmenter;
  const fileset = await FilesetResolver.forVisionTasks(settings.paths.wasm);
  segmenter = await ImageSegmenter.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: settings.paths.segmenterModel, delegate: 'GPU' },
    runningMode: 'IMAGE',
    outputCategoryMask: true,
    outputConfidenceMasks: false,
  });
  return segmenter;
}

/**
 * Собирает финальное фото.
 * @param {HTMLCanvasElement} cleanFrame зеркальный стоп-кадр БЕЗ костюма
 * @param {HTMLCanvasElement} costumeLayer прозрачный слой одежды
 * @param {string} costumeId — определяет фон по manifest.backgrounds
 * @param {Array<Array>} poses последние уверенные позы в зеркальных координатах
 * @returns {Promise<HTMLCanvasElement>} готовое фото
 */
export async function composePhoto(cleanFrame, costumeLayer, costumeId, poses = []) {
  const composeStartedAt = performance.now();
  const W = cleanFrame.width;
  const H = cleanFrame.height;

  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');

  // 1. Фон, привязанный к костюму (cover-заполнение кадра)
  const bg = getBackgroundImage(costumeId);
  if (bg) drawCover(ctx, bg, W, H);
  else ctx.drawImage(cleanFrame, 0, 0, W, H);

  // 2. Люди со стоп-кадра поверх фона (по маске сегментации)
  try {
    const seg = await ensureSegmenter();
    // Важно: сегментируем исходное видео, а не кадр с PNG-костюмом. Иначе ML
    // воспринимает одежду как фон и вырезает её отдельными островками.
    const segmentStartedAt = performance.now();
    const result = seg.segment(cleanFrame);
    out.segmentMs = performance.now() - segmentStartedAt;
    const mask = result.categoryMask;
    const personLayer = extractPersons(cleanFrame, mask, poses);
    mask.close();
    ctx.drawImage(personLayer, 0, 0, W, H);
  } catch (err) {
    // Любая сомнительная ML-ошибка лучше исходного фото, чем «разрезанный» человек.
    console.error('Segmentation failed, keeping original frame:', err);
    ctx.drawImage(cleanFrame, 0, 0, W, H);
    out.segmentMs = 0;
  }

  // Костюм всегда рисуется ПОСЛЕ сегментации и поэтому никогда не режется маской.
  ctx.drawImage(costumeLayer, 0, 0, W, H);

  // 3. Тёплый пресет поверх всего кадра, чтобы человек и фон «склеились»
  const graded = document.createElement('canvas');
  graded.width = W;
  graded.height = H;
  const gctx = graded.getContext('2d');
  gctx.filter = settings.photo.colorGrade;
  gctx.drawImage(out, 0, 0);
  graded.timing = {
    segmentMs: out.segmentMs ?? 0,
    totalMs: performance.now() - composeStartedAt,
  };
  return graded;
}

export function closePhotoProcessor() {
  try {
    segmenter?.close();
  } finally {
    segmenter = null;
  }
}

/** Рисует изображение с заполнением всей канвы без искажения пропорций. */
function drawCover(ctx, img, W, H) {
  const scale = Math.max(W / img.width, H / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

/**
 * Слой «только люди»: пиксели кадра, где categoryMask != 0 (фон).
 * Модель selfie_multiclass: категория 0 — фон, остальные — человек.
 */
function extractPersons(cleanFrame, mask, poses) {
  const W = cleanFrame.width;
  const H = cleanFrame.height;
  const maskData = mask.getAsUint8Array();
  const mW = mask.width;
  const mH = mask.height;

  // Категориальная маска строится в родном разрешении модели, затем масштабируется.
  const categoryCanvas = document.createElement('canvas');
  categoryCanvas.width = mW;
  categoryCanvas.height = mH;
  const categoryCtx = categoryCanvas.getContext('2d');
  const categoryImage = categoryCtx.createImageData(mW, mH);
  for (let i = 0; i < maskData.length; i++) {
    const p = i * 4;
    categoryImage.data[p] = 255;
    categoryImage.data[p + 1] = 255;
    categoryImage.data[p + 2] = 255;
    categoryImage.data[p + 3] = maskData[i] === 0 ? 0 : 255;
  }
  categoryCtx.putImageData(categoryImage, 0, 0);

  // Страховочная маска по скелету закрывает внутренние дыры сегментации в одежде.
  const combinedMask = document.createElement('canvas');
  combinedMask.width = W;
  combinedMask.height = H;
  const maskCtx = combinedMask.getContext('2d');
  maskCtx.imageSmoothingEnabled = true;
  maskCtx.drawImage(categoryCanvas, 0, 0, W, H);
  for (const lm of poses) drawPoseSafetyMask(maskCtx, lm, W, H);

  // Маленькое перо убирает рваную границу волос/плеч без заметного ореола.
  const featheredMask = document.createElement('canvas');
  featheredMask.width = W;
  featheredMask.height = H;
  const featherCtx = featheredMask.getContext('2d');
  featherCtx.filter = 'blur(1.5px)';
  featherCtx.drawImage(combinedMask, 0, 0);

  const layer = document.createElement('canvas');
  layer.width = W;
  layer.height = H;
  const lctx = layer.getContext('2d');
  lctx.drawImage(cleanFrame, 0, 0);
  lctx.globalCompositeOperation = 'destination-in';
  lctx.drawImage(featheredMask, 0, 0);
  return layer;
}

function px(lm, index, W, H) {
  const p = lm[index];
  return { x: p.x * W, y: p.y * H };
}

function pathThrough(ctx, points, width) {
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

/** Консервативный силуэт из Pose landmarks; он только заполняет дыры внутри тела. */
function drawPoseSafetyMask(ctx, lm, W, H) {
  if (!lm?.[28]) return;
  const Lsh = px(lm, 11, W, H);
  const Rsh = px(lm, 12, W, H);
  const Lhip = px(lm, 23, W, H);
  const Rhip = px(lm, 24, W, H);
  const shoulderW = Math.hypot(Rsh.x - Lsh.x, Rsh.y - Lsh.y);
  if (shoulderW < 10) return;

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = 'rgba(255,255,255,0.90)';

  // Корпус — выпуклый четырёхугольник чуть внутри внешнего силуэта.
  const expand = shoulderW * 0.09;
  ctx.beginPath();
  ctx.moveTo(Lsh.x - expand, Lsh.y);
  ctx.lineTo(Rsh.x + expand, Rsh.y);
  ctx.lineTo(Rhip.x + expand * 0.75, Rhip.y);
  ctx.lineTo(Lhip.x - expand * 0.75, Lhip.y);
  ctx.closePath();
  ctx.fill();

  // Голова и волосы.
  const earL = px(lm, 7, W, H);
  const earR = px(lm, 8, W, H);
  const earW = Math.max(shoulderW * 0.34, Math.hypot(earR.x - earL.x, earR.y - earL.y));
  const headMid = { x: (earL.x + earR.x) / 2, y: (earL.y + earR.y) / 2 };
  ctx.beginPath();
  ctx.ellipse(headMid.x, headMid.y - earW * 0.12, earW * 0.72, earW * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();

  // Руки и ноги — капсулы вдоль костей, без захвата больших участков фона.
  const safeBone = (indices, width) => {
    if (indices.every((i) => lm[i]?.visibility >= 0.35)) {
      pathThrough(ctx, indices.map((i) => px(lm, i, W, H)), width);
    }
  };
  safeBone([11, 13, 15], shoulderW * 0.23);
  safeBone([12, 14, 16], shoulderW * 0.23);
  safeBone([23, 25, 27], shoulderW * 0.25);
  safeBone([24, 26, 28], shoulderW * 0.25);
  ctx.restore();
}
