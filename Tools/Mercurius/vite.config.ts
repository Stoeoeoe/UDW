import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { clipApi } from './scripts/clip-api';
import { productionApi } from './scripts/production-api';

export default defineConfig({
  plugins: [tailwindcss(), clipApi(), productionApi()],
  server: { host: '127.0.0.1', port: 3109, strictPort: true },
  build: { outDir: 'dist/playground' },
});
