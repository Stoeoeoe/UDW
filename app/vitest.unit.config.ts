import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Keep unit tests independent of Electron builds and Storybook browser setup.
export default defineConfig({
  resolve: {
    alias: { fengari: path.resolve('node_modules/fengari-web/dist/fengari-web.bundle.js') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.stories.{ts,tsx}',
        'src/stories/**',
        'src/**/*.d.ts',
        'src/setupTests.ts',
      ],
      reporter: ['text-summary', 'json-summary', 'html'],
    },
  },
});
