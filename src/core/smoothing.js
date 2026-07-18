/** Адаптивное сглаживание ключевых точек по алгоритму One Euro Filter. */
import { settings } from '../config/settings.js';

const TAU = Math.PI * 2;

function smoothingAlpha(cutoff, dt) {
  const r = TAU * cutoff * dt;
  return r / (r + 1);
}

function lowPass(value, previous, alpha) {
  return previous + alpha * (value - previous);
}

class OneEuroValue {
  constructor() {
    this.value = null;
    this.raw = null;
    this.derivative = 0;
  }

  update(nextValue, dt, config) {
    if (this.value == null) {
      this.value = nextValue;
      this.raw = nextValue;
      return nextValue;
    }

    // Единичный скачок детектора ограничиваем до фильтрации, чтобы PNG не «улетал».
    const delta = Math.max(-config.maxJump, Math.min(config.maxJump, nextValue - this.raw));
    const safeValue = this.raw + delta;
    const speed = (safeValue - this.raw) / dt;
    this.derivative = lowPass(
      speed,
      this.derivative,
      smoothingAlpha(config.derivativeCutoff, dt),
    );
    const cutoff = config.minCutoff + config.beta * Math.abs(this.derivative);
    this.value = lowPass(safeValue, this.value, smoothingAlpha(cutoff, dt));
    this.raw = safeValue;
    return this.value;
  }
}

export class LandmarkSmoother {
  constructor(config = settings.smoothing) {
    this.config = config;
    this.state = null;
    this.filters = null;
    this.lastTimestamp = null;
  }

  /** Принимает свежие landmarks и timestamp rAF, возвращает сглаженные. */
  update(landmarks, timestampMs = performance.now()) {
    if (!this.state || this.state.length !== landmarks.length) {
      this.state = landmarks.map((p) => ({
        x: p.x,
        y: p.y,
        z: p.z ?? 0,
        visibility: p.visibility,
      }));
      this.filters = landmarks.map(() => ({
        x: new OneEuroValue(),
        y: new OneEuroValue(),
        z: new OneEuroValue(),
      }));
      for (let i = 0; i < landmarks.length; i++) {
        this.filters[i].x.update(landmarks[i].x, 1 / 30, this.config);
        this.filters[i].y.update(landmarks[i].y, 1 / 30, this.config);
        this.filters[i].z.update(landmarks[i].z ?? 0, 1 / 30, this.config);
      }
      this.lastTimestamp = timestampMs;
      return this.state;
    }

    const dt = Math.max(1 / 120, Math.min(1 / 12, (timestampMs - this.lastTimestamp) / 1000));
    this.lastTimestamp = timestampMs;
    for (let i = 0; i < landmarks.length; i++) {
      const s = this.state[i];
      const p = landmarks[i];
      s.x = this.filters[i].x.update(p.x, dt, this.config);
      s.y = this.filters[i].y.update(p.y, dt, this.config);
      s.z = this.filters[i].z.update(p.z ?? 0, dt, this.config);
      s.visibility = p.visibility;
    }
    return this.state;
  }

  reset() {
    this.state = null;
    this.filters = null;
    this.lastTimestamp = null;
  }
}
