import { ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * IPC Handlers for native file system operations.
 * Customize these for your application's data layer.
 */
export function setupIpcHandlers(win: BrowserWindow | null) {
  // Example: Open a file
  ipcMain.handle('app:open-file', async () => {
    if (!win) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Open File',
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;

    const filePath = filePaths[0];
    const content = await fs.readFile(filePath, 'utf-8');
    return { filePath, content };
  });

  // Example: Save a file
  ipcMain.handle('app:save-file', async (_event, { filePath, content }) => {
    await fs.writeFile(filePath, content, 'utf-8');
  });

  // Example: Read JSON
  ipcMain.handle('app:read-json', async (_event, filePath: string) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  });

  // Example: Write JSON
  ipcMain.handle('app:write-json', async (_event, { filePath, data }) => {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  });
}
