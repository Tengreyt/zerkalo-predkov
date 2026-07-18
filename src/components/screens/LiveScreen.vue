<script setup>
import { appState, nextCostume, prevCostume, toggleHeadwear } from '../../store/appState.js';
import { startCapture } from '../../composables/useMirror.js';
import CostumeCarousel from '../CostumeCarousel.vue';
import InfoCard from '../InfoCard.vue';
import ProgressRing from '../ProgressRing.vue';
</script>

<template>
  <div class="screen live-screen">
    <transition name="fade">
      <div v-if="!appState.personPresent || appState.poseHint" class="fit-guide">
        <svg viewBox="0 0 240 390" aria-hidden="true">
          <circle class="head" cx="120" cy="55" r="34" />
          <path class="body" d="M74 120 L166 120 L158 292 L82 292 Z M166 120 L198 270 M74 120 L42 270" />
          <g class="anchors">
            <circle cx="74" cy="120" r="7" /><circle cx="166" cy="120" r="7" />
            <circle cx="86" cy="205" r="7" /><circle cx="154" cy="205" r="7" />
            <circle cx="82" cy="292" r="7" /><circle cx="158" cy="292" r="7" />
          </g>
        </svg>
        <span>Покажите голову, плечи, талию и таз</span>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="appState.poseHint" class="pose-hint">{{ appState.poseHint }}</div>
    </transition>

    <transition name="pop">
      <div v-if="appState.countdown" class="countdown-overlay">
        <ProgressRing
          :progress="appState.countdownProgress"
          :size="260"
          :stroke-width="6"
          aria-label="Обратный отсчёт до фотографии"
        >
          <strong>{{ appState.countdown }}</strong>
          <span>Приготовьтесь</span>
        </ProgressRing>
      </div>
    </transition>

    <InfoCard class="info-card" />

    <button
      class="edge-nav edge-nav-left"
      :class="{ active: appState.navigationDirection === 'prev' }"
      aria-label="Предыдущий костюм"
      @click="prevCostume"
    >
      <span>‹</span>
    </button>
    <button
      class="edge-nav edge-nav-right"
      :class="{ active: appState.navigationDirection === 'next' }"
      aria-label="Следующий костюм"
      @click="nextCostume"
    >
      <span>›</span>
    </button>

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
  top: 210px;
  left: 24px;
  right: 440px;
  text-align: center;
  background: rgba(12, 18, 13, 0.82);
  color: #f3ecd9;
  font-size: 28px;
  padding: 16px 36px;
  border-radius: 16px;
  animation: pose-hint-window 6s ease forwards;
}
@keyframes pose-hint-window {
  0%, 82% { opacity: 1; visibility: visible; }
  100% { opacity: 0; visibility: hidden; }
}
.countdown-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(12, 18, 13, 0.24);
  text-shadow: 0 0 40px rgba(0, 0, 0, 0.75);
  pointer-events: none !important;
  z-index: 12;
}
.countdown-overlay strong {
  font: 700 104px/0.85 Arial, sans-serif;
}
.countdown-overlay span {
  margin-top: 14px;
  color: #f3ecd9;
  font: 600 17px/1 Arial, sans-serif;
  letter-spacing: 0.04em;
}
.info-card {
  position: absolute;
  top: 40px;
  right: 40px;
  width: 360px;
  max-height: calc(100dvh - 220px);
  overflow: auto;
  z-index: 6;
}
.edge-nav {
  position: absolute;
  top: 18%;
  bottom: 138px;
  width: clamp(64px, 9vw, 136px);
  border: 0;
  background: transparent;
  color: transparent;
  cursor: pointer;
  z-index: 4;
  transition: color 0.2s, background 0.2s;
}
.edge-nav-left { left: 0; }
.edge-nav-right { right: 0; }
.edge-nav span {
  display: inline-block;
  font: 300 clamp(64px, 8vw, 118px)/1 Arial, sans-serif;
  transform: scale(0.92);
  transition: transform 0.2s;
}
.edge-nav:hover,
.edge-nav:focus-visible {
  color: rgba(243, 236, 217, 0.9);
  background: linear-gradient(90deg, rgba(12, 18, 13, 0.38), transparent);
}
.edge-nav-right:hover,
.edge-nav-right:focus-visible {
  background: linear-gradient(-90deg, rgba(12, 18, 13, 0.38), transparent);
}
.edge-nav:hover span,
.edge-nav:focus-visible span { transform: scale(1.08); }
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
  z-index: 7;
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
  .pose-hint {
    top: calc(34dvh + 24px);
    left: 12px;
    right: 12px;
    width: auto;
    font-size: 20px;
    padding: 12px;
  }
  .edge-nav { top: 35%; bottom: 190px; width: 58px; }
}
@media (max-width: 560px) {
  .info-card { font-size: 0.84em; max-height: 29dvh; }
  .headwear-btn, .capture-btn { font-size: 15px; padding: 11px 8px; }
  .fit-guide svg { height: 52vh; }
  .fit-guide span { font-size: 14px; }
  .countdown-overlay :deep(.progress-ring) { transform: scale(0.78); }
}
</style>
