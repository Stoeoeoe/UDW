import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import { Tileset, TileDefinition } from '../../types/schema';
import { fileSystem } from '../../lib/fileSystem';
import { saveTilesetDebounced, saveTilesetImmediate } from '../../lib/saveManager';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface TilesetSlice {
  tilesets: Map<string, Tileset>;
  activeTilesetId: string | null;
  selectedTileIndex: number | null;
  selectedTileIndices: number[];
  mapEditorSelectedTileIndex: number | null;
  mapEditorSelectedTileIndices: number[];
  tilesetEditorSelectedTileIndex: number | null;
  tilesetEditorSelectedTileIndices: number[];
  selectedTerrainId: string | null;
  sampledPattern: {
    tilesetId: string;
    pattern: (number | null)[][];
    width: number;
    height: number;
  } | null;

  setActiveTileset: (id: string | null) => void;
  setSelectedTile: (index: number | null) => void;
  setSelectedTiles: (indexes: number[]) => void;
  toggleSelectedTile: (index: number) => void;
  setSelectedTerrain: (id: string | null) => void;
  setSampledPattern: (
    pattern: {
      tilesetId: string;
      pattern: (number | null)[][];
      width: number;
      height: number;
    } | null,
  ) => void;
  addTileset: (tileset: Tileset) => Promise<void>;
  updateTileset: (id: string, updates: Partial<Tileset>) => Promise<void>;
  deleteTileset: (id: string) => Promise<void>;
  updateTileDefinition: (tilesetId: string, index: number, definition: TileDefinition) => void;
  setTileCornerTerrain: (
    tilesetId: string,
    index: number,
    corner: number,
    terrainId: string | null,
  ) => Promise<void>;
  scheduleTilesetSave: (tilesetId: string) => void;
}

export const createTilesetSlice: ImmerStateCreator<TilesetSlice> = (set, get) => ({
  tilesets: new Map(),
  activeTilesetId: null,
  selectedTileIndex: null,
  selectedTileIndices: [],
  mapEditorSelectedTileIndex: null,
  mapEditorSelectedTileIndices: [],
  tilesetEditorSelectedTileIndex: null,
  tilesetEditorSelectedTileIndices: [],
  selectedTerrainId: null,
  sampledPattern: null,

  setActiveTileset: (id) =>
    set((state) => {
      state.activeTilesetId = id;
      state.selectedTileIndex = null;
      state.selectedTileIndices = [];
      state.selectedTerrainId = null;
    }),

  setSelectedTile: (index) =>
    set((state) => {
      state.selectedTileIndex = index;
      if (index !== null) state.selectedTerrainId = null;
      state.selectedTileIndices = index !== null ? [index] : [];
      state.sampledPattern = null;
    }),

  setSelectedTiles: (indexes) =>
    set((state) => {
      state.selectedTileIndices = indexes.slice();
      state.selectedTileIndex = indexes.length > 0 ? indexes[indexes.length - 1] : null;
      if (state.selectedTileIndex !== null) state.selectedTerrainId = null;
      state.sampledPattern = null;
    }),

  toggleSelectedTile: (index) =>
    set((state) => {
      const idx = state.selectedTileIndices.indexOf(index);
      if (idx === -1) state.selectedTileIndices.push(index);
      else state.selectedTileIndices.splice(idx, 1);
      state.selectedTileIndex =
        state.selectedTileIndices.length > 0
          ? state.selectedTileIndices[state.selectedTileIndices.length - 1]
          : null;
      if (state.selectedTileIndex !== null) state.selectedTerrainId = null;
    }),

  setSelectedTerrain: (id) =>
    set((state) => {
      state.selectedTerrainId = id;
      if (id !== null) state.selectedTileIndex = null;
    }),

  setSampledPattern: (pattern) =>
    set((state) => {
      state.sampledPattern = pattern;
      if (pattern) state.selectedTileIndices = [];
    }),

  scheduleTilesetSave: (tilesetId) => {
    saveTilesetDebounced(tilesetId);
  },

  addTileset: async (tileset) => {
    await saveTilesetImmediate(tileset);

    set((state) => {
      state.tilesets.set(tileset.id, castDraft(tileset));
      if (!state.activeTilesetId) state.activeTilesetId = tileset.id;
    });

    try {
      const blob = await fileSystem.loadAsset(tileset.spriteSheet);
      await get().loadSprite(tileset.spriteSheet, blob);
    } catch (e) {
      console.warn('Failed to load sprite for new tileset:', e);
    }
  },

  updateTileset: async (id, updates) => {
    let updatedTileset: Tileset | undefined;

    set((state) => {
      const ts = state.tilesets.get(id);
      if (ts) {
        Object.assign(ts, updates);
        updatedTileset = JSON.parse(JSON.stringify(ts));
      }
    });

    if (updatedTileset) {
      saveTilesetDebounced(updatedTileset.id);
      if ('spriteSheet' in updates && updatedTileset.spriteSheet) {
        try {
          const blob = await fileSystem.loadAsset(updatedTileset.spriteSheet);
          await get().loadSprite(updatedTileset.spriteSheet, blob);
        } catch (e) {
          console.warn('Failed to reload sprite after update:', e);
        }
      }
    }
  },

  deleteTileset: async (id) => {
    set((state) => {
      state.tilesets.delete(id);
      if (state.activeTilesetId === id) {
        state.activeTilesetId = null;
        state.selectedTileIndex = null;
      }
    });

    await fileSystem.deleteJson('tilesets', `${id}.vts`);
  },

  updateTileDefinition: (tilesetId, index, definition) => {
    set((state) => {
      const ts = state.tilesets.get(tilesetId);
      if (ts) {
        const normalizedDefinition =
          definition.pivotY === undefined
            ? definition
            : {
                ...definition,
                pivotY: Math.max(0, Math.round(definition.pivotY)),
              };
        ts.tiles[index] = castDraft(normalizedDefinition);
      }
    });
    get().scheduleTilesetSave(tilesetId);
  },

  setTileCornerTerrain: async (tilesetId, index, corner, terrainId) => {
    let updatedTileset: Tileset | undefined;

    set((state) => {
      const ts = state.tilesets.get(tilesetId);
      if (!ts) return;
      const tile = ts.tiles[index] || ({} as TileDefinition);
      if (!tile.terrainCorners) tile.terrainCorners = [null, null, null, null];
      tile.terrainCorners[corner] = terrainId;

      if (terrainId === null) {
        const updatedCorners = [...tile.terrainCorners];
        updatedCorners[corner] = null;
        if (updatedCorners.every((c) => c === null)) {
          delete tile.terrainCorners;
        } else {
          tile.terrainCorners = updatedCorners;
        }
      }

      ts.tiles[index] = castDraft(tile);
      updatedTileset = JSON.parse(JSON.stringify(ts));
    });

    if (updatedTileset) saveTilesetDebounced(updatedTileset.id);
  },
});
