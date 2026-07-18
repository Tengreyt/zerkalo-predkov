/**
 * Устойчивое переключение костюмов жестом Victory в левой/правой части кадра.
 * Событие срабатывает один раз за показ жеста и требует отпускания руки.
 */
export class SideGestureNavigator {
  constructor({ holdMs = 1400, edge = 0.5, dropoutGraceMs = 220 } = {}) {
    this.holdMs = holdMs;
    this.edge = edge;
    this.dropoutGraceMs = dropoutGraceMs;
    this.reset();
  }

  reset() {
    this.direction = null;
    this.startedAt = null;
    this.lastSeenAt = null;
    this.fired = false;
  }

  update(gesture, now) {
    const isVictory = gesture?.name === 'Victory' && gesture?.wrist;
    if (!isVictory) {
      if (this.lastSeenAt == null || now - this.lastSeenAt > this.dropoutGraceMs) this.reset();
      return { direction: this.direction, progress: 0, action: null };
    }

    const direction = gesture.wrist.x >= this.edge ? 'next' : 'prev';
    this.lastSeenAt = now;
    if (direction !== this.direction) {
      this.direction = direction;
      this.startedAt = now;
      this.fired = false;
    }

    const progress = Math.min(1, Math.max(0, now - this.startedAt) / this.holdMs);
    let action = null;
    if (progress >= 1 && !this.fired) {
      action = direction;
      this.fired = true;
    }
    return { direction, progress, action };
  }
}
