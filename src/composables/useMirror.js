/**
 * Оркестратор «зеркала»: камера → поза → сглаживание → отрисовка → снимок.
 * Один requestAnimationFrame-цикл на всё приложение.
 */
import QRCode from 'qrcode';
import { settings } from '../config/settings.js';
import { appState, SCREENS, goTo, resetToIdle, currentCostumeId, touchActivity } from '../store/appState.js';
import { loadAssets } from '../core/assets.js';
import { initPoseTracker, detectPoses, closePoseTracker } from '../core/poseTracker.js';
import {
  initGestureRecognizer,
  recognizeGesture,
  closeGestureRecognizer,
} from '../core/gestureRecognizer.js';
import { GestureController } from '../core/gestureController.js';
import { SideGestureNavigator } from '../core/sideGestureNavigator.js';
import {
  nextCostume, prevCostume, toggleHeadwear, toggleDescription,
} from '../store/appState.js';
import { LandmarkSmoother } from '../core/smoothing.js';
import { BodyClassSampler, computeBodyRatio, classifyByRatio } from '../core/bodyClassifier.js';
import { isPoseConfident, skeletonArea } from '../core/costumeLayout.js';
import {
  drawMirroredVideo, drawPersonCostume, drawSkeleton, resetSleeveSmoothing,
} from '../core/renderer.js';
import { composePhoto, closePhotoProcessor } from '../core/photoProcessor.js';

const video = document.createElement('video');
video.playsInline = true;
video.muted = true;

/** Состояние трекинга по слотам людей (индекс позы MediaPipe). */
function makeTrack() {
  return {
    smoother: new LandmarkSmoother(),
    sampler: new BodyClassSampler(),
    lostFrames: 0,
    opacity: 0,
    confident: false,
    everConfident: false,
    bodyClass: 'regular',
    lm: null,
  };
}
const tracks = Array.from({ length: settings.pose.numPoses }, makeTrack);

let canvas = null;
let ctx = null;
let running = false;
let countdownActive = false;
let animationFrameId = null;
let countdownStartedAt = null;

const gestureCtl = new GestureController();
const sideNavigator = new SideGestureNavigator({
  holdMs: settings.gesture.navigationHoldMs,
  dropoutGraceMs: settings.gesture.navigationDropoutGraceMs,
});
let lastGestureAt = -Infinity;
/** Последний набор активных слотов — переиспользуем на кадрах без нового видео. */
let lastActive = [];
/** Гистерезис подсказки позы: сколько новых кадров подряд поза «неуверенная». */
let unconfidentFrames = 0;
/** Число найденных поз, включая частичные, на последнем видеокадре. */
let lastDetectedCount = 0;
const perf = {
  poseTotal: 0, poseCount: 0,
  gestureTotal: 0, gestureCount: 0,
  renderTotal: 0, renderCount: 0,
  frameTotal: 0, frameCount: 0,
};

/** Зеркалим нормированные координаты, чтобы совпадали с зеркальным видео. */
function mirrorLandmarks(lm) {
  return lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z ?? 0, visibility: p.visibility }));
}

export async function startMirror(canvasEl) {
  if (running) return;
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  try {
    // Сначала ассеты и модели: их ошибки видны сразу, а загрузка идёт,
    // пока посетитель разрешает доступ к камере.
    await Promise.all([loadAssets(), initPoseTracker(), initGestureRecognizer()]);

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    appState.ready = true;
    running = true;
    animationFrameId = requestAnimationFrame(loop);
  } catch (err) {
    stopMirror();
    throw err;
  }
}

let lastVideoTime = -1;
let fpsCount = 0;
let fpsStamp = performance.now();

function loop(now) {
  if (!running) return;
  const frameStartedAt = performance.now();
  try {
    tick(now);
  } catch (err) {
    // Никогда не показываем «сырое» падение: любой сбой цикла — мягкий сброс в IDLE.
    console.error('Frame loop failed, resetting to IDLE:', err);
    resetToIdle();
  }
  recordPerf('frame', performance.now() - frameStartedAt);
  animationFrameId = requestAnimationFrame(loop);
}

