import { StateCreator } from 'zustand';
import { castDraft } from 'immer';
import type { Project, Tileset } from '../../types/schema';
import { recentProjects } from '../../lib/recentProjects';
import { fileSystem } from '../../lib/fileSystem';
import { spriteObjectUrls, addMissingDefinitionLayers } from '../storeHelpers';

export interface ProjectSlice {
  project: Project | null;
  projectPath: string | null;
  tilesets: globalThis.Map<string, Tileset>;
  loadedSprites: globalThis.Map<string, HTMLImageElement>;

  loadProject: (path: string, project: Project) => Promise<void>;
  closeProject: () => void;
  loadProjectResources: () => Promise<void>;
  loadSprite: (path: string, blob: Blob) => Promise<string>;
  updateProject: (project: Project) => Promise<void>;
}

export const createProjectSlice: StateCreator<any, any, [], ProjectSlice> = (set, get) => ({
  project: null,
  projectPath: null,
  tilesets: new globalThis.Map(),
  loadedSprites: new globalThis.Map(),

  loadProject: async (path, project) => {
    set((state: any) => {
      state.project = project;
      state.projectPath = path;
      // Reset resources and map state
      state.currentMap = null;
      state.currentMapPath = null;
      state.maps = [];
      state.tilesets = new globalThis.Map();
      state.loadedSprites = new globalThis.Map();
      state.selectedLayerId = null;
      state.activeTilesetId = null;
      state.selectedTileIndex = null;
      state.activeVariationId = null;
      state.terrainTypes = [];
      state.entityTypes = [];
    });
    recentProjects.add(project.name, path);
  },

  closeProject: () => {
    set((state: any) => {
      state.project = null;
      state.projectPath = null;
      state.currentMap = null;
      state.maps = [];
      state.tilesets = new globalThis.Map();
      state.loadedSprites = new globalThis.Map();
      state.activeTilesetId = null;
      state.selectedTileIndex = null;
      state.entityTypes = [];
    });
  },

  loadProjectResources: async () => {
    // 1. Load all tilesets
    const tilesets = await fileSystem.loadAllTilesets();
    for (const tileset of tilesets) {
      set((state: any) => {
        state.tilesets.set(tileset.id, castDraft(tileset));
      });

      // Load sprite for each tileset
      try {
        const blob = await fileSystem.loadAsset(tileset.spriteSheet);
        await get().loadSprite(tileset.spriteSheet, blob);
      } catch (e) {
        console.warn(`Failed to load sprite for tileset ${tileset.id}:`, e);
      }
    }

    // Set first tileset as active if none is set
    set((state: any) => {
      if (!state.activeTilesetId && tilesets.length > 0) {
        state.activeTilesetId = tilesets[0].id;
        state.selectedTileIndex = 0;
      }
    });

    // 1.5 Load terrain types from project.json (if present)
    const proj = get().project as Project | null;
    if (proj?.terrainTypes && Array.isArray(proj.terrainTypes)) {
      set((state: any) => {
        state.terrainTypes = proj.terrainTypes!.map((t: any) => castDraft(t));
      });
    }

    // 1.6 Load layer definitions from project.json (if present)
    if (proj?.layerDefinitions && Array.isArray(proj.layerDefinitions)) {
      set((state: any) => {
        state.layerDefinitions = proj.layerDefinitions!.map((d: any) =>
          castDraft(d),
        );
      });
    }

    // 1.7 Load entity types from project.json (if present)
    if (proj?.entityTypes && Array.isArray(proj.entityTypes)) {
      set((state: any) => {
        state.entityTypes = proj.entityTypes!.map((e: any) => castDraft(e));
      });
    }

    // 2. Load all maps
    const maps = await fileSystem.loadAllMaps();

    // Get layer definitions to inject into maps
    const layerDefs = get().layerDefinitions;

    // Enrich all maps with missing layers and store the full list
    const enrichedMaps = maps.map((m: any) =>
      addMissingDefinitionLayers(m, layerDefs),
    );

    set((state: any) => {
      state.maps = castDraft(enrichedMaps);
    });

    // Optionally load the first map as current
    if (enrichedMaps.length > 0) {
      set((state: any) => {
        state.currentMap = castDraft(enrichedMaps[0]);
        // Auto-select first layer
        if (enrichedMaps[0].layers.length > 0) {
          state.selectedLayerId = enrichedMaps[0].layers[0].id;
        }
      });
    }
  },

  loadSprite: async (path, blob) => {
    // Revoke any previous URL for this path before creating a new one
    const existing = spriteObjectUrls.get(path);
    if (existing) URL.revokeObjectURL(existing);

    const url = URL.createObjectURL(blob);
    spriteObjectUrls.set(path, url);
    const img = new Image();
    img.src = url;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    set((state: any) => {
      state.loadedSprites.set(path, castDraft(img));
    });

    return url;
  },

  updateProject: async (project) => {
    await fileSystem.saveJson('', 'project.json', project);
    set((state: any) => {
      state.project = project;
    });
  },
});
