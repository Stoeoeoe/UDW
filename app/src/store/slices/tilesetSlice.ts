import { StateCreator } from 'zustand';
import { castDraft } from 'immer';
import type { Tileset, TileDefinition } from '../../types/schema';
import { fileSystem } from '../../lib/fileSystem';
import { useSaveStore } from '../../lib/saveManager';
import { spriteObjectUrls } from '../storeHelpers';

export interface TilesetSlice {
  addTileset: (tileset: Tileset) => Promise<void>;
  updateTileset: (id: string, updates: Partial<Tileset>) => Promise<void>;
  deleteTileset: (id: string) => Promise<void>;
  updateTileDefinition: (
    tilesetId: string,
    index: number,
    definition: TileDefinition,
  ) => void;
  setTileCornerTerrain: (
    tilesetId: string,
    index: number,
    corner: number,
    terrainId: string | null,
  ) => Promise<void>;
}

export const createTilesetSlice: StateCreator<any, any, [], TilesetSlice> = (set, get) => ({
  addTileset: async (tileset) => {
    useSaveStore.getState().setStatus('saving');
    await fileSystem.saveJson(
      'tilesets',
      `${tileset.id}.tileset.json`,
      tileset,
    );
    useSaveStore.getState().setStatus('saved');
    setTimeout(() => {
      if (useSaveStore.getState().status === 'saved')
        useSaveStore.getState().setStatus('idle');
    }, 2000);

    set((state: any) => {
      state.tilesets.set(tileset.id, castDraft(tileset));
      if (!state.activeTilesetId) state.activeTilesetId = tileset.id;
    });

    // Load sprite
    try {
      const blob = await fileSystem.loadAsset(tileset.spriteSheet);
      await get().loadSprite(tileset.spriteSheet, blob);
    } catch (e) {
      console.warn('Failed to load sprite for new tileset:', e);
    }
  },

  updateTileset: async (id, updates) => {
    let updatedTileset: Tileset | undefined;

    set((state: any) => {
      const ts = state.tilesets.get(id);
      if (ts) {
        Object.assign(ts, updates);
        updatedTileset = JSON.parse(JSON.stringify(ts)); // Clone for safety
      }
    });

    if (updatedTileset) {
      useSaveStore.getState().setStatus('saving');
      await fileSystem.saveJson(
        'tilesets',
        `${id}.tileset.json`,
        updatedTileset,
      );
      useSaveStore.getState().setStatus('saved');
      setTimeout(() => {
        if (useSaveStore.getState().status === 'saved')
          useSaveStore.getState().setStatus('idle');
      }, 2000);
    }
  },

  deleteTileset: async (id) => {
    // Revoke the sprite object URL before removing the tileset
    const tileset = get().tilesets.get(id) as Tileset | undefined;
    if (tileset) {
      const spriteUrl = spriteObjectUrls.get(tileset.spriteSheet);
      if (spriteUrl) {
        URL.revokeObjectURL(spriteUrl);
        spriteObjectUrls.delete(tileset.spriteSheet);
      }
    }

    set((state: any) => {
      state.tilesets.delete(id);
      if (state.activeTilesetId === id) {
        state.activeTilesetId = null;
        state.selectedTileIndex = null;
      }
    });

    useSaveStore.getState().setStatus('saving');
    await fileSystem.deleteJson('tilesets', `${id}.tileset.json`);
    useSaveStore.getState().setStatus('saved');
    setTimeout(() => {
      if (useSaveStore.getState().status === 'saved')
        useSaveStore.getState().setStatus('idle');
    }, 2000);
  },

  updateTileDefinition: (tilesetId, index, definition) =>
    set((state: any) => {
      const ts = state.tilesets.get(tilesetId);
      if (ts) {
        ts.tiles[index] = castDraft(definition);
      }
    }),

  setTileCornerTerrain: async (tilesetId, index, corner, terrainId) => {
    let updatedTileset: Tileset | undefined;

    set((state: any) => {
      const ts = state.tilesets.get(tilesetId);
      if (!ts) return;
      const tile = ts.tiles[index] || ({} as TileDefinition);
      if (!tile.terrainCorners)
        tile.terrainCorners = [null, null, null, null];
      tile.terrainCorners[corner] = terrainId;

      // If terrainId is null, clear the terrain information for the corner
      if (terrainId === null) {
        const updatedCorners = [...tile.terrainCorners];
        updatedCorners[corner] = null;
        // Check if all corners are null, and if so, remove the terrainCorners property
        if (updatedCorners.every((corner) => corner === null)) {
          delete tile.terrainCorners;
        } else {
          tile.terrainCorners = updatedCorners;
        }
      }

      ts.tiles[index] = castDraft(tile);
      updatedTileset = JSON.parse(JSON.stringify(ts));
    });

    if (updatedTileset) {
      useSaveStore.getState().setStatus('saving');
      await fileSystem.saveJson(
        'tilesets',
        `${tilesetId}.tileset.json`,
        updatedTileset,
      );
      useSaveStore.getState().setStatus('saved');
      setTimeout(() => {
        if (useSaveStore.getState().status === 'saved')
          useSaveStore.getState().setStatus('idle');
      }, 2000);
    }
  },
});
