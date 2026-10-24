import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import { Layer, Variation } from '../../types/schema';
import { syncToolStateForSelectedLayer, withHistorySuppressed } from '../storeHelpers';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface LayerSlice {
  selectedLayerId: string | null;

  addLayer: (layer: Layer) => void;
  removeLayer: (layerId: string) => void;
  updateLayer: (layerId: string, updates: Partial<Layer>) => void;
  reorderLayer: (layerId: string, newZOrder: number) => void;
  toggleLayerVisibility: (layerId: string) => void;
  selectLayer: (layerId: string) => void;

  setActiveVariation: (variationId: string | null) => void;
  addVariation: (variation: Variation) => void;
  updateVariation: (id: string, updates: Partial<Variation>) => void;
  removeVariation: (id: string) => void;
}

export const createLayerSlice: ImmerStateCreator<LayerSlice> = (set) => ({
  selectedLayerId: null,

  addLayer: (layer) =>
    set((state) => {
      if (state.currentMap) state.currentMap.layers.push(castDraft(layer));
    }),

  removeLayer: (layerId) =>
    set((state) => {
      if (state.currentMap) {
        state.currentMap.layers = state.currentMap.layers.filter((l) => l.id !== layerId);
      }
    }),

  updateLayer: (layerId, updates) =>
    set((state) => {
      const layer = state.currentMap?.layers.find((l) => l.id === layerId);
      if (layer) {
        const kindChanged = updates.kind !== undefined && updates.kind !== layer.kind;
        Object.assign(layer, updates);
        if (kindChanged && state.selectedLayerId === layerId) {
          syncToolStateForSelectedLayer(state, { forceDefault: true });
        }
        if (updates.zOrder !== undefined && state.currentMap) {
          state.currentMap.layers.sort((a, b) => a.zOrder - b.zOrder);
        }
      }
    }),

  reorderLayer: (layerId, newZOrder) =>
    set((state) => {
      if (!state.currentMap) return;
      const layer = state.currentMap.layers.find((l) => l.id === layerId);
      if (layer) {
        layer.zOrder = newZOrder;
        state.currentMap.layers.sort((a, b) => a.zOrder - b.zOrder);
      }
    }),

  toggleLayerVisibility: (layerId) =>
    set((state) => {
      const layer = state.currentMap?.layers.find((l) => l.id === layerId);
      if (layer) layer.visible = !layer.visible;
    }),

  selectLayer: (layerId) =>
    set((state) => {
      const prevKind = state.currentMap?.layers.find((l) => l.id === state.selectedLayerId)?.kind;
      const nextKind = state.currentMap?.layers.find((l) => l.id === layerId)?.kind;
      state.selectedLayerId = layerId;
      syncToolStateForSelectedLayer(state, { forceDefault: prevKind !== nextKind });
    }),

  setActiveVariation: (variationId) =>
    withHistorySuppressed(
      () =>
        set((state) => {
          state.activeVariationId = variationId;
        }),
      { clearHistory: true },
    ),

  addVariation: (variation) =>
    set((state) => {
      if (!state.currentMap) return;
      if (!state.currentMap.variations) state.currentMap.variations = [];
      state.currentMap.variations.push(castDraft(variation));
    }),

  updateVariation: (id, updates) =>
    set((state) => {
      const variation = state.currentMap?.variations?.find((v) => v.id === id);
      if (variation) Object.assign(variation, updates);
    }),

  removeVariation: (id) =>
    set((state) => {
      if (!state.currentMap) return;
      state.currentMap.variations = state.currentMap.variations?.filter((v) => v.id !== id);
      if (state.activeVariationId === id) state.activeVariationId = null;
    }),
});