function tick(now) {
  const W = canvas.width;
  const H = canvas.height;
  const isNewFrame = video.currentTime !== lastVideoTime;
  if (isNewFrame) lastVideoTime = video.currentTime;

  if (appState.screen === SCREENS.LIVE && countdownActive) updateCaptureCountdown(now);

  // Во время сегментации полностью останавливаем остальные ML-инференсы.
  if (appState.screen === SCREENS.PROCESSING) return;

  // В RESULT оставляем только жест «ещё раз», поза скрыта и не нужна.
  if (appState.screen === SCREENS.RESULT) {
    if (isNewFrame && now - lastGestureAt >= settings.gesture.intervalMs) {
      lastGestureAt = now;
      updateGesture(now);
    }
    return;
  }

  // Инференс позы — только на новых кадрах видео.
  let poses = null;
  if (isNewFrame) {
    const startedAt = performance.now();
    poses = detectPoses(video, now);
    recordPerf('pose', performance.now() - startedAt);
  }

  // Распознавание жеста — реже позы (бережём fps), тоже только на новых кадрах.
  if (isNewFrame && now - lastGestureAt >= settings.gesture.intervalMs) {
    lastGestureAt = now;
    updateGesture(now);
  }

  const renderStartedAt = performance.now();
  drawMirroredVideo(ctx, video, W, H);

  // Трекинг обновляем ТОЛЬКО на новых кадрах видео. Иначе на «пустых» кадрах
  // rAF поза считалась бы потерянной — отсюда дрожание костюма и мигание подсказки.
  if (isNewFrame) lastActive = updateTracks(poses, now);
  const active = lastActive;
  appState.personPresent = lastDetectedCount > 0;

  if (appState.screen === SCREENS.LIVE) renderLive(active, W, H, isNewFrame);
  recordPerf('render', performance.now() - renderStartedAt);

  countFps(now);
}

/** Один шаг распознавания жеста + диспетчер действий по текущему экрану. */
function updateGesture(now) {
  const startedAt = performance.now();
  // Для входа важна отзывчивость: достаточно устойчиво раскрытой ладони.
  // Для фото и повторной съёмки сохраняем строгую проверку стороны/положения кисти.
  const g = recognizeGesture(video, now, {
    requireDeliberatePalm: appState.screen !== SCREENS.IDLE,
  });
  recordPerf('gesture', performance.now() - startedAt);
  // В LIVE раскрытая ладонь больше не является командой: для фото используется
  // отдельный, лучше различимый жест 👎. Ладонь остаётся только входом/«ещё раз».
  if (countdownActive) sideNavigator.reset();
  const navigation = appState.screen === SCREENS.LIVE && !countdownActive
    ? sideNavigator.update(g, now)
    : { direction: null, progress: 0, action: null };
  appState.navigationDirection = navigation.direction;
  appState.navigationProgress = navigation.progress;
  if (navigation.action === 'next') nextCostume();
  else if (navigation.action === 'prev') prevCostume();

  const controlGesture = appState.screen === SCREENS.LIVE && ['Open_Palm', 'Victory'].includes(g?.name)
    ? 'None'
    : (g?.name ?? 'None');
  const ev = gestureCtl.update(controlGesture, now);
  appState.gesture = navigation.direction ? 'Victory' : ev.name;
  appState.gestureSource = g?.source ?? 'none';
  appState.palmReady = g?.palmReady ?? false;
  appState.palmReason = g?.palmReason ?? 'Рука не найдена';
  appState.holdProgress = ev.progress;
  dispatchGesture(appState.screen, ev);
}

function dispatchGesture(screen, ev) {
  const { tap, hold } = ev;
  if (screen === SCREENS.IDLE) {
    if (hold || tap === 'Victory') enterLive(); // ✋ удержание или ✌️ — начать примерку
    return;
  }
  if (screen === SCREENS.LIVE) {
    if (countdownActive) return;
    if (tap === 'Pointing_Up') toggleDescription();
    else if (tap === 'Closed_Fist') toggleHeadwear();
    else if (tap === 'Thumb_Down') startCapture(); // 👎 — сделать фото
    return;
  }
  if (screen === SCREENS.RESULT) {
    if (hold || tap === 'Thumb_Up') backToLive(); // ещё раз
  }
}

export function enterLive() {
  gestureCtl.reset({ requireRelease: true });
  sideNavigator.reset();
  appState.holdProgress = 0;
  appState.countdownProgress = 0;
  goTo(SCREENS.LIVE);
}

