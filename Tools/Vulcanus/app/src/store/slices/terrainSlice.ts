import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import { TerrainType } from '../../types/editor';
import { persistProject } from '../storeHelpers';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface TerrainSlice {
  terrainTypes: TerrainType[];

  addTerrainType: (terrain: TerrainType) => Promise<void>;
  updateTerrainType: (id: string, updates: Partial<TerrainType>) => Promise<void>;
  deleteTerrainType: (id: string) => Promise<void>;
}

export const createTerrainSlice: ImmerStateCreator<TerrainSlice> = (set, get) => ({
  terrainTypes: [],

  addTerrainType: async (terrain) => {
    set((state) => {
      state.terrainTypes.push(castDraft(terrain));
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = { ...proj, terrainTypes: get().terrainTypes };
      await persistProject(projectToSave);
      set((state) => {
        state.project = castDraft(projectToSave);
      });
    }
  },

  updateTerrainType: async (id, updates) => {
    set((state) => {
      const t = state.terrainTypes.find((tt) => tt.id === id);
      if (t) Object.assign(t, updates);
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = { ...proj, terrainTypes: get().terrainTypes };
      await persistProject(projectToSave);
      set((state) => {
        state.project = castDraft(projectToSave);
      });
    }
  },

  deleteTerrainType: async (id) => {
    set((state) => {
      state.terrainTypes = state.terrainTypes.filter((t) => t.id !== id);
      if (state.selectedTerrainId === id) state.selectedTerrainId = null;
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = { ...proj, terrainTypes: get().terrainTypes };
      await persistProject(projectToSave);
      set((state) => {
        state.project = castDraft(projectToSave);
      });
    }
  },
});
