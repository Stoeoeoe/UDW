import { ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';

export function setupIpcHandlers(win: BrowserWindow | null) {
  // Map of active chokidar watchers per projectPath so we can stop them when switching projects
  const activeWatchers: Map<string, FSWatcher[]> = new Map();

  function stopAllWatchers() {
    for (const projectPath of activeWatchers.keys()) {
      stopWatchers(projectPath);
    }
  }

  function stopWatchers(projectPath: string) {
    const arr = activeWatchers.get(projectPath) || [];
    for (const w of arr) {
      try {
        // chokidar watcher.close() returns a Promise
        const res = w.close();
        if (res && typeof res.then === 'function') res.catch(() => {});
      } catch (e) {
        // ignore
      }
    }
    activeWatchers.delete(projectPath);
  }

  function startWatchingProject(projectPath: string) {
    stopAllWatchers();

    const watchers: FSWatcher[] = [];

    // Watch image/asset changes
    try {
      const assetsGlob =
        path.join(projectPath, 'assets').replace(/\\/g, '/') + '/**/*.{png,jpg,jpeg,ase,aseprite}';
      const wAssets = chokidar.watch(assetsGlob, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 200 },
        usePolling: true,
        interval: 100,
      });
      wAssets.on('all', (event: string, filePathChanged: string) => {
        const rel = path.relative(projectPath, filePathChanged).replace(/\\/g, '/');
        win?.webContents.send('app:asset-changed', { eventType: event, relativePath: rel });
      });
      watchers.push(wAssets);
    } catch (e) {
      // ignore
    }

    // Watch tileset JSON changes
    try {
      const tilesGlob = path.join(projectPath, 'tilesets').replace(/\\/g, '/') + '/**/*.vts';
      const wTiles = chokidar.watch(tilesGlob, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 200 },
        usePolling: true,
        interval: 100,
      });
      wTiles.on('all', async (event: string, filePathChanged: string) => {
        const rel = path.relative(projectPath, filePathChanged).replace(/\\/g, '/');
        // Try to read and parse tileset JSON and send it to renderer
        try {
          const content = await fs.readFile(filePathChanged, 'utf-8');
          const parsed = JSON.parse(content);
          win?.webContents.send('app:tileset-changed', {
            eventType: event,
            relativePath: rel,
            tileset: parsed,
          });
        } catch (e) {
          // On parse/read error, still notify that file changed
          win?.webContents.send('app:tileset-changed', {
            eventType: event,
            relativePath: rel,
            tileset: null,
          });
        }
      });
      watchers.push(wTiles);
    } catch (e) {
      // ignore
    }

    if (watchers.length > 0) activeWatchers.set(projectPath, watchers);
  }
  // IPC Handlers for Native File System
  ipcMain.handle('app:open-project', async () => {
    if (!win) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Select .vproj',
      filters: [{ name: 'Project File', extensions: ['vproj'] }],
      properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) return null;

    const filePath = filePaths[0];
    if (!filePath.endsWith('.vproj')) {
      throw new Error('Please select the .vproj file.');
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const project = JSON.parse(content);
    const projectPath = path.dirname(filePath);
    // Start filesystem watchers for assets/tilesets in this project
    startWatchingProject(projectPath);

    return { project, projectPath };
  });

  ipcMain.handle('app:load-project-by-path', async (_event, projectPath) => {
    try {
      // Prefer any file ending with '.vproj' inside the folder.
      const files = await fs.readdir(projectPath);
      const projFile = files.find((f) => f.endsWith('.vproj')) || 'project.vproj';
      const filePath = path.join(projectPath, projFile);
      const content = await fs.readFile(filePath, 'utf-8');
      const project = JSON.parse(content);
      // Start filesystem watchers for assets/tilesets in this project
      startWatchingProject(projectPath);
      return { project, projectPath };
    } catch (e) {
      throw new Error(`Failed to load project at ${projectPath}: ${(e as Error).message}`);
    }
  });

  ipcMain.handle('app:create-project', async (_event, projectConfig) => {
    if (!win) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Select Directory for New Project',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (canceled || filePaths.length === 0) return null;

    const projectPath = filePaths[0];

    // 1. Create subdirectories
    await fs.mkdir(path.join(projectPath, 'maps'), { recursive: true });
    await fs.mkdir(path.join(projectPath, 'tilesets'), { recursive: true });
    await fs.mkdir(path.join(projectPath, 'actors'), { recursive: true });
    await fs.mkdir(path.join(projectPath, 'dialogues'), { recursive: true });
    await fs.mkdir(path.join(projectPath, 'assets'), { recursive: true });

    // 2. Write <id>.vproj
    await fs.writeFile(
      path.join(projectPath, `${projectConfig.id}.vproj`),
      JSON.stringify(projectConfig, null, 2),
    );

    // Start watchers for the newly created project
    startWatchingProject(projectPath);

    return { projectPath };
  });

  ipcMain.handle('app:fs-read-dir', async (_event, { projectPath, subDir }) => {
    const fileExtensions = ['vproj', 'vmap', 'vts', 'vitm', 'json']; // Add other relevant extensions as needed
    const dirPath = path.join(projectPath, subDir);
    try {
      const files = await fs.readdir(dirPath);
      const results = [];
      for (const file of files) {
        if (fileExtensions.some((ext) => file.endsWith(`.${ext}`))) {
          const content = await fs.readFile(path.join(dirPath, file), 'utf-8');
          results.push(JSON.parse(content));
        }
      }
      return results;
    } catch (e) {
      return [];
    }
  });

  ipcMain.handle('app:fs-write-json', async (_event, { projectPath, subDir, filename, data }) => {
    const dirPath = path.join(projectPath, subDir);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(path.join(dirPath, filename), JSON.stringify(data, null, 2));
  });

  ipcMain.handle('app:fs-read-json', async (_event, { projectPath, subDir, filename }) => {
    try {
      const filePath = path.join(projectPath, subDir || '', filename);
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      return null;
    }
  });

  ipcMain.handle('app:fs-delete-json', async (_event, { projectPath, subDir, filename }) => {
    const filePath = path.join(projectPath, subDir, filename);
    await fs.unlink(filePath);
  });

  ipcMain.handle('app:fs-write-asset', async (_event, { projectPath, filename, buffer }) => {
    const dirPath = path.join(projectPath, 'assets');
    await fs.mkdir(dirPath, { recursive: true });
    // buffer is passed as Uint8Array
    await fs.writeFile(path.join(dirPath, filename), Buffer.from(buffer));
    return `assets/${filename}`;
  });

  ipcMain.handle('app:fs-read-asset', async (_event, { projectPath, relativePath }) => {
    const filePath = path.join(projectPath, relativePath);
    const data = await fs.readFile(filePath);
    return data; // Electron will serialize this as a Buffer/Uint8Array
  });

  ipcMain.handle('app:select-asset', async () => {
    if (!win) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Select Sprite Asset',
      filters: [{ name: 'Sprites', extensions: ['png', 'jpg', 'jpeg', 'ase', 'aseprite'] }],
      properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
  });

  ipcMain.handle('app:read-file-buffer', async (_event, filePath) => {
    return await fs.readFile(filePath);
  });

  ipcMain.handle('app:stop-watching', async (_event, projectPath) => {
    stopWatchers(projectPath);
  });
}
