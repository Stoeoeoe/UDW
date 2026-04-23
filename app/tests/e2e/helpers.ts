import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path to the app/ directory. */
export const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Launch the Electron app against the production build (dist/).
 * DevTools are NOT opened (production mode has no VITE_DEV_SERVER_URL).
 */
export async function launchApp(): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    // Pass the compiled main entry directly so we don't depend on package.json lookup.
    args: [path.join(appDir, 'dist-electron', 'main.js')],
    cwd: appDir,
    env: {
      ...process.env,
      // Explicitly clear dev-server URL so production path is used.
      VITE_DEV_SERVER_URL: '',
      NODE_ENV: 'production',
    },
  });

  const window = await app.firstWindow();
  // Wait until the React tree is mounted – Chakra renders a root div with data-theme.
  await window.waitForLoadState('domcontentloaded');

  return { app, window };
}
