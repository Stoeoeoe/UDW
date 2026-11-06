import {
  resourceFileKey,
  resourceRegistry,
  resourceSchemaPath,
  normalizeResourceDocument,
} from '../../lib/resourceRegistry';
import { assertUniqueResourceIds } from '../../lib/resourceIds';
import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import { EntityType, PropertyDefinition } from '../../types/schema';
import { fileSystem } from '../../lib/fileSystem';
import { useSaveStore } from '../../lib/saveManager';
import { persistProject } from '../storeHelpers';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface EntityTypeSlice {
  entityTypes: EntityType[];
  tileMetadataDefinitions: PropertyDefinition[];
  locationMetadataDefinitions: PropertyDefinition[];

  addEntityType: (entityType: EntityType) => Promise<void>;
  updateEntityType: (id: string, updates: Partial<EntityType>) => Promise<void>;
  deleteEntityType: (id: string) => Promise<void>;
  setTileMetadataDefinitions: (definitions: PropertyDefinition[]) => Promise<void>;
  setLocationMetadataDefinitions: (definitions: PropertyDefinition[]) => Promise<void>;
}

export const createEntityTypeSlice: ImmerStateCreator<EntityTypeSlice> = (set, get) => ({
  entityTypes: [],
  tileMetadataDefinitions: [],
  locationMetadataDefinitions: [],

  addEntityType: async (entityType) => {
    entityType = normalizeResourceDocument(entityType, 'entity', get().project?.idPrefix);
    assertUniqueResourceIds([...get().entityTypes, entityType]);
    set((state) => {
      state.entityTypes.push(castDraft(entityType));
    });
    const saveUnitId = `entity:${entityType.id}`;
    useSaveStore.getState().markSaving(saveUnitId);
    try {
      await fileSystem.saveJson(
        resourceRegistry.entity.folder,
        resourceFileKey('entity', entityType.id),
        {
          $schema: resourceSchemaPath('entity'),
          ...entityType,
        },
      );
      useSaveStore.getState().markSaved(saveUnitId);
    } catch (error) {
      useSaveStore
        .getState()
        .markError(saveUnitId, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  },

  updateEntityType: async (id, updates) => {
    set((state) => {
      const et = state.entityTypes.find((e) => e.id === id);
      if (!et) return;
      Object.assign(
        et,
        normalizeResourceDocument(
          { ...et, ...updates, id: et.id },
          'entity',
          get().project?.idPrefix,
        ),
      );
    });
    const entityType = get().entityTypes.find((entry) => entry.id === id);
    if (entityType) {
      const saveUnitId = `entity:${entityType.id}`;
      useSaveStore.getState().markSaving(saveUnitId);
      try {
        await fileSystem.saveJson(
          resourceRegistry.entity.folder,
          resourceFileKey('entity', entityType.id),
          {
            $schema: resourceSchemaPath('entity'),
            ...entityType,
          },
        );
        useSaveStore.getState().markSaved(saveUnitId);
      } catch (error) {
        useSaveStore
          .getState()
          .markError(saveUnitId, error instanceof Error ? error.message : 'Unknown error');
        throw error;
      }
    }
  },

  deleteEntityType: async (id) => {
    set((state) => {
      state.entityTypes = state.entityTypes.filter((e) => e.id !== id);
      if (state.selectedEntityTypeId === id) state.selectedEntityTypeId = null;
    });
    const saveUnitId = `entity:${id}`;
    useSaveStore.getState().markSaving(saveUnitId);
    try {
      await fileSystem.deleteJson(resourceRegistry.entity.folder, resourceFileKey('entity', id));
      useSaveStore.getState().clearUnit(saveUnitId);
    } catch (error) {
      useSaveStore
        .getState()
        .markError(saveUnitId, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  },

  setTileMetadataDefinitions: async (definitions) => {
    set((state) => {
      state.tileMetadataDefinitions = definitions.map((d) => castDraft(d));
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = {
        ...proj,
        tileMetadataDefinitions: get().tileMetadataDefinitions,
      };
      await persistProject(projectToSave);
      set((state) => {
        state.project = castDraft(projectToSave);
      });
    }
  },

  setLocationMetadataDefinitions: async (definitions) => {
    set((state) => {
      state.locationMetadataDefinitions = definitions.map((d) => castDraft(d));
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = {
        ...proj,
        locationMetadataDefinitions: get().locationMetadataDefinitions,
      };
      await persistProject(projectToSave);
      set((state) => {
        state.project = castDraft(projectToSave);
      });
    }
  },
});
