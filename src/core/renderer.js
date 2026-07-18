/**
 * Отрисовка кадра: зеркальное видео + костюмы + (в debug) скелет.
 * Canvas 2D, один проход на кадр.
 */
import { getCostumeLayers, getHeadwearImage, getManifest } from './assets.js';
import {
  layoutCostume,
  buildSleeveMeshes,
  buildStaticSleeveMeshes,
  isWarpMeshSafe,
} from './costumeLayout.js';
import { LM } from '../config/settings.js';

const SKELETON_EDGES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
];

/** Рисует зеркальное видео на канву (селфи-режим). */
export function drawMirroredVideo(ctx, video, W, H) {
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, W, H);
  ctx.restore();
}

/** Матрица Canvas, переводящая один треугольник текстуры в треугольник экрана. */
function textureTriangle(ctx, image, source, target) {
  const [s0, s1, s2] = source;
  const [d0, d1, d2] = target;
  const denominator =
    s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(denominator) < 1e-6) return;

  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denominator;
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denominator;
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denominator;
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denominator;
  const e = (
    d0.x * (s1.x * s2.y - s2.x * s1.y) +
    d1.x * (s2.x * s0.y - s0.x * s2.y) +
    d2.x * (s0.x * s1.y - s1.x * s0.y)
  ) / denominator;
  const f = (
    d0.y * (s1.x * s2.y - s2.x * s1.y) +
    d1.y * (s2.x * s0.y - s0.x * s2.y) +
    d2.y * (s0.x * s1.y - s1.x * s0.y)
  ) / denominator;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

/** Рисует PNG по кусочно-аффинной сетке, сохраняя текстуру и прозрачность. */
export function drawWarpedImage(ctx, image, mesh) {
  const { sourceWidth, rows } = mesh;
  for (let i = 0; i < rows.length - 1; i++) {
    const top = rows[i];
    const bottom = rows[i + 1];
    const sTL = { x: top.sourceLeft ?? 0, y: top.sourceY };
    const sTR = { x: top.sourceRight ?? sourceWidth, y: top.sourceY };
    const sBL = { x: bottom.sourceLeft ?? 0, y: bottom.sourceY };
    const sBR = { x: bottom.sourceRight ?? sourceWidth, y: bottom.sourceY };

    textureTriangle(ctx, image, [sTL, sTR, sBL], [top.left, top.right, bottom.left]);
    textureTriangle(ctx, image, [sTR, sBR, sBL], [top.right, bottom.right, bottom.left]);
  }
}

