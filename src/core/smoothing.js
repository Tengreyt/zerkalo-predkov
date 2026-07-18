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

function cloneMesh(mesh) {
  if (!mesh) return null;
  return {
    ...mesh,
    rows: mesh.rows.map((row) => ({
      ...row,
      left: { ...row.left },
      right: { ...row.right },
    })),
  };
}

function averageMeshDistance(current, target) {
  if (!current || !target || current.rows.length !== target.rows.length) return Infinity;
  let total = 0;
  let count = 0;
  for (let i = 0; i < target.rows.length; i++) {
    for (const side of ['left', 'right']) {
      total += Math.hypot(
        target.rows[i][side].x - current.rows[i][side].x,
        target.rows[i][side].y - current.rows[i][side].y,
      );
      count++;
    }
  }
  return total / Math.max(1, count);
}

function blendMesh(current, target, alpha) {
  const next = cloneMesh(current);
  for (let i = 0; i < target.rows.length; i++) {
    for (const side of ['left', 'right']) {
      next.rows[i][side].x += (target.rows[i][side].x - next.rows[i][side].x) * alpha;
      next.rows[i][side].y += (target.rows[i][side].y - next.rows[i][side].y) * alpha;
    }
  }
  return next;
}

/**
 * Сглаживает уже построенную сетку ткани. Краткий dropout не переключает рукав
 * на статичный fallback, поэтому он не щёлкает при перекрытии кисти корпусом.
 */
export class SleeveMeshSmoother {
  constructor(config = settings.overlay.sleeveSmoothing) {
    this.config = config;
    this.reset();
  }

  reset() {
    this.state = { left: null, right: null };
    this.missingMs = { left: 0, right: 0 };
    this.front = {
      left: { value: false, candidate: false, frames: 0 },
      right: { value: false, candidate: false, frames: 0 },
    };
    this.lastTimestamp = null;
  }

  update(dynamicMeshes, fallbackMeshes, timestampMs = performance.now()) {
    const elapsedMs = this.lastTimestamp == null
      ? 16.7
      : Math.max(0, timestampMs - this.lastTimestamp);
    const dtMs = Math.max(4, Math.min(100, elapsedMs));
    this.lastTimestamp = timestampMs;
    const result = {};

    for (const side of ['left', 'right']) {
      const dynamic = dynamicMeshes?.[side] ?? null;
      const fallback = fallbackMeshes?.[side] ?? null;
      if (dynamic) this.missingMs[side] = 0;
      else this.missingMs[side] += elapsedMs;

      const holding = !dynamic && this.state[side] &&
        this.missingMs[side] <= this.config.dropoutHoldMs;
      const target = dynamic ?? (holding ? this.state[side] : fallback);
      if (!target) {
        result[side] = this.state[side];
        continue;
      }
      if (!this.state[side] || this.state[side].rows.length !== target.rows.length) {
        this.state[side] = cloneMesh(target);
      } else if (!holding) {
        const distance = averageMeshDistance(this.state[side], target);
        const speed = distance / Math.max(dtMs / 1000, 1 / 120);
        const motion = Math.min(1, speed / this.config.speedForFast);
        const baseTau = dynamic ? this.config.followMs : this.config.fallbackMs;
        const tauMs = baseTau + (this.config.fastFollowMs - baseTau) * motion;
        const alpha = 1 - Math.exp(-dtMs / Math.max(1, tauMs));
        this.state[side] = blendMesh(this.state[side], target, alpha);
      }

      if (dynamic) {
        const front = this.front[side];
        if (dynamic.inFront === front.candidate) front.frames++;
        else {
          front.candidate = dynamic.inFront;
          front.frames = 1;
        }
        if (front.frames >= this.config.inFrontFrames) front.value = front.candidate;
      }
      this.state[side].inFront = this.front[side].value;
      result[side] = this.state[side];
    }
    return result;
  }
}
