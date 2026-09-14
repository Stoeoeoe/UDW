import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Ensures the renderer build exists before running Electron e2e tests.
 * Runs `npx vite build` if dist/index.html is missing.
 */
export default async function globalSetup() {
  const distIndex = path.join(appDir, 'dist', 'index.html');

  if (!existsSync(distIndex)) {
    console.log('\n[e2e] dist/index.html not found – building renderer…');
    execSync('npx vite build', {
      cwd: appDir,
      stdio: 'inherit',
    });
    console.log('[e2e] Build complete.\n');
  } else {
    console.log('[e2e] dist/index.html found – skipping build.');
  }
}