export function backToLive() {
  gestureCtl.reset({ requireRelease: true });
  sideNavigator.reset();
  appState.holdProgress = 0;
  appState.countdownProgress = 0;
  appState.photoUrl = null;
  appState.qrUrl = null;
  appState.qrStatus = 'idle';
  appState.qrError = null;
  appState.shareUrl = null;
  goTo(SCREENS.LIVE);
}

/**
 * Обновляет слоты трекинга свежими позами.
 * @returns {number[]} индексы активных слотов для отрисовки (учитывая peopleMode)
 */
function updateTracks(poses, timestampMs = performance.now()) {
  const maxLost = settings.overlay.maxLostFrames;
  const fade = settings.overlay.fadeStep;

  if (poses) {
    lastDetectedCount = poses.filter(Boolean).length;
    const assignedPoses = assignPosesToTracks(poses);
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const lm = assignedPoses[i];
      if (lm) {
        t.confident = isPoseConfident(lm);
        if (t.confident) {
          // Только полная проверенная поза обновляет рендер. При частичной позе
          // держим последнюю корректную геометрию и затем плавно её скрываем.
          t.lm = t.smoother.update(lm, timestampMs);
          t.lostFrames = 0;
          t.everConfident = true;
        } else {
          t.lostFrames++;
        }
      } else {
        t.confident = false;
        t.lostFrames++;
      }
    }
  } else {
    lastDetectedCount = 0;
    for (const t of tracks) {
      t.confident = false;
      t.lostFrames++;
    }
  }

  // Плавное появление/затухание костюма вместо дёрганья
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const target = t.everConfident && t.lostFrames < maxLost && t.lm ? 1 : 0;
    t.opacity += Math.sign(target - t.opacity) * Math.min(fade, Math.abs(target - t.opacity));
    if (t.lostFrames > maxLost * 4) {
      t.smoother.reset();
      resetSleeveSmoothing(i);
      t.lm = null;
      t.everConfident = false;
    }
  }

  const alive = tracks
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.lm && t.opacity > 0.01);

  if (settings.peopleMode === 'single' && alive.length > 1) {
    // Режим по умолчанию: самый крупный (ближайший) скелет, остальных игнорируем
    alive.sort((a, b) => skeletonArea(b.t.lm) - skeletonArea(a.t.lm));
    return [alive[0].i];
  }
  return alive.map(({ i }) => i);
}

function poseCenter(lm) {
  const points = [11, 12, 23, 24].map((i) => lm?.[i]).filter(Boolean);
  if (!points.length) return null;
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  };
}

/**
 * MediaPipe может менять порядок двух людей между кадрами. Привязываем свежие
 * позы к ближайшим существующим трекам, чтобы одежда не перескакивала между ними.
 */
function assignPosesToTracks(poses) {
  const candidates = poses.filter(Boolean).map(mirrorLandmarks);
  const assigned = Array(tracks.length).fill(null);
  const usedTracks = new Set();
  const usedCandidates = new Set();
  const pairs = [];

  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const previous = poseCenter(tracks[trackIndex].lm);
    if (!previous) continue;
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
      const next = poseCenter(candidates[candidateIndex]);
      if (!next) continue;
      pairs.push({
        trackIndex,
        candidateIndex,
        distance: Math.hypot(next.x - previous.x, next.y - previous.y),
      });
    }
  }
  pairs.sort((a, b) => a.distance - b.distance);
  for (const pair of pairs) {
    if (usedTracks.has(pair.trackIndex) || usedCandidates.has(pair.candidateIndex)) continue;
    assigned[pair.trackIndex] = candidates[pair.candidateIndex];
    usedTracks.add(pair.trackIndex);
    usedCandidates.add(pair.candidateIndex);
  }

  const remainingCandidates = candidates
    .map((lm, index) => ({ lm, index, x: poseCenter(lm)?.x ?? 0.5 }))
    .filter(({ index }) => !usedCandidates.has(index))
    .sort((a, b) => a.x - b.x);
  const remainingTracks = tracks
    .map((_, index) => index)
    .filter((index) => !usedTracks.has(index));
  for (let i = 0; i < remainingCandidates.length; i++) {
    assigned[remainingTracks[i]] = remainingCandidates[i].lm;
  }
  return assigned;
}

