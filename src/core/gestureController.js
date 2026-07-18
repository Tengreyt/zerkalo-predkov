/**
 * Превращает поток распознанных жестов в редкие, устойчивые события.
 *
 *  - «tap»  — дискретное действие (следующий костюм, вкл/выкл убор…). Срабатывает
 *             один раз на появление жеста; чтобы повторить тот же жест, руку нужно
 *             сначала опустить (жест сменился на None) — так не «дребезжит».
 *  - «hold» — удержание раскрытой ладони N мс (старт примерки, съёмка). Даёт
 *             прогресс 0..1 для кольца-индикатора на экране.
 *
 * Контроллер не знает о конкретных экранах — маппинг жест→действие живёт в useMirror.
 */
import { settings } from '../config/settings.js';

export class GestureController {
  constructor({
    holdGesture = 'Open_Palm',
    holdMs = settings.gesture.holdMs,
    cooldownMs = settings.gesture.cooldownMs,
    debounceFrames = settings.gesture.debounceFrames,
    dropoutGraceFrames = settings.gesture.dropoutGraceFrames,
  } = {}) {
    this.holdGesture = holdGesture;
    this.holdMs = holdMs;
    this.cooldownMs = cooldownMs;
    this.debounceFrames = debounceFrames;
    this.dropoutGraceFrames = dropoutGraceFrames;
    this.reset();
  }

  reset({ requireRelease = false } = {}) {
    this._pending = null;
    this._pendingCount = 0;
    this._stable = 'None';
    this._holdAccumulatedMs = 0;
    this._lastUpdateAt = null;
    this._holdFired = false;
    this._lastActionAt = -Infinity;
    this._armedName = 'None'; // имя, для которого tap уже отработал (ждём смену)
    this._dropoutFrames = 0;
    this._requireRelease = requireRelease;
    this._releaseFrames = 0;
  }

  /**
   * @param {string} name сырой жест текущего кадра ('None', если руки/жеста нет)
   * @param {number} now performance.now()
   * @returns {{tap:string|null, hold:string|null, progress:number, name:string}}
   */
  update(name, now) {
    const rawName = name;
    const dt = this._lastUpdateAt == null ? 0 : Math.max(0, Math.min(250, now - this._lastUpdateAt));
    this._lastUpdateAt = now;

    // После перехода экрана ждём, пока посетитель действительно опустит руку.
    // Это исключает: «ладонь запустила LIVE и той же ладонью сразу сняла фото».
    if (this._requireRelease) {
      if (rawName === 'None') this._releaseFrames++;
      else this._releaseFrames = 0;
      if (this._releaseFrames >= this.dropoutGraceFrames + this.debounceFrames) {
        this._requireRelease = false;
        this._stable = 'None';
        this._pending = 'None';
        this._pendingCount = this.debounceFrames;
      }
      return { tap: null, hold: null, progress: 0, name: rawName };
    }

    // До трёх потерянных распознаваний не обрывают прогресс удержания.
    if (name === 'None' && this._stable !== 'None') {
      this._dropoutFrames++;
      if (this._dropoutFrames <= this.dropoutGraceFrames) name = this._stable;
    } else {
      this._dropoutFrames = 0;
    }
    // Дебаунс: имя должно повториться debounceFrames раз, иначе держим прежнее.
    if (name === this._pending) {
      this._pendingCount++;
    } else {
      this._pending = name;
      this._pendingCount = 1;
    }
    if (this._pendingCount >= this.debounceFrames) this._stable = name;
    const stable = this._stable;

    let tap = null;
    let hold = null;
    let progress = 0;

    if (stable === this.holdGesture) {
      // Прогресс растёт только на кадрах, где строгая ладонь реально видна.
      // Grace удерживает состояние, но не может завершить действие после отпускания.
      if (rawName === this.holdGesture) this._holdAccumulatedMs += dt;
      progress = Math.min(1, this._holdAccumulatedMs / this.holdMs);
      if (progress >= 1 && !this._holdFired && rawName === this.holdGesture) {
        hold = this.holdGesture;
        this._holdFired = true;
        this._lastActionAt = now;
      }
    } else {
      this._holdAccumulatedMs = 0;
      this._holdFired = false;

      if (stable === 'None') {
        this._armedName = 'None'; // рука опущена — жесты снова «взведены»
      } else if (stable !== this._armedName && now - this._lastActionAt >= this.cooldownMs) {
        tap = stable;
        this._armedName = stable;
        this._lastActionAt = now;
      }
    }

    return { tap, hold, progress, name: stable };
  }
}
