<script setup>
/**
 * Экранная подсказка по жестам + кольцо удержания раскрытой ладони.
 * Полностью управляется состоянием из стора (appState.gesture / holdProgress),
 * содержимое зависит от текущего экрана.
 */
import { computed } from 'vue';
import { appState, SCREENS } from '../store/appState.js';

const RADIUS = 54;
const CIRC = 2 * Math.PI * RADIUS;
const dashoffset = computed(() => CIRC * (1 - appState.holdProgress));

const holdLabel = computed(() =>
  appState.screen === SCREENS.LIVE ? 'Съёмка' : appState.screen === SCREENS.RESULT ? 'Ещё раз' : 'Начать',
);

// Легенда жестов по экрану.
const legend = computed(() => {
  switch (appState.screen) {
    case SCREENS.IDLE:
      return [{ icon: '✋', text: 'подними ладонь — начать' }];
    case SCREENS.LIVE:
      return [
        { icon: '👍', text: 'следующий' },
        { icon: '✌️', text: 'предыдущий' },
        { icon: '☝️', text: 'описание' },
        { icon: '✊', text: 'головной убор' },
        { icon: '✋', text: 'ладонью к экрану — фото' },
      ];
    case SCREENS.RESULT:
      return [
        { icon: '✋', text: 'ладонь — ещё раз' },
        { icon: '👍', text: 'ещё раз' },
      ];
    default:
      return [];
  }
});

const showLegend = computed(
  () => legend.value.length > 0 && appState.screen !== SCREENS.PROCESSING,
);

const showPalmFeedback = computed(() =>
  appState.screen === SCREENS.LIVE &&
  appState.gestureSource === 'palm-rejected' &&
  !appState.palmReady,
);
</script>

<template>
  <div class="hud">
    <transition name="fade">
      <div v-if="appState.holdProgress > 0.02" class="hold-ring">
        <svg viewBox="0 0 120 120">
          <circle class="track" cx="60" cy="60" :r="RADIUS" />
          <circle
            class="progress"
            cx="60"
            cy="60"
            :r="RADIUS"
            :stroke-dasharray="CIRC"
            :stroke-dashoffset="dashoffset"
          />
        </svg>
        <span class="hold-label">{{ holdLabel }}</span>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="showPalmFeedback" class="palm-feedback">
        ✋ {{ appState.palmReason }}
      </div>
    </transition>

    <transition name="fade">
      <div v-if="showLegend" class="legend">
        <div v-for="g in legend" :key="g.text" class="legend-item">
          <span class="icon">{{ g.icon }}</span>
          <span class="text">{{ g.text }}</span>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 20;
}
.hold-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 160px;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hold-ring svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.hold-ring .track {
  fill: none;
  stroke: rgba(243, 236, 217, 0.2);
  stroke-width: 8;
}
.hold-ring .progress {
  fill: none;
  stroke: #d6be8c;
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.05s linear;
}
.hold-label {
  color: #f3ecd9;
  font-size: 22px;
  font-weight: 600;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7);
}
.legend {
  position: absolute;
  left: 50%;
  bottom: 128px;
  transform: translateX(-50%);
  display: flex;
  gap: 22px;
  padding: 12px 24px;
  background: rgba(12, 18, 13, 0.72);
  border: 1px solid rgba(214, 190, 140, 0.3);
  border-radius: 999px;
  backdrop-filter: blur(6px);
  max-width: calc(100vw - 32px);
}
.palm-feedback {
  position: absolute;
  left: 50%;
  top: 18%;
  transform: translateX(-50%);
  max-width: calc(100vw - 32px);
  padding: 12px 20px;
  border: 1px solid rgba(214, 190, 140, 0.45);
  border-radius: 999px;
  background: rgba(12, 18, 13, 0.84);
  color: #f3ecd9;
  font-size: 19px;
  text-align: center;
  backdrop-filter: blur(6px);
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f3ecd9;
  font-size: 17px;
  white-space: nowrap;
}
.legend-item .icon {
  font-size: 22px;
}
@media (max-width: 1100px), (max-height: 720px) {
  .legend { display: none; }
  .hold-ring { width: 130px; height: 130px; }
  .palm-feedback { top: 12%; font-size: 15px; border-radius: 14px; }
}
</style>
