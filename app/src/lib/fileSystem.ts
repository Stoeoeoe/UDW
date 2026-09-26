/**
 * File System Access Abstraction
 * Handles interaction with the local file system using either
 * Electron IPC (Native) or Web File System Access API.
 */

import {
  Actor,
  DialogueDocument,
  EntityType,
  Item,
  Map as GameMap,
  Project,
  Tileset,
} from '../types/schema';
import { migrateMapToEncodedData } from './tileRef';
import { deserializeMap } from './mapMigration';

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
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemDirectoryHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  values(): AsyncIterable<FileSystemHandle>;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: Blob | BufferSource | string): Promise<void>;
  close(): Promise<void>;
}

declare global {
  interface Window {
    showDirectoryPicker(options?: {
      mode?: 'read' | 'readwrite';
    }): Promise<FileSystemDirectoryHandle>;
    showOpenFilePicker(options?: unknown): Promise<FileSystemFileHandle[]>;
  }
}

export class FileSystemManager {
  private projectPath: string | null = null; // Used for Electron
  private projectRoot: FileSystemDirectoryHandle | null = null; // Used for Web

  isElectron(): boolean {
    return 'ipcRenderer' in window;
  }

  /**
   * Open a project by selecting .vproj (Electron)
   */
  async openProject(): Promise<{ project: Project; path: string }> {
    if (this.isElectron()) {
      const result = await window.ipcRenderer.invoke('app:open-project');
      if (!result) throw new Error('Open project cancelled.');

      this.projectPath = result.projectPath;
      return { project: result.project, path: result.projectPath };
    } else {
      if (!window.showDirectoryPicker) {
        throw new Error('File System Access API not supported.');
      }

      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      this.projectRoot = handle;

      // Find any file matching '*.vproj' in the root directory.
      let projectFile: FileSystemFileHandle | null = null;
      for await (const entry of handle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.vproj')) {
          projectFile = entry as FileSystemFileHandle;
          break;
        }
      }

      const file = await projectFile?.getFile();
      const text = await file?.text();
      const project = JSON.parse(text || '{}') as Project;
      return { project, path: handle.name };
    }
  }

  /**
   * Load a project by its direct path (Electron only)
   */
  async loadProjectByPath(path: string): Promise<{ project: Project; path: string }> {
    if (this.isElectron()) {
      const result = await window.ipcRenderer.invoke('app:load-project-by-path', path);
      this.projectPath = result.projectPath;
      return { project: result.project, path: result.projectPath };
    } else {
      throw new Error('Direct path loading not supported in browser.');
    }
  }

  /**
   * Create a new project structure.
   */
  async createProject(projectConfig: Project): Promise<{ path: string }> {
    if (this.isElectron()) {
      const result = await window.ipcRenderer.invoke('app:create-project', projectConfig);
      if (!result) throw new Error('Create project cancelled.');

      this.projectPath = result.projectPath;
      return { path: result.projectPath };
    } else {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      this.projectRoot = handle;

      await this.writeJSONWeb(handle, `${projectConfig.id}.vproj`, projectConfig);
      await handle.getDirectoryHandle('maps', { create: true });
      await handle.getDirectoryHandle('tilesets', { create: true });
      await handle.getDirectoryHandle('actors', { create: true });
      await handle.getDirectoryHandle('dialogues', { create: true });
      await handle.getDirectoryHandle('assets', { create: true });

      return { path: handle.name };
    }
  }

  /**
   * Load all maps from the maps/ directory
   */
  async loadAllMaps(): Promise<GameMap[]> {
    const maps = await this.readDirectory<GameMap>('maps', '.vmap');
    return maps.map((map) => deserializeMap(migrateMapToEncodedData(map)));
  }

  /**
   * Load all tilesets from the tilesets/ directory
   */
  async loadAllTilesets(): Promise<Tileset[]> {
    return this.readDirectory<Tileset>('tilesets', '.vts');
  }

  /**
   * Load all actors from actors/ (preferred) with legacy npcs/ fallback.
   */
  async loadAllActors(): Promise<Actor[]> {
    const actors = await this.readDirectory<Actor>('actors', '.actor.json', true);
    return actors.length > 0 ? actors : this.readDirectory<Actor>('npcs', '.npc.json', true);
  }

  /** @deprecated Use loadAllActors(). */
  async loadAllNpcs(): Promise<Actor[]> {
    return this.loadAllActors();
  }

  /**
   * Load all items from items/ directory.
   */
  async loadAllItems(): Promise<Item[]> {
    return this.readDirectory<Item>('items', '.vitm', true);
  }

  /**
   * Load all entity types from entities/ directory.
   */
  async loadAllEntityTypes(): Promise<EntityType[]> {
    return this.readDirectory<EntityType>('entities', '.entity.json', true);
  }

  async loadDialogueById(id: string): Promise<DialogueDocument | null> {
    const dialogue = await this.readJson('dialogues', `${id}.dialogue.json`);
    return (dialogue as DialogueDocument | null) ?? null;
  }

  async loadAllDialogues(): Promise<DialogueDocument[]> {
    const entries = await this.readDirectory<unknown>(
      'dialogues',
      '.dialogue.json',
      true,
      '.runtime.dialogue.json',
    );
    return entries.filter(isDialogueSourceDocument);
  }

  /**
   * Save a JSON file (Map, Tileset, or Project)
   */
  async saveJson(
    subDir: 'maps' | 'tilesets' | 'actors' | 'npcs' | 'dialogues' | 'items' | 'entities' | '',
    filename: string,
    data: unknown,
  ): Promise<void> {
    if (this.isElectron()) {
      await window.ipcRenderer.invoke('app:fs-write-json', {
        projectPath: this.projectPath,
        subDir,
        filename,
        data,
      });
    } else {
      if (!this.projectRoot) throw new Error('No project open.');
      const dir = await this.projectRoot.getDirectoryHandle(subDir || '.', { create: true });
      await this.writeJSONWeb(dir, filename, data);
    }
  }

  /**
   * Delete a JSON file
   */
  async deleteJson(
    subDir: 'maps' | 'tilesets' | 'actors' | 'npcs' | 'dialogues' | 'items' | 'entities' | '',
    filename: string,
  ): Promise<void> {
    if (this.isElectron()) {
      await window.ipcRenderer.invoke('app:fs-delete-json', {
        projectPath: this.projectPath,
        subDir,
        filename,
      });
    } else {
      if (!this.projectRoot) throw new Error('No project open.');
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
      return await window.ipcRenderer.invoke('app:fs-write-asset', {
        projectPath: this.projectPath,
        filename,
        buffer: new Uint8Array(buffer),
      });
    } else {
      if (!this.projectRoot) throw new Error('No project open.');
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
      const data = await window.ipcRenderer.invoke('app:fs-read-asset', {
        projectPath: this.projectPath,
        relativePath,
      });
      return new Blob([data]);
    } else {
      if (!this.projectRoot) throw new Error('No project open.');
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
      return await window.ipcRenderer.invoke('app:select-asset');
    }
    return null; // Browser should use standard <input type="file">
  }

  /**
   * Read an arbitrary JSON file from the project (root or subdir)
   */
  async readJson(subDir: string, filename: string): Promise<unknown | null> {
    if (this.isElectron()) {
      return await window.ipcRenderer.invoke('app:fs-read-json', {
        projectPath: this.projectPath,
        subDir,
        filename,
      });
    } else {
      if (!this.projectRoot) throw new Error('No project open.');
      const dir = subDir
        ? await this.projectRoot.getDirectoryHandle(subDir, { create: false })
        : this.projectRoot;
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
      const data = await window.ipcRenderer.invoke('app:read-file-buffer', filePath);
      return new Blob([data]);
    }
    throw new Error('Direct file reading from path is only supported in Electron.');
  }

  private async readDirectory<T>(
    subDir: string,
    extension: string,
    optional = false,
    excludedExtension?: string,
  ): Promise<T[]> {
    if (this.isElectron()) {
      return (await window.ipcRenderer.invoke('app:fs-read-dir', {
        projectPath: this.projectPath,
        subDir,
      })) as T[];
    }

    if (!this.projectRoot) throw new Error('No project open.');
    const results: T[] = [];
    try {
      const dir = await this.projectRoot.getDirectoryHandle(subDir, { create: false });
      for await (const entry of dir.values()) {
        if (
          entry.kind !== 'file' ||
          !entry.name.endsWith(extension) ||
          (excludedExtension && entry.name.endsWith(excludedExtension))
        )
          continue;
        const file = await (entry as FileSystemFileHandle).getFile();
        results.push(JSON.parse(await file.text()) as T);
      }
    } catch (error) {
      if (!optional) throw error;
    }
    return results;
  }

  private async writeJSONWeb(
    dirHandle: FileSystemDirectoryHandle,
    filename: string,
    data: unknown,
  ): Promise<void> {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  }
}

export const fileSystem = new FileSystemManager();

function isDialogueSourceDocument(value: unknown): value is DialogueDocument {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.nodes) &&
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    record.$schema === '../../schemas/dialogue.schema.json'
  );
}
