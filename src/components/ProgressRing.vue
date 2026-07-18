<script setup>
import { computed } from 'vue';

const props = defineProps({
  progress: { type: Number, default: 0 },
  size: { type: Number, default: 160 },
  strokeWidth: { type: Number, default: 8 },
  ariaLabel: { type: String, default: 'Прогресс' },
});

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const safeProgress = computed(() => Math.min(1, Math.max(0, props.progress || 0)));
const dashOffset = computed(() => CIRCUMFERENCE * (1 - safeProgress.value));
</script>

<template>
  <div
    class="progress-ring"
    role="progressbar"
    :aria-label="ariaLabel"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="Math.round(safeProgress * 100)"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="progress-ring__track" cx="60" cy="60" :r="RADIUS" :stroke-width="strokeWidth" />
      <circle
        class="progress-ring__value"
        cx="60"
        cy="60"
        :r="RADIUS"
        :stroke-width="strokeWidth"
        :stroke-dasharray="CIRCUMFERENCE"
        :stroke-dashoffset="dashOffset"
      />
    </svg>
    <div class="progress-ring__content"><slot /></div>
  </div>
</template>

<style scoped>
.progress-ring {
  position: relative;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}
.progress-ring svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
  overflow: visible;
  filter: drop-shadow(0 0 12px rgba(214, 190, 140, 0.2));
}
.progress-ring__track,
.progress-ring__value {
  fill: none;
}
.progress-ring__track {
  stroke: rgba(243, 236, 217, 0.18);
}
.progress-ring__value {
  stroke: #d6be8c;
  stroke-linecap: round;
  transition: stroke-dashoffset 80ms linear;
}
.progress-ring__content {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  text-align: center;
}
</style>
