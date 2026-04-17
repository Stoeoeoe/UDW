import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import { Item } from '../../types/schema';
import { fileSystem } from '../../lib/fileSystem';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface ItemSlice {
  items: Item[];
  selectedItemId: string | null;

  setSelectedItem: (id: string | null) => void;
  addItem: (item: Item) => Promise<void>;
  updateItem: (id: string, updates: Partial<Item>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}

export const createItemSlice: ImmerStateCreator<ItemSlice> = (set, get) => ({
  items: [],
  selectedItemId: null,

  setSelectedItem: (id) =>
    set((state) => {
      state.selectedItemId = id;
    }),

  addItem: async (item) => {
    set((state) => {
      state.items.push(castDraft(item));
    });
    await fileSystem.saveJson('items', `${item.id}.vitm`, {
      $schema: '../../schemas/item.schema.json',
      ...item,
    });
  },

  updateItem: async (id, updates) => {
    let updatedItem: Item | null = null;
    set((state) => {
      const idx = state.items.findIndex((entry) => entry.id === id);
      if (idx < 0) return;
      const merged = { ...state.items[idx], ...updates } as Item;
      updatedItem = merged;
      state.items[idx] = castDraft(merged);
    });
    const item = updatedItem ?? get().items.find((entry) => entry.id === id);
    if (item) {
      await fileSystem.saveJson('items', `${item.id}.vitm`, {
        $schema: '../../schemas/item.schema.json',
        ...item,
      });
    }
  },

  deleteItem: async (id) => {
    set((state) => {
      state.items = state.items.filter((i) => i.id !== id);
      if (state.selectedItemId === id) state.selectedItemId = null;
    });
    await fileSystem.deleteJson('items', `${id}.vitm`);
  },
});
