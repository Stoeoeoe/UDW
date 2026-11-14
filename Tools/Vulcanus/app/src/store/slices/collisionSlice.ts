import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import { MapCollision } from '../../types/schema';
import { saveMapDebounced } from '../../lib/saveManager';
import { ensureCollisionLayer } from '../storeHelpers';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

function ensureCollisionCollection(map: {
  spatialPrimitives?: { collisions?: MapCollision[] };
}): MapCollision[] {
  if (!map.spatialPrimitives) (map as { spatialPrimitives?: unknown }).spatialPrimitives = {};
  if (!map.spatialPrimitives!.collisions) map.spatialPrimitives!.collisions = [];
  return map.spatialPrimitives!.collisions!;
}

export interface CollisionSlice {
  selectedCollisionId: string | null;

  addCollision: (collision: MapCollision) => void;
  updateCollision: (id: string, updates: Partial<MapCollision>, skipSave?: boolean) => void;
  removeCollision: (id: string) => void;
  selectCollision: (id: string | null) => void;
}

export const createCollisionSlice: ImmerStateCreator<CollisionSlice> = (set, get) => ({
  selectedCollisionId: null,

  addCollision: (collision) => {
    set((state) => {
      if (!state.currentMap) return;
      const withLayer = ensureCollisionLayer(state.currentMap);
      state.currentMap = castDraft(withLayer);
      const collisions = ensureCollisionCollection(state.currentMap);
      collisions.push(castDraft(collision));
      state.selectedCollisionId = collision.id;
      state.selectedTriggerId = null;
      state.selectedLinkId = null;
      state.selectedAnchorId = null;
    });
    const map = get().currentMap;
    if (map) saveMapDebounced(map);
  },

  updateCollision: (id, updates, skipSave = false) => {
    set((state) => {
      if (!state.currentMap?.spatialPrimitives?.collisions) return;
      const collision = state.currentMap.spatialPrimitives.collisions.find((c) => c.id === id);
      if (!collision) return;
      Object.assign(collision, updates);
    });
    if (!skipSave) {
      const map = get().currentMap;
      if (map) saveMapDebounced(map);
    }
  },

  removeCollision: (id) => {
    set((state) => {
      if (!state.currentMap?.spatialPrimitives?.collisions) return;
      state.currentMap.spatialPrimitives.collisions =
        state.currentMap.spatialPrimitives.collisions.filter((c) => c.id !== id);
      if (state.selectedCollisionId === id) state.selectedCollisionId = null;
    });
    const map = get().currentMap;
    if (map) saveMapDebounced(map);
  },

  selectCollision: (id) => {
    set((state) => {
      state.selectedCollisionId = id;
      if (id !== null) {
        state.selectedTriggerId = null;
        state.selectedLinkId = null;
        state.selectedAnchorId = null;
      }
    });
  },
});
