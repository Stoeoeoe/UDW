import { StateCreator } from 'zustand';
import { createBuildingInstanceId, placementRefusal } from '../../lib/buildings/mapPlacement';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

/** Buildings placed on the current map's building layers. Placement edits the base map only, like objects. */
export interface MapBuildingSlice {
  /** The building the Place tool puts down. */
  paletteBuildingId: string | null;
  selectedBuildingInstanceId: string | null;
  setPaletteBuilding: (buildingId: string | null) => void;
  selectBuildingInstance: (id: string | null) => void;
  /** Places the building and selects it; returns why it cannot be placed instead, if so. */
  placeBuilding: (layerId: string, buildingId: string, x: number, y: number) => string | null;
  moveBuilding: (layerId: string, instanceId: string, x: number, y: number) => void;
  removeBuilding: (layerId: string, instanceId: string) => void;
}

export const createMapBuildingSlice: ImmerStateCreator<MapBuildingSlice> = (set, get) => ({
  paletteBuildingId: null,
  selectedBuildingInstanceId: null,

  setPaletteBuilding: (buildingId) =>
    set((state) => {
      state.paletteBuildingId = buildingId;
    }),

  selectBuildingInstance: (id) =>
    set((state) => {
      state.selectedBuildingInstanceId = id;
    }),

  placeBuilding: (layerId, buildingId, x, y) => {
    const { currentMap, maps, buildings, activeVariationId } = get();
    const building = buildings.find((entry) => entry.id === buildingId)!;
    const layer = currentMap!.layers.find((entry) => entry.id === layerId)!;
    if (activeVariationId) return 'Buildings are placed on the base map, not in a variation.';
    if (layer.locked) return 'The layer is locked.';
    const refusal = placementRefusal(maps, currentMap!, building);
    if (refusal) return refusal;
    const id = createBuildingInstanceId();
    set((state) => {
      const target = state.currentMap!.layers.find((entry) => entry.id === layerId)!;
      (target.buildings ??= []).push({ id, buildingId, x, y });
      state.selectedBuildingInstanceId = id;
    });
    return null;
  },

  moveBuilding: (layerId, instanceId, x, y) =>
    set((state) => {
      const layer = state.currentMap!.layers.find((entry) => entry.id === layerId)!;
      const instance = layer.buildings!.find((entry) => entry.id === instanceId)!;
      if (layer.locked || state.activeVariationId || (instance.x === x && instance.y === y)) return;
      instance.x = x;
      instance.y = y;
    }),

  removeBuilding: (layerId, instanceId) =>
    set((state) => {
      const layer = state.currentMap!.layers.find((entry) => entry.id === layerId)!;
      if (layer.locked || state.activeVariationId) return;
      layer.buildings = layer.buildings!.filter((entry) => entry.id !== instanceId);
      if (state.selectedBuildingInstanceId === instanceId) state.selectedBuildingInstanceId = null;
    }),
});
