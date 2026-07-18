<script setup>
// Заставка киоска. Вход в примерку — жестом ✋ (удержать раскрытую ладонь).
// Авто-вход по присутствию оставлен в useMirror как страховка музейного режима.
import { appState } from '../../store/appState.js';
import { enterLive } from '../../composables/useMirror.js';
</script>

<template>
  <div class="screen idle-screen">
    <div class="idle-content">
      <svg class="silhouette" viewBox="0 0 100 220" aria-hidden="true">
        <circle cx="50" cy="28" r="16" />
        <path d="M50 46 C 28 46 20 70 20 95 L 26 150 L 32 210 L 44 210 L 47 140 L 53 140 L 56 210 L 68 210 L 74 150 L 80 95 C 80 70 72 46 50 46 Z" />
      </svg>
      <h1>Зеркало предков</h1>
      <p v-if="appState.personPresent" class="hint palm">✋ Поднимите раскрытую ладонь, чтобы начать</p>
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
