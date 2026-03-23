import { StateCreator } from 'zustand';
import { castDraft } from 'immer';
import type { Variation } from '../../types/schema';

export interface VariationSlice {
  setActiveVariation: (variationId: string | null) => void;
  addVariation: (variation: Variation) => void;
  updateVariation: (id: string, updates: Partial<Variation>) => void;
  removeVariation: (id: string) => void;
}

export const createVariationSlice: StateCreator<any, any, [], VariationSlice> = (set) => ({
  setActiveVariation: (variationId) => {
    set((state: any) => {
      state.activeVariationId = variationId;
    });
  },

  addVariation: (variation) => {
    set((state: any) => {
      if (state.currentMap) {
        if (!state.currentMap.variations) state.currentMap.variations = [];
        state.currentMap.variations.push(castDraft(variation));
      }
    });
  },

  updateVariation: (id, updates) => {
    set((state: any) => {
      const variation = state.currentMap?.variations?.find(
        (v: Variation) => v.id === id,
      );
      if (variation) {
        Object.assign(variation, updates);
      }
    });
  },

  removeVariation: (id) => {
    set((state: any) => {
      if (state.currentMap) {
        state.currentMap.variations = state.currentMap.variations?.filter(
          (v: Variation) => v.id !== id,
        );
        if (state.activeVariationId === id) state.activeVariationId = null;
      }
    });
  },
});
