import { StateCreator } from 'zustand';
import { castDraft } from 'immer';
import type { EntityType } from '../../types/schema';
import type { TerrainType } from '../../types/editor';
import { persistProject } from '../storeHelpers';

export interface TerrainSlice {
  terrainTypes: TerrainType[];
  entityTypes: EntityType[];

  addTerrainType: (terrain: {
    id: string;
    displayName: string;
    color: string;
  }) => Promise<void>;
  updateTerrainType: (
    id: string,
    updates: Partial<{ displayName: string; color: string }>,
  ) => Promise<void>;
  deleteTerrainType: (id: string) => Promise<void>;
}

export const createTerrainSlice: StateCreator<any, any, [], TerrainSlice> = (set, get) => ({
  terrainTypes: [],
  entityTypes: [],

  addTerrainType: async (terrain) => {
    set((state: any) => {
      state.terrainTypes.push(castDraft(terrain));
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = {
        ...proj,
        terrainTypes: get().terrainTypes,
      };
      await persistProject(projectToSave);
      set((state: any) => {
        state.project = castDraft(projectToSave);
      });
    }
  },

  updateTerrainType: async (id, updates) => {
    set((state: any) => {
      const t = state.terrainTypes.find((tt: TerrainType) => tt.id === id);
      if (t) Object.assign(t, updates);
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = {
        ...proj,
        terrainTypes: get().terrainTypes,
      };
      await persistProject(projectToSave);
      set((state: any) => {
        state.project = castDraft(projectToSave);
      });
    }
  },

  deleteTerrainType: async (id) => {
    set((state: any) => {
      state.terrainTypes = state.terrainTypes.filter((t: TerrainType) => t.id !== id);
      if (state.selectedTerrainId === id) state.selectedTerrainId = null;
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = {
        ...proj,
        terrainTypes: get().terrainTypes,
      };
      await persistProject(projectToSave);
      set((state: any) => {
        state.project = castDraft(projectToSave);
      });
    }
  },
});
