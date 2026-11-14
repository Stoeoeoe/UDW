import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import { ItemClass } from '../../types/schema';
import { persistProject } from '../storeHelpers';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface ItemClassSlice {
  itemClasses: ItemClass[];

  addItemClass: (itemClass: ItemClass) => Promise<void>;
  updateItemClass: (id: string, updates: Partial<ItemClass>) => Promise<void>;
  deleteItemClass: (id: string) => Promise<void>;
}

export const createItemClassSlice: ImmerStateCreator<ItemClassSlice> = (set, get) => ({
  itemClasses: [],

  addItemClass: async (itemClass) => {
    set((state) => {
      state.itemClasses.push(castDraft(itemClass));
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = { ...proj, itemClasses: get().itemClasses };
      await persistProject(projectToSave);
      set((state) => {
        state.project = castDraft(projectToSave);
      });
    }
  },

  updateItemClass: async (id, updates) => {
    set((state) => {
      const cls = state.itemClasses.find((c) => c.id === id);
      if (cls) Object.assign(cls, updates);
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = { ...proj, itemClasses: get().itemClasses };
      await persistProject(projectToSave);
      set((state) => {
        state.project = castDraft(projectToSave);
      });
    }
  },

  deleteItemClass: async (id) => {
    set((state) => {
      state.itemClasses = state.itemClasses.filter((c) => c.id !== id);
    });
    const proj = get().project;
    if (proj) {
      const projectToSave = { ...proj, itemClasses: get().itemClasses };
      await persistProject(projectToSave);
      set((state) => {
        state.project = castDraft(projectToSave);
      });
    }
  },
});
