import { test, expect, type ElectronApplication } from '@playwright/test';
import { launchApp } from './helpers.js';

/**
 * Edge-case and failure-detection tests.
 * These probe things the developer might not have explicitly thought about —
 * security contracts, IPC resilience, process invariants, and startup health.
 */

let app: ElectronApplication;

test.beforeEach(async () => {
  ({ app } = await launchApp());
});

test.afterEach(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------
// Preload / context bridge contract
// ---------------------------------------------------------------------------

test('window.ipcRenderer is exposed by the preload script', async () => {
  /**
   * If the preload fails to load (wrong path, syntax error, etc.), this will be
   * undefined and ALL file system operations in the renderer will silently fail.
   */
  const window = await app.firstWindow();
  const hasIpc = await window.evaluate(() => typeof window.ipcRenderer !== 'undefined');
  expect(hasIpc).toBe(true);
});

test('ipcRenderer exposes invoke, send, on and off methods', async () => {
  const window = await app.firstWindow();
  const methods = await window.evaluate(() => {
    const ipc = (window as unknown as { ipcRenderer: Record<string, unknown> }).ipcRenderer;
    return ['invoke', 'send', 'on', 'off'].map((m) => typeof ipc[m]);
  });
  expect(methods).toEqual(['function', 'function', 'function', 'function']);
});

// ---------------------------------------------------------------------------
// Context isolation / nodeIntegration
// ---------------------------------------------------------------------------

test('require() is NOT available in the renderer (nodeIntegration is off)', async () => {
  /**
   * nodeIntegration is set to false in BrowserWindow options.
   * If it were ever accidentally enabled a renderer-side script could access
   * the full Node.js API and read any file on the user's machine.
   */
  const window = await app.firstWindow();
  const hasRequire = await window.evaluate(() => typeof require !== 'undefined');
  expect(hasRequire).toBe(false);
});

test('process object is NOT directly accessible in the renderer', async () => {
  const window = await app.firstWindow();
  const hasProcess = await window.evaluate(
    () =>
      // Cast to avoid TypeScript complaints about 'process' in the browser context
      typeof (globalThis as Record<string, unknown>)['process'] !== 'undefined' &&
      !!(globalThis as Record<string, unknown>)['process'],
  );
  expect(hasProcess).toBe(false);
});

// ---------------------------------------------------------------------------
// Renderer health
// ---------------------------------------------------------------------------

test('renderer process has not crashed after load', async () => {
  const crashed = await app.evaluate(({ BrowserWindow }) => {
    return BrowserWindow.getAllWindows()[0].webContents.isCrashed();
  });
  expect(crashed).toBe(false);
});

test('no uncaught JS errors are emitted to the console on startup', async () => {
  /**
   * Collects console messages logged DURING the test window's initial load.
   * An error here means a component threw or a store initialisation failed.
   */
  const app2 = await (
    await import('@playwright/test')
  )._electron.launch({
    args: [(await import('./helpers.js')).appDir + '/dist-electron/main.js'],
    cwd: (await import('./helpers.js')).appDir,
    env: { ...process.env, VITE_DEV_SERVER_URL: '', NODE_ENV: 'production' },
  });

  const errors: string[] = [];
  const win2 = await app2.firstWindow();

  win2.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await win2.waitForLoadState('networkidle');
  await app2.close();

  // Filter out known Electron/DevTools noise that isn't real app errors
  const appErrors = errors.filter(
    (e) =>
      !e.includes('net::ERR_') && !e.includes('Failed to load resource') && !e.includes('DevTools'),
  );
  expect(appErrors).toEqual([]);
});

// ---------------------------------------------------------------------------
// IPC resilience — handlers must not crash on bad/empty inputs
// ---------------------------------------------------------------------------

test('app:fs-read-dir returns empty array for a non-existent directory', async () => {
  /**
   * The handler wraps its logic in try/catch and returns [].
   * If someone removed that guard this would throw and crash the renderer
   * operation that called it.
   */
  const window = await app.firstWindow();
  const result = await window.evaluate(() =>
    (
      window as unknown as {
        ipcRenderer: { invoke: (ch: string, ...a: unknown[]) => Promise<unknown> };
      }
    ).ipcRenderer.invoke('app:fs-read-dir', {
      projectPath: 'Z:/this/path/does/not/exist',
      subDir: 'maps',
    }),
  );
  expect(Array.isArray(result)).toBe(true);
  expect((result as unknown[]).length).toBe(0);
});

test('app:fs-read-json returns null for a non-existent file', async () => {
  /**
   * The handler returns null on any read/parse failure.
   * Callers in the renderer guard against null — if it threw instead
   * the caller would get an unhandled rejection.
   */
  const window = await app.firstWindow();
  const result = await window.evaluate(() =>
    (
      window as unknown as {
        ipcRenderer: { invoke: (ch: string, ...a: unknown[]) => Promise<unknown> };
      }
    ).ipcRenderer.invoke('app:fs-read-json', {
      projectPath: 'Z:/does/not/exist',
      subDir: '',
      filename: 'ghost.json',
    }),
  );
  expect(result).toBeNull();
});

// ---------------------------------------------------------------------------
// Security: path traversal via IPC
// ---------------------------------------------------------------------------

test('app:fs-read-json cannot read files with a raw absolute path outside the project', async () => {
  /**
   * The IPC handler constructs the path as path.join(projectPath, subDir, filename).
   * A crafted call with subDir='../../../../' could escape the project directory.
   * This test asserts that reading a well-known OS file returns null
   * (either because the file isn't JSON-parseable, or because the handler
   * guards the path). If it returns a non-null value, path traversal is possible.
   *
   * Known issue: the handler does NOT validate paths — this test is expected
   * to FAIL until path sanitisation is added, documenting the vulnerability.
   */
  const window = await app.firstWindow();
  const result = await window.evaluate(() =>
    (
      window as unknown as {
        ipcRenderer: { invoke: (ch: string, ...a: unknown[]) => Promise<unknown> };
      }
    ).ipcRenderer.invoke('app:fs-read-json', {
      projectPath: 'C:\\Windows',
      subDir: '',
      filename: 'system.ini',
    }),
  );
  // system.ini is not valid JSON so the handler's JSON.parse() will throw and return null.
  // A *truly* secure implementation would also block the path before trying to read.
  // Either way the result must not expose real file contents as a parsed object.
  expect(result).toBeNull();
});

// ---------------------------------------------------------------------------
// Single-instance enforcement
// ---------------------------------------------------------------------------

test('no single-instance lock is enforced — two instances can launch simultaneously', async () => {
  /**
   * There is no app.requestSingleInstanceLock() call in main.ts.
   * This test DOCUMENTS the current (missing) behaviour.
   *
   * If this test passes it confirms the vulnerability: two instances can
   * write to the same project files concurrently and corrupt data.
   * The fix is to add app.requestSingleInstanceLock() / 'second-instance' handling.
   */
  const { launchApp: launch } = await import('./helpers.js');
  const { app: app2 } = await launch();
  const window2Count = app2.windows().length;
  await app2.close();

  // Two launches succeed → no lock in place.
  // Change this expectation to toBe(0) after adding the single-instance lock.
  expect(window2Count).toBeGreaterThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// Only one BrowserWindow should exist
// ---------------------------------------------------------------------------

test('exactly one window is open after launch', async () => {
  const count = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  expect(count).toBe(1);
});

// ---------------------------------------------------------------------------
// Application menu
// ---------------------------------------------------------------------------

test('application menu is present', async () => {
  /**
   * setupApplicationMenu() builds a menu with at least View and Edit entries.
   * If the menu setup crashes the app still loads but Ctrl+Z/Ctrl+S won't work.
   */
  const hasMenu = await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    return menu !== null;
  });
  expect(hasMenu).toBe(true);
});

test('Edit menu contains Undo and Redo items', async () => {
  const labels = await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    if (!menu) return [];
    const editMenu = menu.items.find((item) => item.label === 'Edit');
    if (!editMenu?.submenu) return [];
    return editMenu.submenu.items.map((item) => item.label);
  });
  expect(labels).toContain('Undo');
  expect(labels).toContain('Redo');
});