/** Контактная тень под нижним краем создаёт ощущение, что убор лежит на голове. */
function drawHeadwearShadow(ctx, mesh, opacity) {
  const bottom = mesh.rows.at(-1);
  const dx = bottom.right.x - bottom.left.x;
  const dy = bottom.right.y - bottom.left.y;
  const width = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const center = {
    x: (bottom.left.x + bottom.right.x) / 2,
    y: (bottom.left.y + bottom.right.y) / 2,
  };
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(angle);
  ctx.filter = `blur(${Math.max(3, width * 0.025)}px)`;
  ctx.globalAlpha = opacity * 0.34;
  ctx.fillStyle = '#050505';
  ctx.beginPath();
  ctx.ellipse(0, width * 0.025, width * 0.43, width * 0.055, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Опорные линии головного убора в ?debug=1 для калибровки нового ассета. */
function drawHeadwearGuides(ctx, mesh) {
  const labels = ['ВЕРХ', 'ЭЛЛИПС', 'ЛЕНТА', 'НИЗ'];
  const colors = ['#50e3ff', '#78ff8a', '#ffd65a', '#ff6b8b'];
  ctx.save();
  ctx.font = 'bold 12px sans-serif';
  ctx.lineWidth = 2;
  for (let i = 0; i < mesh.rows.length; i++) {
    const row = mesh.rows[i];
    ctx.strokeStyle = colors[i];
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.moveTo(row.left.x, row.left.y);
    ctx.lineTo(row.right.x, row.right.y);
    ctx.stroke();
    for (const point of [row.left, row.right]) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillText(labels[i], row.left.x + 7, row.left.y - 5);
  }
  ctx.restore();
}

function drawMeshGuides(ctx, mesh, labels, color) {
  ctx.save();
  ctx.font = 'bold 11px sans-serif';
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  for (let i = 0; i < mesh.rows.length; i++) {
    const row = mesh.rows[i];
    ctx.beginPath();
    ctx.moveTo(row.left.x, row.left.y);
    ctx.lineTo(row.right.x, row.right.y);
    ctx.stroke();
    for (const point of [row.left, row.right]) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillText(labels[i] ?? `${i}`, row.left.x + 5, row.left.y - 4);
  }
  ctx.restore();
}

/**
 * Рисует костюм одного человека.
 * @param {Array} lm сглаженные landmarks в ЗЕРКАЛЬНЫХ координатах
 * @param {number} opacity 0..1 — плавное появление/скрытие
 */
export function drawPersonCostume(
  ctx,
  lm,
  W,
  H,
  costumeId,
  bodyClass,
  opacity,
  showHeadwear = true,
  debugFit = false,
) {
  if (opacity <= 0.01) return;
  const manifest = getManifest();
  const resolvedId = manifest.costumes[costumeId] ? costumeId : 'cherkeska';
  const costume = manifest.costumes[resolvedId];
  const withHead = showHeadwear && costume.headwear;
  const headwear = withHead ? manifest.headwear[costume.headwear] : null;
  const { body, bodyMesh: rawBodyMesh, head } = layoutCostume(lm, W, H, costume, headwear);
  const bodyMesh = isWarpMeshSafe(rawBodyMesh) ? rawBodyMesh : null;
  const layers = getCostumeLayers(resolvedId, bodyClass);
  const sleeveMeshes = layers.sleeves ? buildSleeveMeshes(lm, W, H, costume) : null;
  const staticSleeves = layers.sleeves && bodyMesh
    ? buildStaticSleeveMeshes(bodyMesh, costume)
    : null;

  ctx.save();
  ctx.globalAlpha = opacity;
  const drawSleeve = (side) => {
    const mesh = sleeveMeshes?.[side] ?? staticSleeves?.[side];
    if (mesh) drawWarpedImage(ctx, layers.sleeves[side], mesh);
    else ctx.drawImage(layers.sleeves[side], body.x, body.y, body.w, body.h);
  };

  // Обычно рукав за корпусом, но пересекающая грудь рука по z выходит вперёд.
  if (layers.sleeves) {
    for (const side of ['left', 'right']) {
      if (!sleeveMeshes?.[side]?.inFront) drawSleeve(side);
    }
  }
  if (bodyMesh) drawWarpedImage(ctx, layers.torso, bodyMesh);
  else ctx.drawImage(layers.torso, body.x, body.y, body.w, body.h);
  if (layers.sleeves && sleeveMeshes) {
    for (const side of ['left', 'right']) {
      if (sleeveMeshes[side]?.inFront) drawSleeve(side);
    }
  }
  if (debugFit && bodyMesh) {
    drawMeshGuides(
      ctx,
      bodyMesh,
      ['ВЕРХ', 'ПЛЕЧИ', 'ТАЛИЯ', 'БЁДРА', 'КОЛЕНИ', 'ПОДОЛ'],
      '#44e5ff',
    );
    if (sleeveMeshes) {
      if (sleeveMeshes.left) {
        drawMeshGuides(
          ctx,
          sleeveMeshes.left,
          ['ПЛЕЧО', 'ВЕРХ', 'ЛОКОТЬ', 'ПРЕДПЛ.', 'КИСТЬ'],
          '#ffcf4a',
        );
      }
      if (sleeveMeshes.right) {
        drawMeshGuides(
          ctx,
          sleeveMeshes.right,
          ['ПЛЕЧО', 'ВЕРХ', 'ЛОКОТЬ', 'ПРЕДПЛ.', 'КИСТЬ'],
          '#ffcf4a',
        );
      }
    }
  }
  if (head) {
    const headImage = getHeadwearImage(costume.headwear);
    if (!headImage) {
      // Необязательный убор может отсутствовать; основной костюм остаётся рабочим.
    } else if (head.mesh) {
      drawHeadwearShadow(ctx, head.mesh, opacity);
      drawWarpedImage(ctx, headImage, head.mesh);
      if (debugFit) drawHeadwearGuides(ctx, head.mesh);
    } else {
      ctx.drawImage(headImage, head.x, head.y, head.w, head.h);
    }
  }
  ctx.restore();
}

/** Debug-отрисовка скелета поверх кадра. */
export function drawSkeleton(ctx, lm, W, H) {
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 255, 160, 0.8)';
  ctx.fillStyle = 'rgba(0, 255, 160, 0.9)';
  ctx.lineWidth = 2;
  for (const [a, b] of SKELETON_EDGES) {
    if (lm[a].visibility < 0.3 || lm[b].visibility < 0.3) continue;
    ctx.beginPath();
    ctx.moveTo(lm[a].x * W, lm[a].y * H);
    ctx.lineTo(lm[b].x * W, lm[b].y * H);
    ctx.stroke();
  }
  for (const i of Object.values(LM)) {
    if (lm[i].visibility < 0.3) continue;
    ctx.beginPath();
    ctx.arc(lm[i].x * W, lm[i].y * H, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
