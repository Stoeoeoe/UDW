/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import path from 'node:path';
import electron from 'vite-plugin-electron/simple';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// Injects the react-devtools standalone connection script in dev mode only.
function reactDevToolsPlugin(): Plugin {
  return {
    name: 'react-devtools',
    apply: 'serve',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { src: 'http://localhost:8097' },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      // Use the pre-bundled fengari-web bundle which has Node built-ins (os, etc.) already resolved.
      fengari: path.resolve(dirname, 'node_modules/fengari-web/dist/fengari-web.bundle.js'),
    },
  },
  plugins: [
    reactDevToolsPlugin(),
    react(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: ['electron/main.ts', 'electron/musicWorker.ts'],
        // ffmpeg-static locates its binary through __dirname, so it must load from node_modules.
        vite: { build: { rollupOptions: { external: ['ffmpeg-static'] } } },
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      // Ployfill the Electron and Node.js API for Renderer process.
      // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
      // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
      renderer:
        process.env.NODE_ENV === 'test'
          ? // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
            undefined
          : {},
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
