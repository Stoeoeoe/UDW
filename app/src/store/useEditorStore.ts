import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import { saveMapDebounced, useSaveStore } from '../lib/saveManager';

import { createProjectSlice, type ProjectSlice } from './slices/projectSlice';
import { createMapSlice, type MapSlice } from './slices/mapSlice';
import { createTilesetSlice, type TilesetSlice } from './slices/tilesetSlice';
import { createTileSlice, type TileSlice } from './slices/tileSlice';
import { createEntitySlice, type EntitySlice } from './slices/entitySlice';
import { createLayerSlice, type LayerSlice } from './slices/layerSlice';
import { createVariationSlice, type VariationSlice } from './slices/variationSlice';
import { createTerrainSlice, type TerrainSlice } from './slices/terrainSlice';
import { createUiSlice, type UiSlice } from './slices/uiSlice';

export type EditorStore =
  ProjectSlice &
  MapSlice &
  TilesetSlice &
  TileSlice &
  EntitySlice &
  LayerSlice &
  VariationSlice &
  TerrainSlice &
  UiSlice;

export const useEditorStore = create<EditorStore>()(
  subscribeWithSelector(
    immer((...a) => ({
      ...createProjectSlice(...a),
      ...createMapSlice(...a),
      ...createTilesetSlice(...a),
      ...createTileSlice(...a),
      ...createEntitySlice(...a),
      ...createLayerSlice(...a),
      ...createVariationSlice(...a),
      ...createTerrainSlice(...a),
      ...createUiSlice(...a),
    })),
  ),
);

// =============================================================================
// Auto-save subscription: Save currentMap whenever it changes
// =============================================================================

// Subscribe to currentMap changes and auto-save with debouncing.
// Immer produces a new object reference on every mutation, so reference
// inequality is sufficient to detect real changes — no JSON.stringify needed.
useEditorStore.subscribe(
  (state) => state.currentMap,
  (currentMap, prevMap) => {
    if (!currentMap) return;

    // Map switched (not a mutation) — skip save
    if (currentMap.id !== prevMap?.id) return;

    saveMapDebounced(currentMap);

    // Sync changes back to the maps list so browsing stays up-to-date
    useEditorStore.setState((state) => {
      const idx = state.maps.findIndex((m) => m.id === currentMap.id);
      if (idx !== -1) {
        state.maps[idx] = currentMap as any;
      }
    });
  },
  { fireImmediately: false },
);

// Subscribe to project settings changes and update save status
useEditorStore.subscribe(
  (state) => ({
    terrainTypes: state.terrainTypes,
    entityTypes: state.entityTypes,
    layerDefinitions: state.layerDefinitions,
  }),
  () => {
    // The individual actions already call persistProject,
    // but we update save status here for visual feedback
    useSaveStore.getState().setStatus('saved');
    setTimeout(() => {
      if (useSaveStore.getState().status === 'saved') {
        useSaveStore.getState().setStatus('idle');
      }
    }, 2000);
  },
  { equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
);
