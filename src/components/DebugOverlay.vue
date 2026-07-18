<script setup>
// Скрытый режим калибровки (?debug=1): живое r, класс и fps,
// чтобы прогнать 10–15 человек и выставить пороги THIN/LARGE.
import { appState } from '../store/appState.js';
import { settings } from '../config/settings.js';
</script>

<template>
  <div class="debug">
    <div>r = {{ appState.debugRatio?.toFixed(4) ?? '—' }}</div>
    <div>класс: {{ appState.debugClass ?? '—' }}</div>
    <div>пороги: THIN {{ settings.bodyClass.THIN }} / LARGE {{ settings.bodyClass.LARGE }}</div>
    <div>fps: {{ appState.fps }}</div>
    <div>pose: {{ appState.performance.poseMs.toFixed(1) }} ms</div>
    <div>gesture: {{ appState.performance.gestureMs.toFixed(1) }} ms</div>
    <div>render: {{ appState.performance.renderMs.toFixed(1) }} ms</div>
    <div>frame: {{ appState.performance.frameMs.toFixed(1) }} ms</div>
    <div>photo/segment: {{ appState.performance.photoMs.toFixed(0) }} / {{ appState.performance.segmentMs.toFixed(0) }} ms</div>
    <div>посадка: {{ settings.positioningStrategy }}</div>
    <div>экран: {{ appState.screen }}</div>
    <div>жест: {{ appState.gesture }} ({{ appState.holdProgress.toFixed(2) }})</div>
    <div>источник: {{ appState.gestureSource }}</div>
    <div>ладонь к камере: {{ appState.palmReady ? 'ДА' : 'нет' }}</div>
    <div>ладонь: {{ appState.palmReason }}</div>
    <div>фото: {{ appState.captureBlockReason ?? 'готово' }}</div>
  </div>
</template>

<style scoped>
.debug {
  position: fixed;
  left: 12px;
  top: 12px;
  z-index: 100;
  background: rgba(0, 0, 0, 0.72);
  color: #0f6;
  font: 14px/1.6 monospace;
  padding: 10px 14px;
  border-radius: 8px;
  pointer-events: none;
}
@media (max-width: 700px), (max-height: 650px) {
  .debug { left: 4px; top: 4px; font-size: 10px; line-height: 1.35; padding: 5px 7px; }
}
</style>
