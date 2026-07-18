import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { localPhotoApi } from './server/localPhotoApi.js';

function localPhotoPlugin() {
  return {
    name: 'local-photo-api',
    configureServer(server) {
      server.middlewares.use(localPhotoApi());
    },
    configurePreviewServer(server) {
      server.middlewares.use(localPhotoApi());
    },
  };
}

export default defineConfig({
  plugins: [vue(), localPhotoPlugin()],
  server: {
    port: 5180,
    host: true,
  },
  build: {
    // MediaPipe WASM тянет крупные чанки — не шумим предупреждениями
    chunkSizeWarningLimit: 4096,
  },
});
