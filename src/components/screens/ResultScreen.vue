<script setup>
import { ref } from 'vue';
import { appState, resetToIdle } from '../../store/appState.js';
import { backToLive, preparePhotoQr } from '../../composables/useMirror.js';

const showQr = ref(false);

function printPhoto() {
  window.print();
}

async function openQr() {
  if (appState.qrStatus === 'ready') {
    showQr.value = true;
    return;
  }
  if (await preparePhotoQr()) showQr.value = true;
}
</script>

<template>
  <div class="screen result-screen">
    <img class="photo print-photo" :src="appState.photoUrl" alt="Ваше фото в национальном костюме" />

    <div class="actions no-print">
      <button
        class="btn"
        :disabled="appState.qrStatus === 'uploading'"
        @click="openQr"
      >
        {{ appState.qrStatus === 'uploading' ? '⏳ Готовим QR…' : '📱 QR — забрать на телефон' }}
      </button>
      <a class="btn download-btn" :href="appState.photoUrl" download="zerkalo-predkov.jpg">
        ⬇ Скачать здесь
      </a>
      <button class="btn" @click="printPhoto">🖨 Печать</button>
      <button class="btn btn-primary" @click="backToLive">↺ Ещё раз</button>
      <button class="btn btn-ghost" @click="resetToIdle">Завершить</button>
    </div>

    <p v-if="appState.qrStatus === 'idle'" class="privacy-note no-print">
      QR временно загрузит этот снимок в защищённое хранилище — только после нажатия.
    </p>
    <p v-else-if="appState.qrStatus === 'error'" class="qr-error no-print">
      {{ appState.qrError }}. Фото всё ещё можно скачать на этом устройстве.
    </p>

    <transition name="fade">
      <div v-if="showQr" class="qr-popup no-print" @click="showQr = false">
        <img :src="appState.qrUrl" alt="QR-код" />
        <p>Наведите камеру телефона · ссылка действует около часа</p>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.result-screen {
  background: #0c120d;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
}
.photo {
  max-width: 82vw;
  max-height: 74vh;
  border-radius: 12px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.6);
}
.actions {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  justify-content: center;
}
.download-btn { text-decoration: none; }
.privacy-note,
.qr-error {
  max-width: 720px;
  padding: 0 18px;
  color: rgba(243, 236, 217, 0.72);
  font-size: 14px;
  text-align: center;
}
.qr-error { color: #ffc7b8; }
.qr-popup {
  position: absolute;
  inset: 0;
  background: rgba(12, 18, 13, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  cursor: pointer;
}
.qr-popup img {
  width: 320px;
  border-radius: 16px;
  background: #fff;
  padding: 12px;
}
.qr-popup p {
  color: #f3ecd9;
  font-size: 24px;
}
@media (max-width: 700px), (max-height: 700px) {
  .result-screen { gap: 14px; padding: 12px; }
  .photo { max-width: 96vw; max-height: 64dvh; }
  .actions { gap: 8px; }
  .actions .btn { font-size: 15px; padding: 10px 12px; }
  .qr-popup img { width: min(280px, 78vw); }
}
</style>
