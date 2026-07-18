/**
 * Позиционирование костюма — отдельный модуль со стратегией.
 * 'dynamic' — по ключевым точкам позы (основной режим).
 * 'fixed'   — план Б «волшебное зеркало»: фиксированная позиция/масштаб,
 *             поза используется только как триггер присутствия.
 * Переключение — одним флагом settings.positioningStrategy.
 */
import { settings, LM } from '../config/settings.js';

/**
 * Прямоугольник отрисовки PNG по двум опорным точкам и якорям из манифеста.
 * Формула из README_INTEGRACIYA.md.
 */
function layoutByAnchors(leftPt, rightPt, anchors, leftAnchor, rightAnchor, scaleFactor, liftFactor = 0) {
  const anchorW = anchors[rightAnchor][0] - anchors[leftAnchor][0];
  const spanW = Math.hypot(rightPt.x - leftPt.x, rightPt.y - leftPt.y);
  const k = (spanW / anchorW) * scaleFactor;
  const midX = (leftPt.x + rightPt.x) / 2;
  // Подъём вверх на долю ширины опоры (для убора: уши ≈ уровень глаз,
  // а шапка должна сидеть выше бровей).
  const midY = (leftPt.y + rightPt.y) / 2 - liftFactor * spanW;
  const ax = (anchors[leftAnchor][0] + anchors[rightAnchor][0]) / 2;
  const ay = anchors[leftAnchor][1];
  return {
    x: midX - ax * k,
    y: midY - ay * k,
    w: anchors.canvas[0] * k,
    h: anchors.canvas[1] * k,
  };
}

const toPx = (p, W, H) => ({ x: p.x * W, y: p.y * H });
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const mixPoint = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const pointDistance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function screenPair(a, b) {
  return a.x <= b.x ? [a, b] : [b, a];
}

function pairFrame(a, b, fallbackDirection = { x: 1, y: 0 }) {
  const [left, right] = screenPair(a, b);
  const span = pointDistance(left, right);
  return {
    center: midpoint(left, right),
    span,
    direction: span > 1e-4
      ? { x: (right.x - left.x) / span, y: (right.y - left.y) / span }
      : fallbackDirection,
  };
}

