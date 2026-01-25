/**
 * File System Access API Abstraction
 * Handles interaction with the local file system.
 */

import { Project, Map as GameMap, Tileset } from '../types/schema';

// Browser specific types for File System Access API
// These are often available in modern browsers but may need explicit typing if tsconfig is strict
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
    }
}

export class FileSystemManager {
    private projectRoot: FileSystemDirectoryHandle | null = null;

    /**
     * Get the current project root handle
     */
    getProjectRoot(): FileSystemDirectoryHandle | null {
        return this.projectRoot;
    }

    /**
     * Open a directory as a project root.
     * Returns the project configuration if found, or throws if invalid.
     */
    async openProject(): Promise<{ project: Project, handle: FileSystemDirectoryHandle }> {
        if (!window.showDirectoryPicker) {
            throw new Error("File System Access API not supported in this browser.");
        }

        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        this.projectRoot = handle;

        // Verify project structure
        try {
            const projectFileHandle = await handle.getFileHandle('project.json');
            const file = await projectFileHandle.getFile();
            const text = await file.text();
            const project = JSON.parse(text) as Project;
            return { project, handle };
        } catch (e) {
            console.error("Failed to load project.json", e);
            throw new Error("Selected directory is not a valid project (missing project.json).");
        }
    }

    /**
     * Create a new project structure in the selected directory.
     */
    async createProject(projectConfig: Project): Promise<FileSystemDirectoryHandle> {
        if (!window.showDirectoryPicker) {
            throw new Error("File System Access API not supported.");
        }

        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        this.projectRoot = handle;

        // 1. Write project.json
        await this.writeJSON(handle, 'project.json', projectConfig);

        // 2. Create subdirectories
        await handle.getDirectoryHandle('maps', { create: true });
        await handle.getDirectoryHandle('tilesets', { create: true });
        await handle.getDirectoryHandle('assets', { create: true });

        return handle;
    }

    /**
     * Save the project.json file
     */
    async saveProject(project: Project): Promise<void> {
        if (!this.projectRoot) throw new Error("No project open.");
        await this.writeJSON(this.projectRoot, 'project.json', project);
    }

    /**
     * Load all maps from the maps/ directory
     */
    async loadAllMaps(): Promise<GameMap[]> {
        if (!this.projectRoot) throw new Error("No project open.");

        const maps: GameMap[] = [];
        try {
            const mapsDir = await this.projectRoot.getDirectoryHandle('maps', { create: false });

            for await (const entry of mapsDir.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.map.json')) {
                    const fileHandle = entry as FileSystemFileHandle;
                    const file = await fileHandle.getFile();
                    const text = await file.text();
                    const map = JSON.parse(text) as GameMap;
                    maps.push(map);
                }
            }
        } catch (e) {
            console.warn("Maps directory not found or empty", e);
        }

        return maps;
    }

    /**
     * Load a specific map by ID
     */
    async loadMap(mapId: string): Promise<GameMap> {
        if (!this.projectRoot) throw new Error("No project open.");

        const mapsDir = await this.projectRoot.getDirectoryHandle('maps', { create: false });
        const filename = `${mapId}.map.json`;
        const fileHandle = await mapsDir.getFileHandle(filename);
        const file = await fileHandle.getFile();
        const text = await file.text();
        return JSON.parse(text) as GameMap;
    }

    /**
     * Save a Map file
     */
    async saveMap(map: GameMap): Promise<void> {
        if (!this.projectRoot) throw new Error("No project open.");

        const mapsDir = await this.projectRoot.getDirectoryHandle('maps', { create: true });
        const filename = `${map.id}.map.json`;
        await this.writeJSON(mapsDir, filename, map);
    }

    /**
     * Delete a map file
     */
    async deleteMap(mapId: string): Promise<void> {
        if (!this.projectRoot) throw new Error("No project open.");

        const mapsDir = await this.projectRoot.getDirectoryHandle('maps', { create: false });
        const filename = `${mapId}.map.json`;
        await mapsDir.removeEntry(filename);
    }

    /**
     * Load all tilesets from the tilesets/ directory
     */
    async loadAllTilesets(): Promise<Tileset[]> {
        if (!this.projectRoot) throw new Error("No project open.");

        const tilesets: Tileset[] = [];
        try {
            const tilesetsDir = await this.projectRoot.getDirectoryHandle('tilesets', { create: false });

            for await (const entry of tilesetsDir.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.tileset.json')) {
                    const fileHandle = entry as FileSystemFileHandle;
                    const file = await fileHandle.getFile();
                    const text = await file.text();
                    const tileset = JSON.parse(text) as Tileset;
                    tilesets.push(tileset);
                }
            }
        } catch (e) {
            console.warn("Tilesets directory not found or empty", e);
        }

        return tilesets;
    }

    /**
     * Save a Tileset file
     */
    async saveTileset(tileset: Tileset): Promise<void> {
        if (!this.projectRoot) throw new Error("No project open.");

        const tilesetsDir = await this.projectRoot.getDirectoryHandle('tilesets', { create: true });
        const filename = `${tileset.id}.tileset.json`;
        await this.writeJSON(tilesetsDir, filename, tileset);
    }

    /**
     * Save an asset file (image, etc.)
     */
    async saveAsset(filename: string, blob: Blob): Promise<string> {
        if (!this.projectRoot) throw new Error("No project open.");

        const assetsDir = await this.projectRoot.getDirectoryHandle('assets', { create: true });
        const fileHandle = await assetsDir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();

        return `assets/${filename}`;
    }

    /**
     * Load an asset file as a Blob
     */
    async loadAsset(relativePath: string): Promise<Blob> {
        if (!this.projectRoot) throw new Error("No project open.");

        // Parse path like "assets/spritesheet.png"
        const parts = relativePath.split('/');
        let currentDir = this.projectRoot;

        // Navigate to parent directory
        for (let i = 0; i < parts.length - 1; i++) {
            currentDir = await currentDir.getDirectoryHandle(parts[i], { create: false });
        }

        // Get file
        const filename = parts[parts.length - 1];
        const fileHandle = await currentDir.getFileHandle(filename);
        const file = await fileHandle.getFile();
        return file;
    }

    /**
     * Helper to write JSON to a file handle
     */
    private async writeJSON(dirHandle: FileSystemDirectoryHandle, filename: string, data: any): Promise<void> {
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
    }
}

export const fileSystem = new FileSystemManager();
