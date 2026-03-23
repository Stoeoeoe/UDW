import { StateCreator } from 'zustand';
import { castDraft } from 'immer';
import type { EntityInstance, EntityType } from '../../types/schema';
import { persistProject } from '../storeHelpers';

export interface EntitySlice {
  placeEntity: (entity: EntityInstance) => void;
  removeEntity: (entityId: string) => void;
  updateEntityProperties: (
    entityId: string,
    properties: Record<string, any>,
  ) => void;
  addEntityType: (entityType: EntityType) => Promise<void>;
  updateEntityType: (id: string, updates: Partial<EntityType>) => Promise<void>;
  deleteEntityType: (id: string) => Promise<void>;
}

export const createEntitySlice: StateCreator<any, any, [], EntitySlice> = (set, get) => ({
  placeEntity: (entity) =>
    set((state: any) => {
      if (!state.currentMap) return;

      // If variation active, add to overrides
      if (state.activeVariationId) {
        const variation = state.currentMap.variations?.find(
          (v: any) => v.id === state.activeVariationId,
        );
        if (variation) {
          if (!variation.entityOverrides) variation.entityOverrides = [];
          variation.entityOverrides.push({
            action: 'add',
            entity: castDraft(entity),
          });
          return;
        }
      }

      // Otherwise add to base
      state.currentMap.entities.push(castDraft(entity));
    }),

  removeEntity: (entityId) =>
    set((state: any) => {
      if (!state.currentMap) return;

      if (state.activeVariationId) {
        const variation = state.currentMap.variations?.find(
          (v: any) => v.id === state.activeVariationId,
        );
        if (variation) {
          if (!variation.entityOverrides) variation.entityOverrides = [];

          // If it was an "add" override, just remove it
          const existingAddIdx = variation.entityOverrides.findIndex(
            (o: any) => o.action === 'add' && o.entity?.id === entityId,
          );
          if (existingAddIdx !== -1) {
            variation.entityOverrides.splice(existingAddIdx, 1);
            return;
          }

          // Otherwise add a "remove" override for the base entity
          variation.entityOverrides.push({
            action: 'remove',
            entityId,
          });
          return;
        }
      }

      state.currentMap.entities = state.currentMap.entities.filter(
        (e: EntityInstance) => e.id !== entityId,
      );
    }),

  updateEntityProperties: (entityId, properties) =>
    set((state: any) => {
      if (!state.currentMap) return;

      if (state.activeVariationId) {
        const variation = state.currentMap.variations?.find(
          (v: any) => v.id === state.activeVariationId,
        );
        if (variation) {
          if (!variation.entityOverrides) variation.entityOverrides = [];

          // Check if we already have an override for this entity in this variation
          const existingOverride = variation.entityOverrides.find(
            (o: any) =>
              (o.action === 'add' && o.entity?.id === entityId) ||
              (o.action === 'modify' && o.entityId === entityId),
          );

          if (existingOverride) {
            if (
              existingOverride.action === 'add' &&
              existingOverride.entity
            ) {
              existingOverride.entity.properties = {
                ...existingOverride.entity.properties,
                ...properties,
              };
            } else if (existingOverride.action === 'modify') {
              if (!existingOverride.entity)
                existingOverride.entity = { properties: {} } as any;
              if (existingOverride.entity) {
                existingOverride.entity.properties = {
                  ...existingOverride.entity.properties,
                  ...properties,
                };
              }
            }
          } else {
            // Create a new "modify" override
            variation.entityOverrides.push({
              action: 'modify',
              entityId,
              entity: { properties } as any, // Sparse entity for properties override
            });
          }
          return;
        }
      }

      const entity = state.currentMap.entities.find(
        (e: EntityInstance) => e.id === entityId,
      );
      if (entity) {
        entity.properties = { ...entity.properties, ...properties };
      }
    }),

  // Entity type CRUD actions
  addEntityType: async (entityType) => {
    set((state: any) => {
      state.entityTypes.push(castDraft(entityType));
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = {
        ...proj,
        entityTypes: get().entityTypes,
      };
      await persistProject(projectToSave);
      set((state: any) => {
        state.project = castDraft(projectToSave);
      });
    }
  },

  updateEntityType: async (id, updates) => {
    set((state: any) => {
      const et = state.entityTypes.find((e: EntityType) => e.id === id);
      if (et) Object.assign(et, updates);
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = {
        ...proj,
        entityTypes: get().entityTypes,
      };
      await persistProject(projectToSave);
      set((state: any) => {
        state.project = castDraft(projectToSave);
      });
    }
  },

  deleteEntityType: async (id) => {
    set((state: any) => {
      state.entityTypes = state.entityTypes.filter((e: EntityType) => e.id !== id);
      if (state.selectedEntityTypeId === id)
        state.selectedEntityTypeId = null;
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = {
        ...proj,
        entityTypes: get().entityTypes,
      };
      await persistProject(projectToSave);
      set((state: any) => {
        state.project = castDraft(projectToSave);
      });
    }
  },
});
