import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5180,
  },
  build: {
    // MediaPipe WASM тянет крупные чанки — не шумим предупреждениями
    chunkSizeWarningLimit: 4096,
  },
});
