/**
 * File System Access Abstraction
 * Handles interaction with the local file system using either
 * Electron IPC (Native) or Web File System Access API.
 */

import { Project, Map as GameMap, Tileset } from '../types/schema';
import { migrateMapToEncodedData } from './tileRef';

// Types for Web API fallback
interface FileSystemHandle {
    kind: 'file' | 'directory';
    name: string;
}

interface FileSystemFileHandle extends FileSystemHandle {
    kind: 'file';
    getFile(): Promise<File>;
    createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
    kind: 'directory';
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
    removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
    values(): AsyncIterable<FileSystemHandle>;
}

interface FileSystemWritableFileStream extends WritableStream {
    write(data: any): Promise<void>;
    close(): Promise<void>;
}

declare global {
    interface Window {
        showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
        showOpenFilePicker(options?: any): Promise<FileSystemFileHandle[]>;
    }
}

export class FileSystemManager {
    private projectPath: string | null = null; // Used for Electron
    private projectRoot: FileSystemDirectoryHandle | null = null; // Used for Web

    isElectron(): boolean {
        return !!(window as any).ipcRenderer;
    }

    /**
     * Open a project by selecting project.json (Electron) or a folder (Web fallback)
     */
    async openProject(): Promise<{ project: Project, path: string }> {
        if (this.isElectron()) {
            const result = await (window as any).ipcRenderer.invoke('app:open-project');
            if (!result) throw new Error("Open project cancelled.");

            this.projectPath = result.projectPath;
            return { project: result.project, path: result.projectPath };
        } else {
            if (!window.showDirectoryPicker) {
                throw new Error("File System Access API not supported.");
            }

            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            this.projectRoot = handle;

            const projectFileHandle = await handle.getFileHandle('project.json');
            const file = await projectFileHandle.getFile();
            const text = await file.text();
            const project = JSON.parse(text) as Project;
            return { project, path: handle.name };
        }
    }

    /**
     * Load a project by its direct path (Electron only)
     */
    async loadProjectByPath(path: string): Promise<{ project: Project, path: string }> {
        if (this.isElectron()) {
            const result = await (window as any).ipcRenderer.invoke('app:load-project-by-path', path);
            this.projectPath = result.projectPath;
            return { project: result.project, path: result.projectPath };
        } else {
            throw new Error("Direct path loading not supported in browser.");
        }
    }

    /**
     * Create a new project structure.
     */
    async createProject(projectConfig: Project): Promise<{ path: string }> {
        if (this.isElectron()) {
            const result = await (window as any).ipcRenderer.invoke('app:create-project', projectConfig);
            if (!result) throw new Error("Create project cancelled.");

            this.projectPath = result.projectPath;
            return { path: result.projectPath };
        } else {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            this.projectRoot = handle;

            await this.writeJSONWeb(handle, 'project.json', projectConfig);
            await handle.getDirectoryHandle('maps', { create: true });
            await handle.getDirectoryHandle('tilesets', { create: true });
            await handle.getDirectoryHandle('assets', { create: true });

            return { path: handle.name };
        }
    }