function renderLive(activeIdx, W, H, isNewFrame) {
  const costumeId = currentCostumeId();
  let anyConfident = false;

  for (const i of activeIdx) {
    const t = tracks[i];
    if (t.confident) anyConfident = true;

    // Во время таймера копим выборку r для медианы
    if (countdownActive && isNewFrame) t.sampler.add(computeBodyRatio(t.lm));

    const id = pickCostumeFor(i, activeIdx.length, costumeId);
    drawPersonCostume(
      ctx,
      t.lm,
      W,
      H,
      id,
      t.bodyClass,
      t.opacity,
      appState.showHeadwear,
      appState.debug,
      i,
      performance.now(),
      isNewFrame,
    );

    if (appState.debug) drawSkeleton(ctx, t.lm, W, H);
  }

  appState.poseReady = anyConfident;
  appState.captureBlockReason = anyConfident
    ? null
    : lastDetectedCount > 0
      ? 'Покажите голову, плечи, талию и таз'
      : 'Человек не найден в кадре';

  // Живой r в debug-режиме — по главному человеку
  if (appState.debug && activeIdx.length) {
    const r = computeBodyRatio(tracks[activeIdx[0]].lm);
    if (r != null) {
      appState.debugRatio = r;
      appState.debugClass = classifyByRatio(r);
    }
  }

  updatePoseHint(lastDetectedCount > 0, anyConfident, isNewFrame);
}

/**
 * Подсказка позы с гистерезисом: показываем только после устойчивой потери
 * уверенности и сразу прячем, как поза вернулась — иначе на границе мигает.
 * Счётчик двигаем лишь на новых кадрах видео (единый темп с трекингом).
 */
function updatePoseHint(present, anyConfident, isNewFrame) {
  if (!present) {
    unconfidentFrames = 0;
    appState.poseHint = null;
    return;
  }
  if (isNewFrame) {
    unconfidentFrames = anyConfident ? 0 : unconfidentFrames + 1;
  }
  if (anyConfident) appState.poseHint = null;
  else if (unconfidentFrames >= settings.overlay.hintDelayFrames) {
    appState.poseHint = 'Встаньте прямо, отойдите на шаг назад';
  }
}

/** Костюм для слота в мультирежиме: пресет «микс слева направо», в single — выбранный. */
function pickCostumeFor(slot, activeCount, selectedId) {
  if (settings.peopleMode !== 'multi' || activeCount <= 1) return selectedId;
  const ids = appState.costumeIds;
  return ids[(appState.costumeIndex + slot) % ids.length];
}

function countFps(now) {
  fpsCount++;
  if (now - fpsStamp >= 1000) {
    appState.fps = fpsCount;
    publishPerf();
    fpsCount = 0;
    fpsStamp = now;
  }
}

function recordPerf(kind, duration) {
  perf[`${kind}Total`] += duration;
  perf[`${kind}Count`]++;
}

function average(total, count) {
  return count ? total / count : 0;
}

function publishPerf() {
  appState.performance.poseMs = average(perf.poseTotal, perf.poseCount);
  appState.performance.gestureMs = average(perf.gestureTotal, perf.gestureCount);
  appState.performance.renderMs = average(perf.renderTotal, perf.renderCount);
  appState.performance.frameMs = average(perf.frameTotal, perf.frameCount);
  for (const key of Object.keys(perf)) perf[key] = 0;
}

/** Кнопка «Сделать фото»: таймер 3-2-1 с накоплением медианы r. */
export function startCapture() {
  if (countdownActive) {
    appState.captureBlockReason = 'Обратный отсчёт уже запущен';
    return;
  }
  if (appState.screen !== SCREENS.LIVE) {
    appState.captureBlockReason = 'Съёмка доступна только в режиме примерки';
    return;
  }
  if (!appState.poseReady) {
    appState.captureBlockReason = 'Покажите голову, плечи, талию и таз';
    return;
  }
  appState.captureBlockReason = null;
  countdownActive = true;
  for (const t of tracks) t.sampler.reset();
  // Сбрасываем удержание, чтобы кольцо ладони не перекрывало отсчёт 3-2-1.
  gestureCtl.reset({ requireRelease: true });
  appState.holdProgress = 0;
  appState.countdown = settings.timers.countdown;
  appState.countdownProgress = 0;
  countdownStartedAt = performance.now();
  touchActivity();
}

/** Единый таймер съёмки: число и кольцо всегда показывают один и тот же прогресс. */
function updateCaptureCountdown(now) {
  const duration = settings.timers.countdown * 1000;
  const elapsed = Math.max(0, now - countdownStartedAt);
  appState.countdownProgress = Math.min(1, elapsed / duration);
  appState.countdown = Math.max(1, Math.ceil((duration - elapsed) / 1000));
  if (elapsed < duration) return;

  countdownActive = false;
  countdownStartedAt = null;
  appState.countdown = null;
  capturePhoto();
}

