import { StateCreator } from 'zustand';
import { castDraft } from 'immer';
import type { Map } from '../../types/schema';
import { fileSystem } from '../../lib/fileSystem';
import {
  addMissingDefinitionLayers,
  createLayersFromDefinitions,
  createDefaultLayer,
} from '../storeHelpers';

export interface MapSlice {
  maps: Map[];
  currentMap: Map | null;
  currentMapPath: string | null;
  activeVariationId: string | null;

  setCurrentMap: (map: Map | null) => void;
  loadMap: (mapId: string) => void;
  createNewMap: (
    name: string,
    width: number,
    height: number,
    tilesetId: string,
  ) => Promise<void>;
  addMap: (map: Map) => void;
  deleteMap: (mapId: string) => Promise<void>;
}

export const createMapSlice: StateCreator<any, any, [], MapSlice> = (set, get) => ({
  maps: [],
  currentMap: null,
  currentMapPath: null,
  activeVariationId: null,

  setCurrentMap: (map) => {
    set((state: any) => {
      if (!map) {
        state.currentMap = null;
        return;
      }

      // Add missing layers from layer definitions
      const enrichedMap = addMissingDefinitionLayers(
        map,
        state.layerDefinitions,
      );

      state.currentMap = castDraft(enrichedMap);
      // When a map is loaded, switch to tile paint tool by default
      state.activeTool = 'stamp';
      if (
        enrichedMap &&
        state.mapCameras &&
        state.mapCameras[enrichedMap.id]
      ) {
        state.camera = { ...state.mapCameras[enrichedMap.id] };
      }
    });
  },

  loadMap: (mapId) => {
    set((state: any) => {
      const map = state.maps.find((m: Map) => m.id === mapId);
      if (!map) return;

      // Save camera for current map before switching
      if (state.currentMap) {
        state.mapCameras = state.mapCameras || {};
        state.mapCameras[state.currentMap.id] = { ...state.camera };
      }

      state.currentMap = castDraft(map);
      state.activeVariationId = null;
      state.activeTool = 'stamp';
      state.selectedEntityId = null;
      state.selectedEntityIds = new Set();

      // Restore camera for the loaded map
      if (state.mapCameras && state.mapCameras[mapId]) {
        state.camera = { ...state.mapCameras[mapId] };
      } else {
        state.camera = { x: 0, y: 0, zoom: 1.5 };
      }

      // Auto-select first layer
      if (map.layers.length > 0) {
        state.selectedLayerId = map.layers[0].id;
      } else {
        state.selectedLayerId = null;
      }
    });
  },

  createNewMap: async (name, width, height, tilesetId) => {
    const baseId = name.toLowerCase().replace(/\s+/g, '-');
    const existingIds = new Set((get().maps as Map[]).map((m) => m.id));
    let id = baseId;
    let suffix = 1;
    while (existingIds.has(id)) {
      id = `${baseId}-${suffix++}`;
    }

    // Get layer definitions from store to create default layers
    const layerDefs = get().layerDefinitions;

    // Create layers from definitions, or use a default ground layer
    const definedLayers = createLayersFromDefinitions(
      layerDefs,
      width,
      height,
    );
    const layers =
      definedLayers.length > 0
        ? definedLayers
        : [createDefaultLayer(width, height)];

    const newMap: Map = {
      version: 1,
      id,
      name,
      width,
      height,
      baseTilesetId: tilesetId,
      tilesetRefs: [tilesetId], // Start with base tileset
      layers,
      entities: [],
    };

    await fileSystem.saveJson('maps', `${id}.map.json`, newMap);

    set((state: any) => {
      state.maps.push(castDraft(newMap));
      state.currentMap = castDraft(newMap);
      state.activeVariationId = null;
      state.selectedLayerId = layers[0]?.id || null;
    });
  },

  addMap: (map: Map) => {
    set((state: any) => {
      // Add to the list if not already present, then make it current
      if (!state.maps.find((m: Map) => m.id === map.id)) {
        state.maps.push(castDraft(map));
      }
      state.currentMap = castDraft(map);
    });
  },

  deleteMap: async (mapId) => {
    const map = (get().maps as Map[]).find((m) => m.id === mapId);
    if (!map) return;

    // Delete from filesystem
    const filename = `${mapId}.map.json`;
    await fileSystem.deleteJson('maps', filename);

    set((state: any) => {
      // Remove from maps list
      state.maps = state.maps.filter((m: Map) => m.id !== mapId);

      // If we just deleted the current map, clear or switch
      if (state.currentMap?.id === mapId) {
        if (state.maps.length > 0) {
          state.currentMap = castDraft(state.maps[0]);
          state.activeVariationId = null;
          state.selectedLayerId = state.maps[0].layers[0]?.id || null;
        } else {
          state.currentMap = null;
          state.activeVariationId = null;
          state.selectedLayerId = null;
        }
      }
    });
  },
});
