import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  session,
  type MenuItemConstructorOptions,
} from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setupIpcHandlers } from './ipcHandlers';
import { setupLuaLSHandlers } from './luaLanguageServer';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
//
process.env.APP_ROOT = path.join(__dirname, '..');

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let win: BrowserWindow | null;

function sendHistoryCommand(command: 'undo' | 'redo') {
  win?.webContents.send('app:history-command', command);
}

function setupApplicationMenu() {
  const template: MenuItemConstructorOptions[] = [];

  if (process.platform === 'darwin') {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  template.push({
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
    ],
  });

  template.push({
    label: 'Edit',
    submenu: [
      {
        label: 'Undo',
        accelerator: 'CommandOrControl+Z',
        click: () => sendHistoryCommand('undo'),
      },
      {
        label: 'Redo',
        accelerator: 'CommandOrControl+Y',
        click: () => sendHistoryCommand('redo'),
      },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  });

  if (process.platform === 'darwin') {
    template.push({ role: 'windowMenu' });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const getAppIconPath = () => {
    if (VITE_DEV_SERVER_URL) {
      return path.join(process.env.VITE_PUBLIC, 'icon.png');
    }
    if (process.platform === 'darwin') {
      return path.join(process.env.APP_ROOT, 'build', 'icon.icns');
    }
    if (process.platform === 'win32') {
      return path.join(process.env.APP_ROOT, 'build', 'icon.ico');
    }
    return path.join(process.env.APP_ROOT, 'build', 'icon.png');
  };

  const iconPath = getAppIconPath();

  win = new BrowserWindow({
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.maximize();

  // Initialize IPC Handlers
  setupIpcHandlers(win);
  setupLuaLSHandlers(win);
  setupApplicationMenu();

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  // On macOS, set the dock icon explicitly (use nativeImage for consistent results)
  if (process.platform === 'darwin') {
    try {
      const ic = nativeImage.createFromPath(path.join(process.env.APP_ROOT, 'build', 'icon.icns'));
      if (!ic.isEmpty && app.dock) app.dock.setIcon(ic);
    } catch (e) {
      // fail silently if icon not present
    }
  }
}

function setCsp() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        //'Content-Security-Policy': ["default-src 'none'"], TODO: set a proper CSP!
      },
    });
  });
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(setCsp).then(createWindow);
