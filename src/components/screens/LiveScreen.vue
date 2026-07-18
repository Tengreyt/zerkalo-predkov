<script setup>
import { appState, toggleHeadwear } from '../../store/appState.js';
import { startCapture } from '../../composables/useMirror.js';
import CostumeCarousel from '../CostumeCarousel.vue';
import InfoCard from '../InfoCard.vue';
</script>

<template>
  <div class="screen live-screen">
    <transition name="fade">
      <div v-if="!appState.personPresent || appState.poseHint" class="fit-guide">
        <svg viewBox="0 0 240 520" aria-hidden="true">
          <circle class="head" cx="120" cy="55" r="34" />
          <path class="body" d="M74 120 L166 120 L158 272 L148 480 M166 120 L198 270 M74 120 L42 270 M82 272 L92 480" />
          <g class="anchors">
            <circle cx="74" cy="120" r="7" /><circle cx="166" cy="120" r="7" />
            <circle cx="82" cy="272" r="7" /><circle cx="158" cy="272" r="7" />
            <circle cx="92" cy="480" r="7" /><circle cx="148" cy="480" r="7" />
          </g>
        </svg>
        <span>Покажите плечи и стопы · встаньте прямо</span>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="appState.poseHint" class="pose-hint">{{ appState.poseHint }}</div>
    </transition>

    <transition name="pop">
      <div v-if="appState.countdown" class="countdown">{{ appState.countdown }}</div>
    </transition>

    <InfoCard class="info-card" />

    <div class="bottom-bar">
      <CostumeCarousel />
      <button
        class="btn headwear-btn"
        :class="{ off: !appState.showHeadwear }"
        @click="toggleHeadwear"
      >
        {{ appState.showHeadwear ? '🎩 Убор: вкл' : '🎩 Убор: выкл' }}
      </button>
      <button
        class="btn btn-primary capture-btn"
        :disabled="appState.countdown !== null || !appState.poseReady"
        @click="startCapture"
      >
        {{ appState.poseReady ? '📸 Сделать фото' : 'Встаньте в рамку' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.live-screen {
  pointer-events: none; /* канва под нами; интерактив только у элементов ниже */
}
.live-screen > * {
  pointer-events: auto;
}
.fit-guide {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(243, 236, 217, 0.86);
  font-size: 18px;
  pointer-events: none !important;
  text-shadow: 0 2px 10px #000;
}
.fit-guide svg {
  height: 66vh;
  max-height: 620px;
  fill: none;
  stroke: rgba(214, 190, 140, 0.5);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.55));
}
.fit-guide .head { fill: rgba(214, 190, 140, 0.08); }
.fit-guide .anchors { fill: #d6be8c; stroke: rgba(12, 18, 13, 0.8); stroke-width: 3; }
.pose-hint {
  position: absolute;
  top: 48px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(12, 18, 13, 0.82);
  color: #f3ecd9;
  font-size: 28px;
  padding: 16px 36px;
  border-radius: 16px;
}
.countdown {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 220px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 0 60px rgba(0, 0, 0, 0.6);
  pointer-events: none !important;
}
.info-card {
  position: absolute;
  top: 40px;
  right: 40px;
  width: 360px;
  max-height: calc(100dvh - 190px);
  overflow: auto;
}
.bottom-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20px 40px 28px;
  display: flex;
  align-items: center;
  gap: 32px;
  background: linear-gradient(transparent, rgba(12, 18, 13, 0.85));
  max-width: 100%;
}
.capture-btn {
  font-size: 26px;
  padding: 18px 40px;
  flex-shrink: 0;
}
.headwear-btn {
  flex-shrink: 0;
}
.headwear-btn.off {
  opacity: 0.6;
  border-style: dashed;
}
.pop-enter-active { animation: pop-in 0.3s; }
@keyframes pop-in {
  from { transform: scale(1.6); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
@media (max-width: 1100px) {
  .info-card {
    top: max(12px, env(safe-area-inset-top));
    right: 12px;
    width: min(340px, calc(100vw - 24px));
    max-height: 34dvh;
  }
  .bottom-bar {
    flex-wrap: wrap;
    gap: 10px;
    padding: 12px max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom));
  }
  .bottom-bar :deep(.carousel) {
    flex-basis: 100%;
    order: 1;
  }
  .headwear-btn { order: 2; flex: 1; }
  .capture-btn { order: 3; flex: 1.4; font-size: 20px; padding: 14px 18px; }
  .pose-hint { top: 16px; width: calc(100vw - 24px); text-align: center; font-size: 20px; padding: 12px; }
}
@media (max-width: 560px) {
  .info-card { font-size: 0.84em; max-height: 29dvh; }
  .headwear-btn, .capture-btn { font-size: 15px; padding: 11px 8px; }
  .fit-guide svg { height: 52vh; }
  .fit-guide span { font-size: 14px; }
  .countdown { font-size: 42vw; }
}
</style>
