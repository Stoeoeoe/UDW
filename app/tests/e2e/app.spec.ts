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
// Process / packaging
// ---------------------------------------------------------------------------

test('app is not packaged in development builds', async () => {
  const isPackaged = await app.evaluate(({ app: electronApp }) => electronApp.isPackaged);
  expect(isPackaged).toBe(false);
});

test('app name is set', async () => {
  const name = await app.evaluate(({ app: electronApp }) => electronApp.getName());
  expect(typeof name).toBe('string');
  expect(name.length).toBeGreaterThan(0);
});

test('app version is set', async () => {
  const version = await app.evaluate(({ app: electronApp }) => electronApp.getVersion());
  expect(typeof version).toBe('string');
  expect(version).toMatch(/^\d+\.\d+\.\d+/);
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

test('Open Project description is visible', async () => {
  const window = await app.firstWindow();
  await expect(window.getByText(/select a .vproj file/i)).toBeVisible();
});

test('New Project description is visible', async () => {
  const window = await app.firstWindow();
  await expect(window.getByText(/start from scratch/i)).toBeVisible();
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
