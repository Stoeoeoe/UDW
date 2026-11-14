import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import { LayerDefinition, Layer, EntityInstance } from '../../types/schema';
import {
  persistProject,
  addMissingDefinitionLayers,
  createEmptyGrid,
  createEmptyStringGrid,
} from '../storeHelpers';
import { saveMapDebounced } from '../../lib/saveManager';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface LayerDefinitionSlice {
  layerDefinitions: LayerDefinition[];
  selectedLayerDefinitionId: string | null;

  setSelectedLayerDefinition: (id: string | null) => void;
  addLayerDefinition: (definition: LayerDefinition) => Promise<void>;
  updateLayerDefinition: (id: string, updates: Partial<LayerDefinition>) => Promise<void>;
  deleteLayerDefinition: (id: string) => Promise<void>;
}

export const createLayerDefinitionSlice: ImmerStateCreator<LayerDefinitionSlice> = (set, get) => ({
  layerDefinitions: [],
  selectedLayerDefinitionId: null,

  setSelectedLayerDefinition: (id) =>
    set((state) => {
      state.selectedLayerDefinitionId = id;
    }),

  addLayerDefinition: async (definition) => {
    set((state) => {
      state.layerDefinitions.push(castDraft(definition));
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = { ...proj, layerDefinitions: get().layerDefinitions };
      await persistProject(projectToSave);
      set((state) => {
        state.project = castDraft(projectToSave);
        if (state.currentMap) {
          state.currentMap = castDraft(
            addMissingDefinitionLayers(state.currentMap, state.layerDefinitions),
          );
        }
      });
    }
  },

  updateLayerDefinition: async (id, updates) => {
    set((state) => {
      const def = state.layerDefinitions.find((d) => d.id === id);
      if (def) Object.assign(def, updates);
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = { ...proj, layerDefinitions: get().layerDefinitions };
      await persistProject(projectToSave);
      set((state) => {
        state.project = castDraft(projectToSave);

        const updatedDef = state.layerDefinitions.find((d) => d.id === id);
        if (updatedDef) {
          const applyDefToLayer = (layer: Layer, mapWidth: number, mapHeight: number) => {
            layer.name = updatedDef.name;
            layer.zOrder = updatedDef.zIndex;
            layer.kind =
              updatedDef.type === 'entity'
                ? 'entity'
                : updatedDef.type === 'terrain'
                  ? 'terrain'
                  : 'visual';
            if (updatedDef.icon) layer.icon = updatedDef.icon;

            if (updatedDef.type === 'entity') {
              if (!layer.entities) {
                delete layer.data;
                delete layer.terrainData;
                layer.entities = [] as EntityInstance[];
              }
            } else if (updatedDef.type === 'terrain') {
              if (!layer.data) layer.data = createEmptyGrid(mapWidth, mapHeight);
              if (!layer.terrainData)
                layer.terrainData = createEmptyStringGrid(mapWidth, mapHeight);
              if (layer.entities) delete layer.entities;
            } else {
              if (!layer.data) layer.data = createEmptyGrid(mapWidth, mapHeight);
              if (layer.terrainData) delete layer.terrainData;
              if (layer.entities) delete layer.entities;
            }
          };

          const modifiedMapIds = new Set<string>();

          for (const map of state.maps) {
            let changed = false;
            for (const layer of map.layers) {
              if (layer.definitionId === id) {
                applyDefToLayer(layer as Layer, map.width, map.height);
                changed = true;
              }
            }
            if (changed) {
              map.layers = map.layers.slice().sort((a, b) => a.zOrder - b.zOrder);
              modifiedMapIds.add(map.id);
            }
          }

          if (state.currentMap && modifiedMapIds.has(state.currentMap.id)) {
            const updated = state.maps.find((m) => m.id === state.currentMap!.id);
            if (updated) state.currentMap = castDraft(updated);
          }

          for (const mid of modifiedMapIds) {
            const m = state.maps.find((x) => x.id === mid);
            if (m) saveMapDebounced(m);
          }
        }
      });
    }
  },

  deleteLayerDefinition: async (id) => {
    set((state) => {
      state.layerDefinitions = state.layerDefinitions.filter((d) => d.id !== id);
      if (state.selectedLayerDefinitionId === id) state.selectedLayerDefinitionId = null;
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = { ...proj, layerDefinitions: get().layerDefinitions };
      await persistProject(projectToSave);
      set((state) => {
        state.project = castDraft(projectToSave);
      });
    }
  },
});
