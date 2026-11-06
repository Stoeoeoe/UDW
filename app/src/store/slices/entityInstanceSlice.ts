import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import { EntityInstance, PropertyValues } from '../../types/schema';
import { applyEntityPatch } from '../storeHelpers';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface EntityInstanceSlice {
  selectedEntityId: string | null;
  selectedEntityIds: Set<string>;

  placeEntity: (entity: EntityInstance) => void;
  removeEntity: (entityId: string) => void;
  moveEntity: (entityId: string, position: [number, number]) => void;
  updateEntityLabel: (entityId: string, label: string | undefined) => void;
  /** Changes an entity's ID. Returns false when the ID is blank, taken, or a variation is active. */
  renameEntity: (entityId: string, newId: string) => boolean;
  updateEntityProperties: (entityId: string, properties: PropertyValues) => void;
  selectEntity: (id: string | null) => void;
  setSelectedEntityType: (id: string | null) => void;
}

export const createEntityInstanceSlice: ImmerStateCreator<EntityInstanceSlice> = (set, get) => ({
  selectedEntityId: null,
  selectedEntityIds: new Set(),

  placeEntity: (entity) =>
    set((state) => {
      if (!state.currentMap) return;

      const selectedLayer = state.currentMap.layers.find((l) => l.id === state.selectedLayerId);
      if (selectedLayer && selectedLayer.kind === 'entity') {
        const toAdd: EntityInstance = { ...entity, layerId: selectedLayer.id };

        if (state.activeVariationId) {
          const variation = state.currentMap.variations?.find(
            (v) => v.id === state.activeVariationId,
          );
          if (variation) {
            if (!variation.entityOverrides) variation.entityOverrides = [];
            variation.entityOverrides.push({ action: 'add', entity: castDraft(toAdd) });
            return;
          }
        }

        if (!selectedLayer.entities) selectedLayer.entities = [];
        selectedLayer.entities.push(castDraft(toAdd));
        return;
      }

      if (state.activeVariationId) {
        const variation = state.currentMap.variations?.find(
          (v) => v.id === state.activeVariationId,
        );
        if (variation) {
          if (!variation.entityOverrides) variation.entityOverrides = [];
          variation.entityOverrides.push({ action: 'add', entity: castDraft(entity) });
          return;
        }
      }

      state.currentMap.entities.push(castDraft(entity));
    }),

  removeEntity: (entityId) =>
    set((state) => {
      if (!state.currentMap) return;

      if (state.activeVariationId) {
        const variation = state.currentMap.variations?.find(
          (v) => v.id === state.activeVariationId,
        );
        if (variation) {
          if (!variation.entityOverrides) variation.entityOverrides = [];

          const existingAddIdx = variation.entityOverrides.findIndex(
            (o) => o.action === 'add' && o.entity?.id === entityId,
          );
          if (existingAddIdx !== -1) {
            variation.entityOverrides.splice(existingAddIdx, 1);
            return;
          }

          variation.entityOverrides.push({ action: 'remove', entityId });
          return;
        }
      }

      state.currentMap.entities = state.currentMap.entities.filter((e) => e.id !== entityId);
      for (const layer of state.currentMap.layers) {
        if (layer.kind === 'entity' && layer.entities) {
          layer.entities = layer.entities.filter((e) => e.id !== entityId);
        }
      }
    }),

  moveEntity: (entityId, position) =>
    set((state) => {
      if (!state.currentMap) return;
      applyEntityPatch(state.currentMap, state.activeVariationId, entityId, (e) => {
        e.position = position;
      });
    }),

  updateEntityLabel: (entityId, label) =>
    set((state) => {
      if (!state.currentMap) return;
      applyEntityPatch(state.currentMap, state.activeVariationId, entityId, (e) => {
        e.label = label;
      });
    }),

  renameEntity: (entityId, newId) => {
    const id = newId.trim();
    const { currentMap, activeVariationId } = get();
    if (!currentMap || activeVariationId || !id) return false;
    if (id === entityId) return true;

    const allEntities = [
      ...currentMap.entities,
      ...currentMap.layers.flatMap((l) => l.entities ?? []),
      ...(currentMap.variations ?? []).flatMap((v) =>
        (v.entityOverrides ?? []).flatMap((o) => (o.action === 'add' && o.entity ? [o.entity] : [])),
      ),
    ];
    if (allEntities.some((e) => e.id === id)) return false;

    set((state) => {
      const map = state.currentMap;
      if (!map) return;
      const rename = (e: { id?: string }) => {
        if (e.id === entityId) e.id = id;
      };
      map.entities.forEach(rename);
      map.layers.forEach((l) => l.entities?.forEach(rename));
      for (const variation of map.variations ?? []) {
        for (const o of variation.entityOverrides ?? []) {
          if (o.entityId === entityId) o.entityId = id;
          if (o.entity) rename(o.entity);
        }
      }
      if (state.selectedEntityId === entityId) state.selectedEntityId = id;
      if (state.selectedEntityIds.delete(entityId)) state.selectedEntityIds.add(id);
    });
    return true;
  },

  updateEntityProperties: (entityId, properties) =>
    set((state) => {
      if (!state.currentMap) return;
      applyEntityPatch(state.currentMap, state.activeVariationId, entityId, (e) => {
        e.properties = {
          ...((e.properties as PropertyValues) ?? {}),
          ...properties,
        } as PropertyValues;
      });
    }),

  selectEntity: (id) =>
    set((state) => {
      state.selectedEntityId = id;
      if (id !== null) {
        state.selectedLinkId = null;
        state.selectedAnchorId = null;
      }
    }),

  setSelectedEntityType: (id) =>
    set((state) => {
      state.selectedEntityTypeId = id;
      if (id) state.activeTool = 'entityPlace';
    }),
});