async function capturePhoto() {
  goTo(SCREENS.PROCESSING);
  const startedAt = performance.now();

  try {
    // Фиксируем класс комплекции по медиане и рисуем финальный стоп-кадр
    for (const t of tracks) t.bodyClass = t.sampler.classify();

    const cleanFrame = document.createElement('canvas');
    cleanFrame.width = canvas.width;
    cleanFrame.height = canvas.height;
    const cleanCtx = cleanFrame.getContext('2d');
    drawMirroredVideo(cleanCtx, video, cleanFrame.width, cleanFrame.height);

    const costumeLayer = document.createElement('canvas');
    costumeLayer.width = canvas.width;
    costumeLayer.height = canvas.height;
    const costumeCtx = costumeLayer.getContext('2d');

    const costumeId = currentCostumeId();
    // Используем последний уверенный кадр: снимок не должен искусственно добавлять
    // «потерянный» кадр и менять прозрачность одежды в момент затвора.
    const active = lastActive;
    for (const i of active) {
      const t = tracks[i];
      drawPersonCostume(costumeCtx, t.lm, costumeLayer.width, costumeLayer.height,
        pickCostumeFor(i, active.length, costumeId), t.bodyClass, 1, appState.showHeadwear);
    }

    const photo = await composePhoto(
      cleanFrame,
      costumeLayer,
      costumeId,
      active.map((i) => tracks[i].lm),
    );
    appState.performance.photoMs = photo.timing?.totalMs ?? 0;
    appState.performance.segmentMs = photo.timing?.segmentMs ?? 0;

    // Анимация «проявки» должна прожить минимум processingMinMs
    const elapsed = performance.now() - startedAt;
    if (elapsed < settings.timers.processingMinMs) {
      await new Promise((res) => setTimeout(res, settings.timers.processingMinMs - elapsed));
    }

    appState.photoUrl = photo.toDataURL('image/jpeg', 0.92);
    // QR создаётся только по явному нажатию посетителя: это действие временно
    // отправляет фото в private Blob для получения на другом устройстве.
    appState.qrUrl = null;
    appState.qrStatus = 'idle';
    appState.qrError = null;
    appState.shareUrl = null;
    goTo(SCREENS.RESULT);
  } catch (err) {
    console.error('Photo capture failed:', err);
    resetToIdle();
  }
}

function dataUrlToBlob(dataUrl) {
  const [header, encoded] = dataUrl.split(',');
  if (!header?.includes('image/jpeg') || !encoded) throw new Error('Некорректный JPEG');
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}

/**
 * По явному согласию загружает готовый JPEG во временное private-хранилище и
 * строит QR на мобильную страницу просмотра/скачивания этого конкретного фото.
 */
export async function preparePhotoQr() {
  if (!appState.photoUrl) return false;
  if (appState.qrStatus === 'ready' && appState.qrUrl) return true;
  if (appState.qrStatus === 'uploading') return false;

  appState.qrStatus = 'uploading';
  appState.qrError = null;
  touchActivity();
  try {
    const photoBlob = dataUrlToBlob(appState.photoUrl);
    const response = await fetch('/api/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: photoBlob,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.shareUrl) {
      throw new Error(payload.error ?? `Сервер фото недоступен (${response.status})`);
    }
    appState.shareUrl = payload.shareUrl;
    appState.qrUrl = await QRCode.toDataURL(payload.shareUrl, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    appState.qrStatus = 'ready';
    return true;
  } catch (err) {
    console.error('QR photo upload failed:', err);
    appState.qrStatus = 'error';
    appState.qrError = err.message || 'Не удалось подготовить QR';
    return false;
  }
}

export function stopMirror() {
  running = false;
  countdownActive = false;
  countdownStartedAt = null;
  appState.countdown = null;
  appState.countdownProgress = 0;
  if (animationFrameId != null) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
  const stream = video.srcObject;
  if (stream) for (const track of stream.getTracks()) track.stop();
  video.pause();
  video.srcObject = null;
  closePoseTracker();
  closeGestureRecognizer();
  closePhotoProcessor();
  resetSleeveSmoothing();
}
