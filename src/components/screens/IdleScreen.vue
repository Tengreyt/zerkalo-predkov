<script setup>
// Заставка киоска. Вход в примерку — жестом ✋ (удержать раскрытую ладонь).
// Автоматического входа по таймеру нет: только осознанный жест или кнопка.
import { appState } from '../../store/appState.js';
import { enterLive } from '../../composables/useMirror.js';
import ProgressRing from '../ProgressRing.vue';
</script>

<template>
  <div class="screen idle-screen">
    <div class="idle-content">
      <svg v-if="!appState.personPresent" class="silhouette" viewBox="0 0 100 220" aria-hidden="true">
        <circle cx="50" cy="28" r="16" />
        <path d="M50 46 C 28 46 20 70 20 95 L 26 150 L 32 210 L 44 210 L 47 140 L 53 140 L 56 210 L 68 210 L 74 150 L 80 95 C 80 70 72 46 50 46 Z" />
      </svg>
      <ProgressRing
        v-else
        class="start-progress"
        :progress="appState.holdProgress"
        :size="172"
        :stroke-width="7"
        aria-label="Удержание ладони для начала примерки"
      >
        <span class="palm-icon">✋</span>
        <strong>{{ appState.holdProgress > 0 ? `${Math.round(appState.holdProgress * 100)}%` : 'СТАРТ' }}</strong>
      </ProgressRing>
      <h1>Зеркало предков</h1>
      <p v-if="appState.personPresent" class="hint palm">
        {{ appState.holdProgress > 0 ? 'Удерживайте ладонь — начинаем' : 'Поднимите раскрытую ладонь' }}
      </p>
      <p v-else class="hint">Встаньте перед зеркалом</p>
      <button class="btn btn-primary start-btn" @click="enterLive">Начать примерку</button>
      <p class="sub">Виртуальная примерочная национального костюма · Цифровой музей ЧГУ</p>
    </div>
  </div>
</template>

<style scoped>
.idle-screen {
  background: radial-gradient(ellipse at center, #1d2a20 0%, #0c120d 75%);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.silhouette {
  width: 120px;
  fill: rgba(214, 190, 140, 0.35);
  animation: breathe 2.6s ease-in-out infinite;
  margin-bottom: 24px;
}
.start-progress {
  margin: 0 auto 24px;
  color: #f3ecd9;
}
.palm-icon { font-size: 42px; line-height: 1; }
.start-progress strong {
  margin-top: 7px;
  color: #d6be8c;
  font: 700 15px/1.1 Arial, sans-serif;
  letter-spacing: 0.08em;
}
@keyframes breathe {
  0%, 100% { opacity: 0.45; transform: scale(1); }
  50% { opacity: 0.9; transform: scale(1.04); }
}
h1 {
  font-size: 64px;
  color: #d6be8c;
  letter-spacing: 0.06em;
  margin-bottom: 12px;
}
.hint {
  font-size: 32px;
  color: #f3ecd9;
  animation: hint-window 6s ease forwards;
}
.hint.palm {
  color: #d6be8c;
  animation: pulse 1.6s ease-in-out infinite;
}
.start-btn {
  display: block;
  margin: 24px auto 0;
  min-width: 240px;
}
@keyframes pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
@keyframes hint-window {
  0%, 82% { opacity: 1; visibility: visible; }
  100% { opacity: 0; visibility: hidden; }
}
.sub {
  margin-top: 28px;
  font-size: 17px;
  color: rgba(243, 236, 217, 0.55);
}
@media (max-width: 700px), (max-height: 650px) {
  .idle-content { padding: 20px; }
  .silhouette { width: 76px; height: 166px; margin-bottom: 12px; }
  h1 { font-size: clamp(34px, 10vw, 52px); }
  .hint { font-size: clamp(20px, 6vw, 28px); }
  .sub { margin-top: 16px; font-size: 14px; }
  .start-btn { margin-top: 16px; min-width: 210px; }
}
</style>
