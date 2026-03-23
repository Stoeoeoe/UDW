import { ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Resolve `segments` relative to `projectRoot` and verify the result stays
 * inside the project directory.  Throws on any path-traversal attempt.
 */
function assertWithinProject(projectRoot: string, ...segments: string[]): string {
    const root = path.resolve(projectRoot);
    const resolved = path.resolve(root, ...segments);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        throw new Error(`Path traversal detected: "${resolved}" is outside project root "${root}"`);
    }
    return resolved;
}

/** Basic structural validation for a loaded project file. */
function assertValidProject(obj: unknown): void {
    if (!obj || typeof obj !== 'object') throw new Error('Invalid project: not an object');
    const p = obj as Record<string, unknown>;
    if (typeof p.name !== 'string' || p.name.trim() === '')
        throw new Error('Invalid project: missing or empty "name"');
    if (typeof p.tileSize !== 'number' || p.tileSize <= 0)
        throw new Error('Invalid project: "tileSize" must be a positive number');
    if (typeof p.defaultMapWidth !== 'number' || p.defaultMapWidth <= 0)
        throw new Error('Invalid project: "defaultMapWidth" must be a positive number');
    if (typeof p.defaultMapHeight !== 'number' || p.defaultMapHeight <= 0)
        throw new Error('Invalid project: "defaultMapHeight" must be a positive number');
}

export function setupIpcHandlers(win: BrowserWindow | null) {
    // IPC Handlers for Native File System
    ipcMain.handle('app:open-project', async () => {
        if (!win) return null;
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            title: 'Select project.json',
            filters: [{ name: 'Project File', extensions: ['json'] }],
            properties: ['openFile']
        });

        if (canceled || filePaths.length === 0) return null;

        const filePath = filePaths[0];
        if (!filePath.endsWith('project.json')) {
            throw new Error('Please select the project.json file.');
        }

        const content = await fs.readFile(filePath, 'utf-8');
        const project = JSON.parse(content);
        assertValidProject(project);
        const projectPath = path.dirname(filePath);

        return { project, projectPath };
    });

    ipcMain.handle('app:load-project-by-path', async (_event, projectPath) => {
        const filePath = path.join(projectPath, 'project.json');
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const project = JSON.parse(content);
            assertValidProject(project);
            return { project, projectPath };
        } catch (e) {
            throw new Error(`Failed to load project at ${projectPath}: ${(e as Error).message}`);
        }
    });

    ipcMain.handle('app:create-project', async (_event, projectConfig) => {
        if (!win) return null;
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            title: 'Select Directory for New Project',
            properties: ['openDirectory', 'createDirectory']
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
            JSON.stringify(projectConfig, null, 2)
        );

        return { projectPath };
    });

    ipcMain.handle('app:fs-read-dir', async (_event, { projectPath, subDir }) => {
        const dirPath = assertWithinProject(projectPath, subDir);
        // Use directory-specific extensions to avoid reading stray files
        const expectedExt = subDir === 'maps' ? '.map.json'
                          : subDir === 'tilesets' ? '.tileset.json'
                          : '.json';
        try {
            const files = await fs.readdir(dirPath);
            const results = [];
            for (const file of files) {
                if (file.endsWith(expectedExt)) {
                    const filePath = assertWithinProject(projectPath, subDir, file);
                    const content = await fs.readFile(filePath, 'utf-8');
                    results.push(JSON.parse(content));
                }
            }
            return results;
        } catch (e) {
            return [];
        }
    });

    ipcMain.handle('app:fs-write-json', async (_event, { projectPath, subDir, filename, data }) => {
        const dirPath = assertWithinProject(projectPath, subDir);
        const filePath = assertWithinProject(projectPath, subDir, filename);
        await fs.mkdir(dirPath, { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    });

    ipcMain.handle('app:fs-read-json', async (_event, { projectPath, subDir, filename }) => {
        try {
            const filePath = assertWithinProject(projectPath, subDir || '.', filename);
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content);
        } catch (e) {
            return null;
        }
    });

    ipcMain.handle('app:fs-delete-json', async (_event, { projectPath, subDir, filename }) => {
        const filePath = assertWithinProject(projectPath, subDir, filename);
        await fs.unlink(filePath);
    });

    ipcMain.handle('app:fs-write-asset', async (_event, { projectPath, filename, buffer }) => {
        const dirPath = assertWithinProject(projectPath, 'assets');
        const filePath = assertWithinProject(projectPath, 'assets', filename);
        await fs.mkdir(dirPath, { recursive: true });
        // buffer is passed as Uint8Array
        await fs.writeFile(filePath, Buffer.from(buffer));
        return `assets/${filename}`;
    });

    ipcMain.handle('app:fs-read-asset', async (_event, { projectPath, relativePath }) => {
        const filePath = assertWithinProject(projectPath, relativePath);
        const data = await fs.readFile(filePath);
        return data; // Electron will serialize this as a Buffer/Uint8Array
    });

    ipcMain.handle('app:select-asset', async () => {
        if (!win) return null;
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            title: 'Select Image Asset',
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
            properties: ['openFile']
        });

        if (canceled || filePaths.length === 0) return null;
        return filePaths[0];
    });

    ipcMain.handle('app:read-file-buffer', async (_event, filePath) => {
        if (typeof filePath !== 'string') throw new Error('Invalid file path');
        const ext = path.extname(filePath).toLowerCase();
        const ALLOWED_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
        if (!ALLOWED_IMAGE_EXTS.includes(ext)) {
            throw new Error(`File type not allowed: only image files may be read via this channel`);
        }
        return await fs.readFile(filePath);
    });
}
