<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { appState, SCREENS, touchActivity } from './store/appState.js';
import { startMirror, stopMirror } from './composables/useMirror.js';
import { getManifest } from './core/assets.js';
import IdleScreen from './components/screens/IdleScreen.vue';
import LiveScreen from './components/screens/LiveScreen.vue';
import ProcessingScreen from './components/screens/ProcessingScreen.vue';
import ResultScreen from './components/screens/ResultScreen.vue';
import GestureHud from './components/GestureHud.vue';
import DebugOverlay from './components/DebugOverlay.vue';

const canvasRef = ref(null);

function reloadPage() {
  window.location.reload();
}

onMounted(async () => {
  window.addEventListener('pointerdown', touchActivity);
  try {
    await startMirror(canvasRef.value);
    appState.costumeIds = Object.keys(getManifest().costumes);
  } catch (err) {
    console.error('Mirror init failed:', err);
    appState.loadError =
      'Не удалось запустить камеру или загрузить модели. Разрешите доступ к камере и перезагрузите страницу.';
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', touchActivity);
  stopMirror();
});
</script>

<template>
  <div class="kiosk">
    <canvas ref="canvasRef" class="mirror-canvas" :class="{ hidden: appState.screen !== SCREENS.LIVE }" />

    <div v-if="appState.loadError" class="load-error">
      <p>{{ appState.loadError }}</p>
      <button class="btn btn-primary" @click="reloadPage">Повторить запуск</button>
    </div>
    <div v-else-if="!appState.ready" class="loading">
      <div class="spinner" />
      <p>Зеркало просыпается…</p>
    </div>

    <template v-else>
      <IdleScreen v-if="appState.screen === SCREENS.IDLE" />
      <LiveScreen v-else-if="appState.screen === SCREENS.LIVE" />
      <ProcessingScreen v-else-if="appState.screen === SCREENS.PROCESSING" />
      <ResultScreen v-else-if="appState.screen === SCREENS.RESULT" />

      <GestureHud />
    </template>

    <DebugOverlay v-if="appState.debug" />
  </div>
</template>
