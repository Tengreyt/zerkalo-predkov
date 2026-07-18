/**
 * Автоматическая классификация комплекции по пропорциям скелета.
 * r = shoulderRatio*0.6 + hipRatio*0.4; класс — по медиане r за 10–15 кадров.
 *
 * Важно: класс выбирает ФАЙЛ (форму одежды), а пиксельная ширина плеч — МАСШТАБ.
 * Эти две вещи не смешиваются.
 */
import { settings, LM } from '../config/settings.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Мгновенное значение r для одного кадра; null, если поза не полная (нет лодыжек). */
export function computeBodyRatio(lm) {
  const nose = lm[LM.NOSE];
  const la = lm[LM.LEFT_ANKLE];
  const ra = lm[LM.RIGHT_ANKLE];
  const minVis = settings.overlay.minVisibility;
  if (la.visibility < minVis || ra.visibility < minVis) return null;

  const ankleMid = { x: (la.x + ra.x) / 2, y: (la.y + ra.y) / 2 };
  const height = dist(nose, ankleMid);
  if (height < 1e-6) return null;

  const shoulderRatio = dist(lm[LM.LEFT_SHOULDER], lm[LM.RIGHT_SHOULDER]) / height;
  const hipRatio = dist(lm[LM.LEFT_HIP], lm[LM.RIGHT_HIP]) / height;
  const { shoulderWeight, hipWeight } = settings.bodyClass;
  return shoulderRatio * shoulderWeight + hipRatio * hipWeight;
}

export function classifyByRatio(r) {
  const { THIN, LARGE } = settings.bodyClass;
  if (r < THIN) return 'slim';
  if (r > LARGE) return 'large';
  return 'regular';
}

/** Накапливает выборку r во время таймера 3-2-1 и выдаёт класс по медиане. */
export class BodyClassSampler {
  constructor() {
    this.samples = [];
  }

  add(r) {
    if (r == null) return;
    this.samples.push(r);
    if (this.samples.length > settings.bodyClass.medianSamples) this.samples.shift();
  }

  /** Медиана накопленных r; null, если выборки нет. */
  median() {
    if (!this.samples.length) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /** Класс по медиане; 'regular' как безопасный дефолт при пустой выборке. */
  classify() {
    const m = this.median();
    return m == null ? 'regular' : classifyByRatio(m);
  }

  reset() {
    this.samples = [];
  }
}
