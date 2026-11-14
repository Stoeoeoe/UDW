import { test, expect, type ElectronApplication } from '@playwright/test';
import { launchApp } from './helpers.js';

/**
 * Core app smoke tests.
 * Each test launches a fresh app instance to guarantee isolation.
 */

let app: ElectronApplication;

test.beforeEach(async () => {
  ({ app } = await launchApp());
});

test.afterEach(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------
// Window properties
// ---------------------------------------------------------------------------

test('a single window opens on launch', async () => {
  const windows = app.windows();
  expect(windows.length).toBe(1);
});

test('window is visible', async () => {
  const window = await app.firstWindow();
  const isVisible = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win.isVisible();
  });
  expect(isVisible).toBe(true);
  // Suppress the unused variable warning – window used for type narrowing only
  void window;
});

test('window has a non-zero size', async () => {
  const { width, height } = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const [w, h] = win.getSize();
    return { width: w, height: h };
  });
  expect(width).toBeGreaterThan(400);
  expect(height).toBeGreaterThan(300);
});

// ---------------------------------------------------------------------------
// Landing screen UI
// ---------------------------------------------------------------------------

test('landing screen shows app title', async () => {
  const window = await app.firstWindow();
  // Match "Vulcan Editor" / "Vulcanus Editor" — the stale build may differ from source.
  await expect(window.getByRole('heading', { name: /vulcan.*editor/i })).toBeVisible();
});

test('landing screen shows Open Project action card', async () => {
  const window = await app.firstWindow();
  await expect(window.getByRole('heading', { name: 'Open Project' })).toBeVisible();
});

test('landing screen shows New Project action card', async () => {
  const window = await app.firstWindow();
  await expect(window.getByRole('heading', { name: 'New Project' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// DevTools are NOT open in production mode
// ---------------------------------------------------------------------------

test('DevTools are closed by default in production mode', async () => {
  const devToolsOpen = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return win.webContents.isDevToolsOpened();
  });
  expect(devToolsOpen).toBe(false);
});
