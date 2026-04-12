import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import { EntityType, PropertyDefinition } from '../../types/schema';
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

  addEntityType: (entityType: EntityType) => Promise<void>;
  updateEntityType: (id: string, updates: Partial<EntityType>) => Promise<void>;
  deleteEntityType: (id: string) => Promise<void>;
  setTileMetadataDefinitions: (definitions: PropertyDefinition[]) => Promise<void>;
}

export const createEntityTypeSlice: ImmerStateCreator<EntityTypeSlice> = (set, get) => ({
  entityTypes: [],
  tileMetadataDefinitions: [],

  addEntityType: async (entityType) => {
    set((state) => {
      state.entityTypes.push(castDraft(entityType));
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = { ...proj, entityTypes: get().entityTypes };
      await persistProject(projectToSave);
      set((state) => {
        state.project = castDraft(projectToSave);
      });
    }
  },

  updateEntityType: async (id, updates) => {
    set((state) => {
      const et = state.entityTypes.find((e) => e.id === id);
      if (et) Object.assign(et, updates);
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = { ...proj, entityTypes: get().entityTypes };
      await persistProject(projectToSave);
      set((state) => {
        state.project = castDraft(projectToSave);
      });
    }
  },

  deleteEntityType: async (id) => {
    set((state) => {
      state.entityTypes = state.entityTypes.filter((e) => e.id !== id);
      if (state.selectedEntityTypeId === id) state.selectedEntityTypeId = null;
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = { ...proj, entityTypes: get().entityTypes };
      await persistProject(projectToSave);
      set((state) => {
        state.project = castDraft(projectToSave);
      });
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
});
