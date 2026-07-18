/**
 * Обёртка над MediaPipe GestureRecognizer (on-device, WASM).
 * Распознаёт канонические жесты руки: Open_Palm ✋, Closed_Fist ✊,
 * Pointing_Up ☝️, Victory ✌️, Thumb_Up 👍, Thumb_Down 👎, ILoveYou, None.
 *
 * Тот же движок и FilesetResolver, что и Pose Landmarker — без сторонних библиотек.
 * Любая ошибка инференса — это null, а не падение.
 */
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import { settings } from '../config/settings.js';

let recognizer = null;

export async function initGestureRecognizer() {
  if (recognizer) return recognizer;
  const fileset = await FilesetResolver.forVisionTasks(settings.paths.wasm);
  recognizer = await GestureRecognizer.createFromOptions(fileset, {
    // Pose остаётся на GPU, жесты на CPU: два графа больше не спорят за GPU.
    baseOptions: { modelAssetPath: settings.paths.gestureModel, delegate: 'CPU' },
    runningMode: 'VIDEO',
    numHands: settings.gesture.numHands,
    minHandDetectionConfidence: settings.gesture.minConfidence,
    minHandPresenceConfidence: settings.gesture.minConfidence,
    minTrackingConfidence: settings.gesture.minConfidence,
  });
  return recognizer;
}

const handDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

function fingerExtended(lm, tip, pip) {
  return handDist(lm[tip], lm[0]) > handDist(lm[pip], lm[0]) * 1.13;
}

/** Резервный классификатор по геометрии 21 точки кисти. */
export function classifyHandGeometry(lm) {
  if (!lm?.[20]) return { name: 'None', score: 0 };
  const index = fingerExtended(lm, 8, 6);
  const middle = fingerExtended(lm, 12, 10);
  const ring = fingerExtended(lm, 16, 14);
  const pinky = fingerExtended(lm, 20, 18);
  const thumb =
    handDist(lm[4], lm[0]) > handDist(lm[3], lm[0]) * 1.12 &&
    handDist(lm[4], lm[3]) > handDist(lm[3], lm[0]) * 0.55;
  const extendedCount = [index, middle, ring, pinky].filter(Boolean).length;

  if (extendedCount === 4) return { name: 'Open_Palm', score: 0.78 };
  if (index && middle && !ring && !pinky) return { name: 'Victory', score: 0.76 };
  if (index && !middle && !ring && !pinky) return { name: 'Pointing_Up', score: 0.74 };
  if (thumb && extendedCount === 0 && lm[4].y < lm[0].y - 0.06) {
    return { name: 'Thumb_Up', score: 0.74 };
  }
  if (!thumb && extendedCount === 0) return { name: 'Closed_Fist', score: 0.70 };
  return { name: 'None', score: 0 };
}

/**
 * Строгая проверка подтверждающей ладони: поднята, раскрыта, не ребром и
 * повёрнута ладонной стороной к камере (с учётом handedness MediaPipe).
 */
export function analyzeDeliberatePalm(lm, handedness = null) {
  if (!lm?.[20]) return { ready: false, reason: 'Рука не найдена' };
  const wrist = lm[0];
  const indexMcp = lm[5];
  const middleMcp = lm[9];
  const pinkyMcp = lm[17];
  const palmHeight = handDist(wrist, middleMcp);
  const palmWidth = handDist(indexMcp, pinkyMcp);
  if (palmHeight < settings.gesture.confirmPalmMinSize) {
    return { ready: false, reason: 'Поднесите ладонь ближе' };
  }
  if (wrist.y > settings.gesture.confirmPalmMaxWristY) {
    return { ready: false, reason: 'Поднимите ладонь выше' };
  }
  if (palmWidth / palmHeight < 0.58) {
    return { ready: false, reason: 'Поверните ладонь плоскостью к камере' };
  }

  const tips = [4, 8, 12, 16, 20];
  const raisedTips = tips.filter((i) => lm[i].y < wrist.y - palmHeight * 0.35).length;
  if (raisedTips < 4) return { ready: false, reason: 'Раскройте четыре пальца' };

  const ax = indexMcp.x - wrist.x;
  const ay = indexMcp.y - wrist.y;
  const bx = pinkyMcp.x - wrist.x;
  const by = pinkyMcp.y - wrist.y;
  const cross = ax * by - ay * bx;
  const facing = Math.abs(cross) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1);
  if (facing < settings.gesture.confirmPalmMinFacing) {
    return { ready: false, reason: 'Не показывайте ладонь ребром' };
  }

  // GestureRecognizer получает немирроренный видеокадр: у правой ладони
  // порядок index→pinky даёт положительную нормаль, у левой — отрицательную.
  if (handedness === 'Right' && cross <= 0) {
    return { ready: false, reason: 'Покажите лицевую сторону ладони' };
  }
  if (handedness === 'Left' && cross >= 0) {
    return { ready: false, reason: 'Покажите лицевую сторону ладони' };
  }
  return { ready: true, reason: 'Ладонь готова', facing, handedness };
}

export function isDeliberatePalm(lm, handedness = null) {
  return analyzeDeliberatePalm(lm, handedness).ready;
}

/**
 * @returns {{name:string, score:number, wrist:{x,y}|null}|null}
 *          name === 'None', если рука есть, но жест не распознан;
 *          null — при ошибке инференса.
 */
export function recognizeGesture(video, timestampMs) {
  if (!recognizer) return null;
  try {
    const res = recognizer.recognizeForVideo(video, timestampMs);
    const g = res.gestures?.[0]?.[0];
    const hand = res.landmarks?.[0] ?? null;
    const rawHandedness = (
      res.handedness?.[0]?.[0]?.categoryName ??
      res.handednesses?.[0]?.[0]?.categoryName ??
      null
    );
    // Сохраняем поведение, откалиброванное на демонстрационном selfie-потоке:
    // handedness используется напрямую, без дополнительной перестановки сторон.
    const handedness = rawHandedness;
    const wristLm = hand?.[0] ?? null;
    // Координаты руки зеркалим под зеркальное видео.
    const wrist = wristLm ? { x: 1 - wristLm.x, y: wristLm.y } : null;
    const geometry = classifyHandGeometry(hand);
    const palm = analyzeDeliberatePalm(hand, handedness);
    const palmReady = palm.ready;
    const gatePalm = (candidate) => {
      if (candidate.name === 'Open_Palm' && !palmReady) {
        return {
          name: 'None', score: 0, wrist, source: 'palm-rejected',
          palmReady: false, palmReason: palm.reason, handedness,
        };
      }
      return { ...candidate, wrist, palmReady, palmReason: palm.reason, handedness };
    };
    if (g && g.score >= settings.gesture.modelConfidence) {
      return gatePalm({ name: g.categoryName, score: g.score, source: 'model' });
    }
    if (geometry.name !== 'None') {
      return gatePalm({ ...geometry, source: 'geometry' });
    }
    if (g && g.score >= settings.gesture.minConfidence) {
      return gatePalm({ name: g.categoryName, score: g.score, source: 'model-low' });
    }
    return {
      name: 'None', score: 0, wrist, source: 'none', palmReady: false,
      palmReason: palm.reason, handedness,
    };
  } catch (err) {
    console.error('Gesture inference failed:', err);
    return null;
  }
}

export function closeGestureRecognizer() {
  try {
    recognizer?.close();
  } finally {
    recognizer = null;
  }
}
