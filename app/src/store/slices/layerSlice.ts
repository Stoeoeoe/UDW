import { StateCreator } from 'zustand';
import { castDraft } from 'immer';
import type { Layer, LayerDefinition } from '../../types/schema';
import { persistProject } from '../storeHelpers';

export interface LayerSlice {
  layerDefinitions: LayerDefinition[];
  selectedLayerDefinitionId: string | null;

  addLayer: (layer: Layer) => void;
  removeLayer: (layerId: string) => void;
  updateLayer: (layerId: string, updates: Partial<Layer>) => void;
  reorderLayer: (layerId: string, newZOrder: number) => void;
  toggleLayerVisibility: (layerId: string) => void;
  selectLayer: (layerId: string) => void;
  setSelectedLayerDefinition: (id: string | null) => void;
  addLayerDefinition: (definition: LayerDefinition) => Promise<void>;
  updateLayerDefinition: (
    id: string,
    updates: Partial<LayerDefinition>,
  ) => Promise<void>;
  deleteLayerDefinition: (id: string) => Promise<void>;
}

export const createLayerSlice: StateCreator<any, any, [], LayerSlice> = (set, get) => ({
  layerDefinitions: [],
  selectedLayerDefinitionId: null,

  addLayer: (layer) =>
    set((state: any) => {
      if (state.currentMap) {
        state.currentMap.layers.push(castDraft(layer));
      }
    }),

  removeLayer: (layerId) =>
    set((state: any) => {
      if (state.currentMap) {
        state.currentMap.layers = state.currentMap.layers.filter(
          (l: Layer) => l.id !== layerId,
        );
      }
    }),

  reorderLayer: (layerId, newZOrder) =>
    set((state: any) => {
      if (!state.currentMap) return;
      const layer = state.currentMap.layers.find((l: Layer) => l.id === layerId);
      if (layer) {
        layer.zOrder = newZOrder;
        // Stability: Sort layers by zOrder to keep indices predictable
        state.currentMap.layers.sort((a: Layer, b: Layer) => a.zOrder - b.zOrder);
      }
    }),

  toggleLayerVisibility: (layerId) =>
    set((state: any) => {
      const layer = state.currentMap?.layers.find((l: Layer) => l.id === layerId);
      if (layer) {
        layer.visible = !layer.visible;
      }
    }),

  selectLayer: (layerId) =>
    set((state: any) => {
      state.selectedLayerId = layerId;
    }),

  updateLayer: (layerId, updates) =>
    set((state: any) => {
      const layer = state.currentMap?.layers.find((l: Layer) => l.id === layerId);
      if (layer) {
        Object.assign(layer, updates);
        // Re-sort layers by zOrder if zOrder changed
        if (updates.zOrder !== undefined && state.currentMap) {
          state.currentMap.layers.sort((a: Layer, b: Layer) => a.zOrder - b.zOrder);
        }
      }
    }),

  setSelectedLayerDefinition: (id) =>
    set((state: any) => {
      state.selectedLayerDefinitionId = id;
    }),

  addLayerDefinition: async (definition) => {
    set((state: any) => {
      state.layerDefinitions.push(castDraft(definition));
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = {
        ...proj,
        layerDefinitions: get().layerDefinitions,
      };
      await persistProject(projectToSave);
      set((state: any) => {
        state.project = castDraft(projectToSave);
      });
    }
  },

  updateLayerDefinition: async (id, updates) => {
    set((state: any) => {
      const def = state.layerDefinitions.find((d: LayerDefinition) => d.id === id);
      if (def) Object.assign(def, updates);
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = {
        ...proj,
        layerDefinitions: get().layerDefinitions,
      };
      await persistProject(projectToSave);
      set((state: any) => {
        state.project = castDraft(projectToSave);
      });
    }
  },

  deleteLayerDefinition: async (id) => {
    set((state: any) => {
      state.layerDefinitions = state.layerDefinitions.filter(
        (d: LayerDefinition) => d.id !== id,
      );
      if (state.selectedLayerDefinitionId === id)
        state.selectedLayerDefinitionId = null;
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = {
        ...proj,
        layerDefinitions: get().layerDefinitions,
      };
      await persistProject(projectToSave);
      set((state: any) => {
        state.project = castDraft(projectToSave);
      });
    }
  },
});
