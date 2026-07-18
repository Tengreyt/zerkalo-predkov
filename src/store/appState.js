/**
 * Машина состояний экранов и общее реактивное состояние киоска.
 * IDLE → LIVE → PROCESSING → RESULT → IDLE. Автосброс по бездействию.
 */
import { reactive, readonly } from 'vue';
import { settings } from '../config/settings.js';

export const SCREENS = Object.freeze({
  IDLE: 'IDLE',
  LIVE: 'LIVE',
  PROCESSING: 'PROCESSING',
  RESULT: 'RESULT',
});

const state = reactive({
  screen: SCREENS.IDLE,
  /** Готовность камеры и моделей. */
  ready: false,
  loadError: null,

  /** id костюмов из манифеста в порядке карусели. */
  costumeIds: [],
  costumeIndex: 0,

  /** Обратный отсчёт перед снимком: null — не идёт. */
  countdown: null,
  /** Плавный прогресс обратного отсчёта 0..1. */
  countdownProgress: 0,

  /** Подсказка позы («Встаньте прямо…») либо null. */
  poseHint: null,

  /** Есть ли человек перед зеркалом (для подсказок в IDLE). */
  personPresent: false,
  /** Полная стабильная поза готова к примерке и снимку. */
  poseReady: false,

  /** Показывать ли головной убор поверх костюма (переключается жестом ✊). */
  showHeadwear: true,

  /** Развёрнута ли подробная карточка-описание (жест ☝️). */
  descriptionExpanded: false,

  /** Состояние жеста для экранного индикатора. */
  gesture: 'None',
  gestureSource: 'none',
  /** Прогресс удержания ладони 0..1 (кольцо подтверждения). */
  holdProgress: 0,
  /** Прошла ли ладонь строгую проверку «лицевой стороной к камере». */
  palmReady: false,
  /** Почему строгая проверка ладони не прошла (только для debug/подсказки). */
  palmReason: 'Рука не найдена',

  /** Удержание ✌️ у края: направление и прогресс для боковой подсказки. */
  navigationDirection: null,
  navigationProgress: 0,

  /** dataURL готового фото и dataURL QR-кода. */
  photoUrl: null,
  qrUrl: null,
  qrStatus: 'idle',
  qrError: null,
  shareUrl: null,

  /** Debug (?debug=1): живое значение r и текущий класс. */
  debug: new URLSearchParams(location.search).has('debug'),
  debugRatio: null,
  debugClass: null,
  fps: 0,
  /** Агрегированные debug-метрики; обновляются раз в секунду, не каждый кадр. */
  performance: {
    poseMs: 0,
    gestureMs: 0,
    renderMs: 0,
    frameMs: 0,
    photoMs: 0,
    segmentMs: 0,
  },
  captureBlockReason: null,
});

let idleTimer = null;

/** Любое действие пользователя откладывает автосброс. */
export function touchActivity() {
  clearTimeout(idleTimer);
  if (state.screen === SCREENS.IDLE) return;
  idleTimer = setTimeout(() => {
    resetToIdle();
  }, settings.timers.idleResetMs);
}

export function resetToIdle() {
  clearTimeout(idleTimer);
  state.screen = SCREENS.IDLE;
  state.countdown = null;
  state.countdownProgress = 0;
  state.poseHint = null;
  state.poseReady = false;
  state.photoUrl = null;
  state.qrUrl = null;
  state.qrStatus = 'idle';
  state.qrError = null;
  state.shareUrl = null;
  state.descriptionExpanded = false;
  state.showHeadwear = true;
  state.holdProgress = 0;
  state.palmReady = false;
  state.palmReason = 'Рука не найдена';
  state.navigationDirection = null;
  state.navigationProgress = 0;
  state.gestureSource = 'none';
  state.captureBlockReason = null;
}

export function goTo(screen) {
  state.screen = screen;
  touchActivity();
}

export function currentCostumeId() {
  return state.costumeIds[state.costumeIndex] ?? null;
}

export function nextCostume() {
  state.costumeIndex = (state.costumeIndex + 1) % state.costumeIds.length;
  state.descriptionExpanded = false;
  touchActivity();
}

export function prevCostume() {
  state.costumeIndex =
    (state.costumeIndex - 1 + state.costumeIds.length) % state.costumeIds.length;
  state.descriptionExpanded = false;
  touchActivity();
}

export function toggleHeadwear() {
  state.showHeadwear = !state.showHeadwear;
  touchActivity();
}

export function toggleDescription() {
  state.descriptionExpanded = !state.descriptionExpanded;
  touchActivity();
}

/** Мутируемый доступ — только для оркестратора (useMirror) и экранов. */
export const appState = state;
/** Read-only доступ для чисто отображающих компонентов. */
export const appStateRO = readonly(state);
