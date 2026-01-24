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
     * Save a Map file
     */
    async saveMap(map: GameMap): Promise<void> {
        if (!this.projectRoot) throw new Error("No project open.");

        const mapsDir = await this.projectRoot.getDirectoryHandle('maps', { create: false });
        // Use map.id for filename to be safe, or sanitize map.name
        const filename = `${map.id}.map.json`;
        await this.writeJSON(mapsDir, filename, map);
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
