import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import { MapTrigger } from '../../types/schema';
import { saveMapDebounced } from '../../lib/saveManager';
import { ensureNavigationLayer } from '../storeHelpers';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

function ensureTriggerCollection(map: {
  spatialPrimitives?: { triggers?: MapTrigger[] };
}): MapTrigger[] {
  if (!map.spatialPrimitives) (map as { spatialPrimitives?: unknown }).spatialPrimitives = {};
  if (!map.spatialPrimitives!.triggers) map.spatialPrimitives!.triggers = [];
  return map.spatialPrimitives!.triggers!;
}

export interface TriggerSlice {
  selectedTriggerId: string | null;

  addTrigger: (trigger: MapTrigger) => void;
  updateTrigger: (id: string, updates: Partial<MapTrigger>, skipSave?: boolean) => void;
  removeTrigger: (id: string) => void;
  selectTrigger: (id: string | null) => void;
}

export const createTriggerSlice: ImmerStateCreator<TriggerSlice> = (set, get) => ({
  selectedTriggerId: null,

  addTrigger: (trigger) => {
    set((state) => {
      if (!state.currentMap) return;
      const withLayer = ensureNavigationLayer(state.currentMap);
      state.currentMap = castDraft(withLayer);
      const triggers = ensureTriggerCollection(state.currentMap);
      triggers.push(castDraft(trigger));
      state.selectedTriggerId = trigger.id;
      state.selectedLinkId = null;
      state.selectedAnchorId = null;
    });
    const map = get().currentMap;
    if (map) saveMapDebounced(map);
  },

  updateTrigger: (id, updates, skipSave = false) => {
    set((state) => {
      if (!state.currentMap?.spatialPrimitives?.triggers) return;
      const trigger = state.currentMap.spatialPrimitives.triggers.find((t) => t.id === id);
      if (!trigger) return;
      Object.assign(trigger, updates);
    });
    if (!skipSave) {
      const map = get().currentMap;
      if (map) saveMapDebounced(map);
    }
  },

  removeTrigger: (id) => {
    set((state) => {
      if (!state.currentMap?.spatialPrimitives?.triggers) return;
      state.currentMap.spatialPrimitives.triggers =
        state.currentMap.spatialPrimitives.triggers.filter((t) => t.id !== id);
      if (state.currentMap.locationLinks) {
        state.currentMap.locationLinks = state.currentMap.locationLinks.filter(
          (l) => l.triggerId !== id,
        );
      }
      if (state.selectedTriggerId === id) state.selectedTriggerId = null;
    });
    const map = get().currentMap;
    if (map) saveMapDebounced(map);
  },

  selectTrigger: (id) => {
    set((state) => {
      state.selectedTriggerId = id;
      if (id !== null) {
        state.selectedLinkId = null;
        state.selectedAnchorId = null;
      }
    });
  },
});