    /**
     * Load all maps from the maps/ directory
     */
    async loadAllMaps(): Promise<GameMap[]> {
        if (this.isElectron()) {
            const maps = await (window as any).ipcRenderer.invoke('app:fs-read-dir', {
                projectPath: this.projectPath,
                subDir: 'maps'
            });
            return maps.map(migrateMapToEncodedData);
        } else {
            if (!this.projectRoot) throw new Error("No project open.");
            const maps: GameMap[] = [];
            const dir = await this.projectRoot.getDirectoryHandle('maps', { create: false });
            for await (const entry of dir.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.map.json')) {
                    const file = await (entry as FileSystemFileHandle).getFile();
                    const mapData = JSON.parse(await file.text());
                    maps.push(migrateMapToEncodedData(mapData));
                }
            }
            return maps;
        }
    }

    /**
     * Load all tilesets from the tilesets/ directory
     */
    async loadAllTilesets(): Promise<Tileset[]> {
        if (this.isElectron()) {
            return await (window as any).ipcRenderer.invoke('app:fs-read-dir', {
                projectPath: this.projectPath,
                subDir: 'tilesets'
            });
        } else {
            if (!this.projectRoot) throw new Error("No project open.");
            const tilesets: Tileset[] = [];
            const dir = await this.projectRoot.getDirectoryHandle('tilesets', { create: false });
            for await (const entry of dir.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.tileset.json')) {
                    const file = await (entry as FileSystemFileHandle).getFile();
                    tilesets.push(JSON.parse(await file.text()));
                }
            }
            return tilesets;
        }
    }

    /**
     * Save a JSON file (Map, Tileset, or Project)
     */
    async saveJson(subDir: 'maps' | 'tilesets' | '', filename: string, data: any): Promise<void> {
        if (this.isElectron()) {
            await (window as any).ipcRenderer.invoke('app:fs-write-json', {
                projectPath: this.projectPath,
                subDir,
                filename,
                data
            });
        } else {
            if (!this.projectRoot) throw new Error("No project open.");
            const dir = await this.projectRoot.getDirectoryHandle(subDir || '.', { create: true });
            await this.writeJSONWeb(dir, filename, data);
        }
    }

    /**
     * Delete a JSON file
     */
    async deleteJson(subDir: 'maps' | 'tilesets' | '', filename: string): Promise<void> {
        if (this.isElectron()) {
            await (window as any).ipcRenderer.invoke('app:fs-delete-json', {
                projectPath: this.projectPath,
                subDir,
                filename
            });
        } else {
            if (!this.projectRoot) throw new Error("No project open.");
            const dir = await this.projectRoot.getDirectoryHandle(subDir || '.', { create: false });
            await dir.removeEntry(filename);
        }
    }

    /**
     * Save an asset file (image, etc.)
     */
    async saveAsset(filename: string, blob: Blob): Promise<string> {
        if (this.isElectron()) {
            const buffer = await blob.arrayBuffer();
            return await (window as any).ipcRenderer.invoke('app:fs-write-asset', {
                projectPath: this.projectPath,
                filename,
                buffer: new Uint8Array(buffer)
            });
        } else {
            if (!this.projectRoot) throw new Error("No project open.");
            const dir = await this.projectRoot.getDirectoryHandle('assets', { create: true });
            const fileHandle = await dir.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            return `assets/${filename}`;
        }
    }

    /**
     * Load an asset file as a Blob
     */
    async loadAsset(relativePath: string): Promise<Blob> {
        if (this.isElectron()) {
            const data = await (window as any).ipcRenderer.invoke('app:fs-read-asset', {
                projectPath: this.projectPath,
                relativePath
            });
            return new Blob([data]);
        } else {
            if (!this.projectRoot) throw new Error("No project open.");
            const parts = relativePath.split('/');
            let currentDir = this.projectRoot;
            for (let i = 0; i < parts.length - 1; i++) {
                currentDir = await currentDir.getDirectoryHandle(parts[i], { create: false });
            }
            const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1]);
            return await fileHandle.getFile();
        }
    }

    async selectAsset(): Promise<string | null> {
        if (this.isElectron()) {
            return await (window as any).ipcRenderer.invoke('app:select-asset');
        }
        return null; // Browser should use standard <input type="file">
    }

    /**
     * Read an arbitrary JSON file from the project (root or subdir)
     */
    async readJson(subDir: string, filename: string): Promise<any | null> {
        if (this.isElectron()) {
            return await (window as any).ipcRenderer.invoke('app:fs-read-json', {
                projectPath: this.projectPath,
                subDir,
                filename
            });
        } else {
            if (!this.projectRoot) throw new Error("No project open.");
            const dir = subDir ? await this.projectRoot.getDirectoryHandle(subDir, { create: false }) : this.projectRoot;
            try {
                const fh = await dir.getFileHandle(filename);
                const file = await fh.getFile();
                const text = await file.text();
                return JSON.parse(text);
            } catch (e) {
                return null;
            }
        }
    }

    async readFileAsBlob(filePath: string): Promise<Blob> {
        if (this.isElectron()) {
            const data = await (window as any).ipcRenderer.invoke('app:read-file-buffer', filePath);
            return new Blob([data]);
        }
        throw new Error("Direct file reading from path is only supported in Electron.");
    }

    private async writeJSONWeb(dirHandle: FileSystemDirectoryHandle, filename: string, data: any): Promise<void> {
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
    }
}

export const fileSystem = new FileSystemManager();
