import { ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';

export function setupIpcHandlers(win: BrowserWindow | null) {
  // IPC Handlers for Native File System
  ipcMain.handle('app:open-project', async () => {
    if (!win) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Select project.json',
      filters: [{ name: 'Project File', extensions: ['json'] }],
      properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) return null;

    const filePath = filePaths[0];
    if (!filePath.endsWith('project.json')) {
      throw new Error('Please select the project.json file.');
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const project = JSON.parse(content);
    const projectPath = path.dirname(filePath);

    return { project, projectPath };
  });

  ipcMain.handle('app:load-project-by-path', async (_event, projectPath) => {
    const filePath = path.join(projectPath, 'project.json');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const project = JSON.parse(content);
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
    await fs.mkdir(path.join(projectPath, 'assets'), { recursive: true });

    // 2. Write project.json
    await fs.writeFile(
      path.join(projectPath, 'project.json'),
      JSON.stringify(projectConfig, null, 2),
    );

    return { projectPath };
  });

  ipcMain.handle('app:fs-read-dir', async (_event, { projectPath, subDir }) => {
    const dirPath = path.join(projectPath, subDir);
    try {
      const files = await fs.readdir(dirPath);
      const results = [];
      for (const file of files) {
        if (file.endsWith('.json')) {
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
      title: 'Select Image Asset',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
      properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
  });

  ipcMain.handle('app:read-file-buffer', async (_event, filePath) => {
    return await fs.readFile(filePath);
  });
}