function blendDirection(base, next, amount) {
  let x = base.x * (1 - amount) + next.x * amount;
  let y = base.y * (1 - amount) + next.y * amount;
  // Не допускаем переворота текстуры, если детектор на кадр поменял стороны местами.
  if (x < 0) { x *= -1; y *= -1; }
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function meshRow(sourceY, center, direction, halfWidth) {
  return {
    sourceY,
    left: {
      x: center.x - direction.x * halfWidth,
      y: center.y - direction.y * halfWidth,
    },
    right: {
      x: center.x + direction.x * halfWidth,
      y: center.y + direction.y * halfWidth,
    },
  };
}

function perspectiveRow(sourceY, center, direction, halfWidth, yaw, depth = 0.16) {
  const leftWidth = halfWidth * (1 + yaw * depth);
  const rightWidth = halfWidth * (1 - yaw * depth);
  return {
    sourceY,
    left: {
      x: center.x - direction.x * leftWidth,
      y: center.y - direction.y * leftWidth,
    },
    right: {
      x: center.x + direction.x * rightWidth,
      y: center.y + direction.y * rightWidth,
    },
  };
}

/**
 * Перспективная сетка головного убора: глаза задают линию лба, уши — масштаб
 * и наклон, нос — лёгкий поворот/перспективу. Верх, меховая часть, лента и низ
 * являются отдельными опорными рядами, поэтому убор не выглядит наклейкой.
 */
export function buildHeadwearMesh(lm, W, H, headwear) {
  const fit = headwear?.fit;
  if (fit?.mode !== 'head-mesh' || settings.positioningStrategy === 'fixed') return null;

  const leftEar = toPx(lm[LM.LEFT_EAR], W, H);
  const rightEar = toPx(lm[LM.RIGHT_EAR], W, H);
  const ears = pairFrame(leftEar, rightEar);
  if (ears.span < 2) return null;

  const eyeA = lm[LM.LEFT_EYE]?.visibility >= 0.3
    ? toPx(lm[LM.LEFT_EYE], W, H)
    : leftEar;
  const eyeB = lm[LM.RIGHT_EYE]?.visibility >= 0.3
    ? toPx(lm[LM.RIGHT_EYE], W, H)
    : rightEar;
  const eyes = pairFrame(eyeA, eyeB, ears.direction);
  const direction = blendDirection(ears.direction, eyes.direction, 0.65);
  const up = { x: direction.y, y: -direction.x };
  const nose = toPx(lm[LM.NOSE], W, H);
  const yaw = clamp((nose.x - ears.center.x) / (ears.span * 0.55), -0.72, 0.72);
  const pitch = clamp((nose.y - eyes.center.y) / ears.span, 0, 0.65);

  const width = ears.span * fit.width_factor;
  const sourceWidth = headwear.anchors.canvas[0];
  const sourceHeight = headwear.anchors.canvas[1];
  const height = width * (sourceHeight / sourceWidth) * fit.height_factor * (0.94 + pitch * 0.16);
  const bottomCenter = {
    x: eyes.center.x + up.x * ears.span * fit.bottom_lift + direction.x * yaw * ears.span * 0.04,
    y: eyes.center.y + up.y * ears.span * fit.bottom_lift + direction.y * yaw * ears.span * 0.04,
  };
  const topCenter = {
    x: bottomCenter.x + up.x * height + direction.x * yaw * ears.span * 0.07,
    y: bottomCenter.y + up.y * height + direction.y * yaw * ears.span * 0.07,
  };
  const centerAt = (sourceY) => mixPoint(topCenter, bottomCenter, sourceY / sourceHeight);
  const halfWidth = width / 2;

  return {
    sourceWidth,
    sourceHeight,
    kind: 'headwear',
    rows: [
      perspectiveRow(0, topCenter, direction, halfWidth * 0.86, yaw, 0.22),
      perspectiveRow(
        fit.top_ellipse_y,
        centerAt(fit.top_ellipse_y),
        direction,
        halfWidth * 0.98,
        yaw,
        0.2,
      ),
      perspectiveRow(
        fit.band_y,
        centerAt(fit.band_y),
        direction,
        halfWidth,
        yaw,
        0.16,
      ),
      perspectiveRow(sourceHeight, bottomCenter, direction, halfWidth * 0.97, yaw, 0.12),
    ],
  };
}

function armFrame(shoulder, elbow, wrist, indices) {
  return { shoulder, elbow, wrist, indices };
}

function jointDirection(previous, current, next) {
  const before = { x: current.x - previous.x, y: current.y - previous.y };
  const after = { x: next.x - current.x, y: next.y - current.y };
  const beforeLength = Math.hypot(before.x, before.y) || 1;
  const afterLength = Math.hypot(after.x, after.y) || 1;
  const x = before.x / beforeLength + after.x / afterLength;
  const y = before.y / beforeLength + after.y / afterLength;
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function sleeveTargetRow(source, center, tangent, scale) {
  let normal = { x: -tangent.y, y: tangent.x };
  // sourceLeft/sourceRight всегда идут слева направо в исходном PNG.
  if (normal.x < 0) normal = { x: -normal.x, y: -normal.y };
  const sourceWidth = source.right[0] - source.left[0];
  const halfWidth = Math.abs(sourceWidth) * scale / 2;
  return {
    sourceY: (source.left[1] + source.right[1]) / 2,
    sourceLeft: source.left[0],
    sourceRight: source.right[0],
    left: { x: center.x - normal.x * halfWidth, y: center.y - normal.y * halfWidth },
    right: { x: center.x + normal.x * halfWidth, y: center.y + normal.y * halfWidth },
  };
}

function triangleArea(a, b, c) {
  return ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
}

/**
 * Проверяет, что кусочно-аффинная сетка не содержит перевёрнутых или почти
 * вырожденных треугольников. Небезопасную сетку renderer не рисует: для рукава
 * используется статичный fallback, для корпуса — исходная anchor-раскладка.
 */
export function isWarpMeshSafe(mesh, minArea = 3) {
  if (!mesh?.rows || mesh.rows.length < 2) return false;
  const sleeveCanRunUpward = mesh.kind === 'sleeve' || mesh.kind === 'sleeve-static';
  let expectedSign = null;
  for (let i = 0; i < mesh.rows.length - 1; i++) {
    const top = mesh.rows[i];
    const bottom = mesh.rows[i + 1];
    const points = [top.left, top.right, bottom.left, bottom.right];
    if (!points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return false;
    const areas = [
      triangleArea(top.left, top.right, bottom.left),
      triangleArea(top.right, bottom.right, bottom.left),
    ];
    if (areas.some((area) => Math.abs(area) <= minArea)) return false;
    if (!sleeveCanRunUpward && areas.some((area) => area < 0)) return false;
    for (const area of areas) {
      const sign = Math.sign(area);
      if (expectedSign == null) expectedSign = sign;
      else if (sign !== expectedSign) return false;
    }
  }
  return true;
}

function interpolateSleeveSource(a, b, amount) {
  const lerpPair = (p, q) => [
    p[0] + (q[0] - p[0]) * amount,
    p[1] + (q[1] - p[1]) * amount,
  ];
  return {
    left: lerpPair(a.left, b.left),
    right: lerpPair(a.right, b.right),
  };
}

/**
 * Два независимых рукава по цепочкам плечо → локоть → кисть.
 * Конфигурация исходных точек хранится рядом с ассетом в manifest.json.
 */
export function buildSleeveMeshes(lm, W, H, costume) {
  const sleeveFit = costume.fit?.sleeves;
  if (!sleeveFit || settings.positioningStrategy === 'fixed') return null;

  const rawArms = [
    armFrame(
      toPx(lm[LM.LEFT_SHOULDER], W, H),
      toPx(lm[LM.LEFT_ELBOW], W, H),
      toPx(lm[LM.LEFT_WRIST], W, H),
      [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST],
    ),
    armFrame(
      toPx(lm[LM.RIGHT_SHOULDER], W, H),
      toPx(lm[LM.RIGHT_ELBOW], W, H),
      toPx(lm[LM.RIGHT_WRIST], W, H),
      [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
    ),
  ].sort((a, b) => a.shoulder.x - b.shoulder.x);

  const shoulderSpan = pointDistance(rawArms[0].shoulder, rawArms[1].shoulder);
  const anchorSpan = Math.abs(
    costume.anchors.right_shoulder[0] - costume.anchors.left_shoulder[0],
  );
  if (shoulderSpan < 2 || anchorSpan < 1) return null;
  const scale = shoulderSpan / anchorSpan * settings.overlay.bodyScaleFactor;
  const result = {};

  for (const [index, side] of ['left', 'right'].entries()) {
    const arm = rawArms[index];
    const indices = arm.indices;
    if (!indices.every((i) => lm[i]?.visibility >= 0.42)) {
      result[side] = null;
      continue;
    }

    const upper = {
      x: arm.elbow.x - arm.shoulder.x,
      y: arm.elbow.y - arm.shoulder.y,
    };
    const lower = {
      x: arm.wrist.x - arm.elbow.x,
      y: arm.wrist.y - arm.elbow.y,
    };
    const upperLength = Math.hypot(upper.x, upper.y) || 1;
    const lowerLength = Math.hypot(lower.x, lower.y) || 1;
    const minSegment = shoulderSpan * (sleeveFit.min_segment_ratio ?? 0.16);
    const maxSegment = shoulderSpan * (sleeveFit.max_segment_ratio ?? 1.25);
    // Единичный выброс кисти/локтя не должен превращать рукав в длинный клин.
    if (
      upperLength < minSegment || lowerLength < minSegment ||
      upperLength > maxSegment || lowerLength > maxSegment
    ) {
      result[side] = null;
      continue;
    }
    const shoulderTangent = { x: upper.x / upperLength, y: upper.y / upperLength };
    const wristTangent = { x: lower.x / lowerLength, y: lower.y / lowerLength };
    const elbowTangent = jointDirection(arm.shoulder, arm.elbow, arm.wrist);
    const source = sleeveFit[side].rows;
    const upperSource = interpolateSleeveSource(source.shoulder, source.elbow, 0.20);
    const forearmSource = interpolateSleeveSource(source.elbow, source.wrist, 0.45);
    const upperCenter = mixPoint(arm.shoulder, arm.elbow, 0.20);
    const forearmCenter = mixPoint(arm.elbow, arm.wrist, 0.45);

    const mesh = {
      sourceWidth: costume.anchors.canvas[0],
      sourceHeight: costume.anchors.canvas[1],
      kind: 'sleeve',
      // Отрицательный z направлен к камере. Рука перед грудью рисуется поверх корпуса.
      inFront: (
        ((lm[indices[1]].z ?? 0) + (lm[indices[2]].z ?? 0)) / 2 -
        (lm[indices[0]].z ?? 0)
      ) < -0.07,
      rows: [
        sleeveTargetRow(source.shoulder, arm.shoulder, shoulderTangent, scale),
        sleeveTargetRow(upperSource, upperCenter, shoulderTangent, scale),
        sleeveTargetRow(source.elbow, arm.elbow, elbowTangent, scale),
        sleeveTargetRow(forearmSource, forearmCenter, wristTangent, scale),
        sleeveTargetRow(source.wrist, arm.wrist, wristTangent, scale),
      ],
    };
    result[side] = isWarpMeshSafe(mesh) ? mesh : null;
  }
  return result;
}

function bodyRowAt(mesh, sourceY) {
  const rows = mesh.rows;
  if (sourceY <= rows[0].sourceY) return rows[0];
  if (sourceY >= rows.at(-1).sourceY) return rows.at(-1);
  for (let i = 0; i < rows.length - 1; i++) {
    const top = rows[i];
    const bottom = rows[i + 1];
    if (sourceY < top.sourceY || sourceY > bottom.sourceY) continue;
    const span = bottom.sourceY - top.sourceY || 1;
    const t = (sourceY - top.sourceY) / span;
    return {
      sourceY,
      left: mixPoint(top.left, bottom.left, t),
      right: mixPoint(top.right, bottom.right, t),
    };
  }
  return rows.at(-1);
}

function mapSourceX(row, sourceX, sourceWidth) {
  return mixPoint(row.left, row.right, clamp(sourceX / sourceWidth, 0, 1));
}

function staticSleeveRow(bodyMesh, source) {
  const sourceY = (source.left[1] + source.right[1]) / 2;
  const bodyRow = bodyRowAt(bodyMesh, sourceY);
  return {
    sourceY,
    sourceLeft: source.left[0],
    sourceRight: source.right[0],
    left: mapSourceX(bodyRow, source.left[0], bodyMesh.sourceWidth),
    right: mapSourceX(bodyRow, source.right[0], bodyMesh.sourceWidth),
  };
}

/**
 * Статичная поза рукавов в координатах текущего корпуса. Она сохраняет исходное
 * положение PNG и используется при потере локтя/кисти вместо ошибочного
 * растягивания узкого слоя сеткой всего корпуса.
 */
export function buildStaticSleeveMeshes(bodyMesh, costume) {
  const sleeveFit = costume.fit?.sleeves;
  if (!bodyMesh || !sleeveFit) return null;
  const result = {};
  for (const side of ['left', 'right']) {
    const source = sleeveFit[side].rows;
    const rows = [
      source.shoulder,
      interpolateSleeveSource(source.shoulder, source.elbow, 0.20),
      source.elbow,
      interpolateSleeveSource(source.elbow, source.wrist, 0.45),
      source.wrist,
    ].map((row) => staticSleeveRow(bodyMesh, row));
    const mesh = {
      sourceWidth: bodyMesh.sourceWidth,
      sourceHeight: bodyMesh.sourceHeight,
      kind: 'sleeve-static',
      inFront: false,
      rows,
    };
    result[side] = isWarpMeshSafe(mesh, 0.5) ? mesh : null;
  }
  return result;
}

/**
 * Сетка деформации нательного PNG. В отличие от одного drawImage-прямоугольника,
 * она привязывает одежду к нескольким сечениям корпуса и к ногам, когда они видны.
 * Если ноги вне кадра, низ безопасно продолжается по оси плечи → таз.
 * Ряды описывают границы горизонтальных полос исходной картинки.
 */
export function buildBodyMesh(lm, W, H, costume) {
  const warp = settings.overlay.bodyWarp;
  if (!warp?.enabled || settings.positioningStrategy === 'fixed') return null;

  const shoulders = pairFrame(
    toPx(lm[LM.LEFT_SHOULDER], W, H),
    toPx(lm[LM.RIGHT_SHOULDER], W, H),
  );
  const hips = pairFrame(
    toPx(lm[LM.LEFT_HIP], W, H),
    toPx(lm[LM.RIGHT_HIP], W, H),
    shoulders.direction,
  );
  const anchors = costume.anchors;
  const shoulderAnchorWidth = Math.abs(
    anchors.right_shoulder[0] - anchors.left_shoulder[0],
  );
  if (shoulders.span < 2 || shoulderAnchorWidth < 1) return null;

  const k = (shoulders.span / shoulderAnchorWidth) * settings.overlay.bodyScaleFactor;
  const baseHalfWidth = anchors.canvas[0] * k / 2;
  const sourceShoulderY = (anchors.left_shoulder[1] + anchors.right_shoulder[1]) / 2;
  const sourceBelowShoulders = anchors.canvas[1] - sourceShoulderY;
  const torsoDirectionRaw = {
    x: hips.center.x - shoulders.center.x,
    y: hips.center.y - shoulders.center.y,
  };
  const torsoLength = Math.hypot(torsoDirectionRaw.x, torsoDirectionRaw.y) || 1;
  const torsoDirection = {
    x: torsoDirectionRaw.x / torsoLength,
    y: torsoDirectionRaw.y / torsoLength,
  };
  const minVis = settings.overlay.minVisibility;
  const pairVisible = (left, right) =>
    lm[left]?.visibility >= minVis && lm[right]?.visibility >= minVis;
  const projectedCenter = (origin, distance, maxY) => {
    const raw = {
      x: origin.x + torsoDirection.x * distance,
      y: origin.y + torsoDirection.y * distance,
    };
    if (raw.y <= maxY || raw.y <= origin.y) return raw;
    const amount = (maxY - origin.y) / (raw.y - origin.y);
    return mixPoint(origin, raw, clamp(amount, 0, 1));
  };
  const fallbackFrame = (center, span, direction) => ({ center, span, direction });

  let knees = pairVisible(LM.LEFT_KNEE, LM.RIGHT_KNEE)
    ? pairFrame(
      toPx(lm[LM.LEFT_KNEE], W, H),
      toPx(lm[LM.RIGHT_KNEE], W, H),
      hips.direction,
    )
    : null;
  if (!knees || knees.center.y <= hips.center.y + H * 0.025) {
    knees = fallbackFrame(
      projectedCenter(hips.center, torsoLength * 0.95, H * 0.88),
      hips.span * 0.86,
      hips.direction,
    );
  }

  let ankles = pairVisible(LM.LEFT_ANKLE, LM.RIGHT_ANKLE)
    ? pairFrame(
      toPx(lm[LM.LEFT_ANKLE], W, H),
      toPx(lm[LM.RIGHT_ANKLE], W, H),
      knees.direction,
    )
    : null;
  if (!ankles || ankles.center.y <= knees.center.y + H * 0.025) {
    ankles = fallbackFrame(
      projectedCenter(hips.center, torsoLength * 2.05, H * 1.02),
      hips.span * 0.72,
      knees.direction,
    );
  }
  if (settings.positioningStrategy === 'hybrid') {
    // Низ сохраняет настоящую высоту, но его центр меньше реагирует на шум
    // коленей/стоп. Так корпус остаётся многоточечным, а подол не «гуляет».
    const stabilizeLowerCenter = (frame, liveAmount) => {
      const dy = frame.center.y - hips.center.y;
      const projected = {
        x: hips.center.x + torsoDirection.x * Math.abs(dy),
        y: frame.center.y,
      };
      return { ...frame, center: mixPoint(projected, frame.center, liveAmount) };
    };
    knees = stabilizeLowerCenter(knees, 0.42);
    ankles = stabilizeLowerCenter(ankles, 0.30);
  }
  const topCenter = {
    x: shoulders.center.x - torsoDirection.x * sourceShoulderY * k,
    y: shoulders.center.y - torsoDirection.y * sourceShoulderY * k,
  };
  const waistCenter = mixPoint(shoulders.center, hips.center, warp.waistPosition);
  const chestAmount = warp.waistPosition * 0.48;
  const chestCenter = mixPoint(shoulders.center, hips.center, chestAmount);
  const highHipCenter = mixPoint(waistCenter, hips.center, 0.52);

  // Корректируем ширину мягко: крой (клёш, рукава, бурка) уже находится в альфа-канале PNG.
  const shapeScale = (span, reference) => clamp(
    (span / shoulders.span) / reference,
    warp.minShapeScale,
    warp.maxShapeScale,
  );
  const waistSpan = shoulders.span + (hips.span - shoulders.span) * warp.waistPosition;
  const waistScale = shapeScale(waistSpan, warp.referenceWidth.waist);
  const hipScale = shapeScale(hips.span, warp.referenceWidth.hips);
  const chestScale = 1 + (waistScale - 1) * 0.48;
  const highHipScale = waistScale + (hipScale - waistScale) * 0.52;
  const kneeScale = hipScale * 0.7 + 0.3;
  const hemScale = hipScale * 0.35 + 0.65;

  const hipDirection = blendDirection(shoulders.direction, hips.direction, 0.45);
  const kneeDirection = blendDirection(hipDirection, knees.direction, 0.2);
  const ankleDirection = blendDirection(kneeDirection, ankles.direction, 0.12);
  const source = { ...warp.sourceRows, ...(costume.fit?.body_rows ?? {}) };
  const sourceWaistY = sourceShoulderY + sourceBelowShoulders * source.waist;
  const sourceHipY = sourceShoulderY + sourceBelowShoulders * source.hips;

  return {
    sourceWidth: anchors.canvas[0],
    sourceHeight: anchors.canvas[1],
    rows: [
      meshRow(0, topCenter, shoulders.direction, baseHalfWidth),
      meshRow(sourceShoulderY, shoulders.center, shoulders.direction, baseHalfWidth),
      meshRow(
        sourceShoulderY + (sourceWaistY - sourceShoulderY) * 0.48,
        chestCenter,
        blendDirection(shoulders.direction, hipDirection, chestAmount),
        baseHalfWidth * chestScale,
      ),
      meshRow(
        sourceWaistY,
        waistCenter,
        blendDirection(shoulders.direction, hipDirection, warp.waistPosition),
        baseHalfWidth * waistScale,
      ),
      meshRow(
        sourceWaistY + (sourceHipY - sourceWaistY) * 0.52,
        highHipCenter,
        hipDirection,
        baseHalfWidth * highHipScale,
      ),
      meshRow(
        sourceHipY,
        hips.center,
        hipDirection,
        baseHalfWidth * hipScale,
      ),
      meshRow(
        sourceShoulderY + sourceBelowShoulders * source.knees,
        knees.center,
        kneeDirection,
        baseHalfWidth * kneeScale,
      ),
      meshRow(
        sourceShoulderY + sourceBelowShoulders * source.hem,
        ankles.center,
        ankleDirection,
        baseHalfWidth * hemScale,
      ),
    ],
  };
}

/**
 * Раскладка нательного костюма и головного убора для одного человека.
 * @param {Array} lm нормированные landmarks (0..1)
 * @param {number} W,H размеры видео в пикселях
 * @param {object} costume запись из manifest.costumes
 * @param {object|null} headwear запись из manifest.headwear
 * @returns {{ body: object, head: object|null }}
 */
export function layoutCostume(lm, W, H, costume, headwear) {
  if (settings.positioningStrategy === 'fixed') return layoutFixed(W, H, costume, headwear);

  const Lsh = toPx(lm[LM.LEFT_SHOULDER], W, H);
  const Rsh = toPx(lm[LM.RIGHT_SHOULDER], W, H);
  const body = layoutByAnchors(
    Lsh, Rsh, costume.anchors, 'left_shoulder', 'right_shoulder',
    settings.overlay.bodyScaleFactor,
  );

  let head = null;
  if (headwear) {
    const Lear = toPx(lm[LM.LEFT_EAR], W, H);
    const Rear = toPx(lm[LM.RIGHT_EAR], W, H);
    const mesh = buildHeadwearMesh(lm, W, H, headwear);
    head = mesh
      ? { mesh }
      : layoutByAnchors(
        Lear, Rear, headwear.anchors, 'left_ear', 'right_ear',
        settings.overlay.headScaleFactor, settings.overlay.headLiftFactor,
      );
  }
  return { body, bodyMesh: buildBodyMesh(lm, W, H, costume), head };
}

/** План Б: костюм в фиксированной рамке, человек встаёт на метку на полу. */
function layoutFixed(W, H, costume, headwear) {
  const f = settings.fixedFrame;
  const Lsh = { x: (f.centerX - f.shoulderWidth / 2) * W, y: f.shoulderY * H };
  const Rsh = { x: (f.centerX + f.shoulderWidth / 2) * W, y: f.shoulderY * H };
  const anchorBody = layoutByAnchors(
    Lsh, Rsh, costume.anchors, 'left_shoulder', 'right_shoulder',
    settings.overlay.bodyScaleFactor,
  );
  const anchors = costume.anchors;
  const sourceShoulderY = (anchors.left_shoulder[1] + anchors.right_shoulder[1]) / 2;
  const sourceBelowShoulders = anchors.canvas[1] - sourceShoulderY;
  const source = {
    ...settings.overlay.bodyWarp.sourceRows,
    ...(costume.fit?.body_rows ?? {}),
  };
  const centerX = f.centerX * W;
  const shoulderHalfWidth = anchorBody.w / 2;
  const topY = Math.max(H * 0.02, Lsh.y - sourceShoulderY / anchors.canvas[1] * H * 0.7);
  const bodyMesh = {
    sourceWidth: anchors.canvas[0],
    sourceHeight: anchors.canvas[1],
    kind: 'body-fixed',
    rows: [
      meshRow(0, { x: centerX, y: topY }, { x: 1, y: 0 }, shoulderHalfWidth * 0.96),
      meshRow(sourceShoulderY, midpoint(Lsh, Rsh), { x: 1, y: 0 }, shoulderHalfWidth),
      meshRow(
        sourceShoulderY + sourceBelowShoulders * source.waist,
        { x: centerX, y: (f.shoulderY + (f.hipY - f.shoulderY) * settings.overlay.bodyWarp.waistPosition) * H },
        { x: 1, y: 0 },
        shoulderHalfWidth * 0.86,
      ),
      meshRow(
        sourceShoulderY + sourceBelowShoulders * source.hips,
        { x: centerX, y: f.hipY * H },
        { x: 1, y: 0 },
        shoulderHalfWidth * 0.92,
      ),
      meshRow(
        sourceShoulderY + sourceBelowShoulders * source.knees,
        { x: centerX, y: f.kneeY * H },
        { x: 1, y: 0 },
        shoulderHalfWidth * 0.88,
      ),
      meshRow(
        sourceShoulderY + sourceBelowShoulders * source.hem,
        { x: centerX, y: f.ankleY * H },
        { x: 1, y: 0 },
        shoulderHalfWidth * 0.82,
      ),
    ],
  };

  let head = null;
  if (headwear) {
    const width = f.shoulderWidth * W * f.headWidthFromShoulders;
    const aspect = headwear.anchors.canvas[1] / headwear.anchors.canvas[0];
    const height = width * aspect * (headwear.fit?.height_factor ?? 1);
    const bottom = f.headBottomY * H;
    head = { x: f.centerX * W - width / 2, y: bottom - height, w: width, h: height };
  }
  return { body: anchorBody, bodyMesh, head };
}

/**
 * Для посадки достаточно головы и корпуса. Колени и стопы улучшают низ костюма,
 * но не блокируют примерку, если человек показан по таз или ноги вне кадра.
 */
export function isPoseConfident(lm) {
  const minVis = settings.overlay.minVisibility;
  const required = [
    LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
    LM.LEFT_HIP, LM.RIGHT_HIP,
  ];
  if (!required.every((i) => lm[i] && lm[i].visibility >= minVis)) return false;

  const noseVisible = lm[LM.NOSE]?.visibility >= minVis;
  const earsVisible =
    lm[LM.LEFT_EAR]?.visibility >= minVis && lm[LM.RIGHT_EAR]?.visibility >= minVis;
  if (!noseVisible && !earsVisible) return false;

  const shoulderY = (lm[LM.LEFT_SHOULDER].y + lm[LM.RIGHT_SHOULDER].y) / 2;
  const hipY = (lm[LM.LEFT_HIP].y + lm[LM.RIGHT_HIP].y) / 2;
  const headY = noseVisible
    ? lm[LM.NOSE].y
    : (lm[LM.LEFT_EAR].y + lm[LM.RIGHT_EAR].y) / 2;
  const shoulderSpan = pointDistance(lm[LM.LEFT_SHOULDER], lm[LM.RIGHT_SHOULDER]);
  const hipSpan = pointDistance(lm[LM.LEFT_HIP], lm[LM.RIGHT_HIP]);
  return (
    headY < shoulderY - 0.02 &&
    hipY > shoulderY + 0.035 &&
    shoulderSpan > 0.025 &&
    hipSpan > 0.018
  );
}

/** Площадь бокса скелета — для выбора самого крупного (ближайшего) человека. */
export function skeletonArea(lm) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of lm) {
    if (p.visibility < 0.3) continue;
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
}
