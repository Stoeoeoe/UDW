import {
  resourceFileKey,
  resourceRegistry,
  resourceSchemaPath,
  normalizeResourceDocument,
} from '../../lib/resourceRegistry';
import { assertUniqueResourceIds } from '../../lib/resourceIds';
import { cancelPendingSaveUnit, scheduleSaveUnit, useSaveStore } from '../../lib/saveManager';
import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import { Shop } from '../../types/schema';
import { fileSystem } from '../../lib/fileSystem';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface ShopSlice {
  shops: Shop[];
  selectedShopId: string | null;
  /** The last saved version of each shop, to tell unsaved edits apart. */
  savedShops: Record<string, Shop>;
  shopPast: Record<string, Shop[]>;
  shopFuture: Record<string, Shop[]>;

  setSelectedShop: (id: string | null) => void;
  addShop: (shop: Shop) => Promise<void>;
  updateShop: (id: string, updates: Partial<Shop>) => Promise<void>;
  deleteShop: (id: string) => Promise<void>;
  saveShop: (id: string) => Promise<void>;
  discardShop: (id: string) => void;
  undoShop: (id: string) => void;
  redoShop: (id: string) => void;
  resetShops: () => void;
}

/** What stops a shop from being written: Unity rejects blank or repeated items. */
export function validateShop(shop: Shop): string[] {
  const errors: string[] = [];
  if (!shop.name.trim()) errors.push('The shop needs a name.');
  const seen = new Set<string>();
  for (const offering of shop.offerings) {
    const itemId = offering.itemId.trim();
    if (!itemId) errors.push('Every item needs an item ID.');
    else if (seen.has(itemId)) errors.push(`${itemId} is offered more than once.`);
    seen.add(itemId);
    if (!Number.isFinite(offering.price) || offering.price < 0)
      errors.push(`${itemId || 'An item'} needs a price of at least 0.`);
  }
  return Array.from(new Set(errors));
}

const HISTORY_LIMIT = 50;
// Quick consecutive edits to one shop, such as typing a name, are one undo step.
const HISTORY_MERGE_MS = 800;
const lastEditAt = new Map<string, number>();

const sameShop = (a: Shop | undefined, b: Shop | undefined) =>
  JSON.stringify(a) === JSON.stringify(b);

const saveUnitOf = (id: string) => `shop:${id}`;

export const createShopSlice: ImmerStateCreator<ShopSlice> = (set, get) => {
  const find = (id: string) => get().shops.find((entry) => entry.id === id);

  // Dirty means different from the saved file, so undoing back to it clears the mark.
  const syncDirty = (id: string) => {
    const unit = saveUnitOf(id);
    if (sameShop(find(id), get().savedShops[id])) {
      cancelPendingSaveUnit(unit);
      useSaveStore.getState().clearUnit(unit);
      return;
    }
    const projectPath = get().projectPath;
    scheduleSaveUnit(unit, async () => {
      if (get().projectPath === projectPath) await get().saveShop(id);
    });
  };

  const replace = (id: string, shop: Shop | undefined) =>
    set((state) => {
      const index = state.shops.findIndex((entry) => entry.id === id);
      if (!shop) {
        if (index >= 0) state.shops.splice(index, 1);
      } else if (index >= 0) state.shops[index] = castDraft(shop);
      else state.shops.push(castDraft(shop));
    });

  const history = (direction: 'undo' | 'redo', id: string) => {
    const from = direction === 'undo' ? 'shopPast' : 'shopFuture';
    const to = direction === 'undo' ? 'shopFuture' : 'shopPast';
    const stack = get()[from][id];
    const previous = stack?.[stack.length - 1];
    const current = find(id);
    if (!previous || !current) return;
    set((state) => {
      state[from][id].pop();
      (state[to][id] ??= []).push(castDraft(current));
    });
    replace(id, previous);
    lastEditAt.delete(id);
    syncDirty(id);
  };

  return {
    shops: [],
    selectedShopId: null,
    savedShops: {},
    shopPast: {},
    shopFuture: {},

    setSelectedShop: (id) =>
      set((state) => {
        state.selectedShopId = id;
      }),

    addShop: async (shop) => {
      shop = normalizeResourceDocument(shop, 'shop', get().project?.idPrefix);
      assertUniqueResourceIds([...get().shops, shop]);
      replace(shop.id, shop);
      await fileSystem.saveJson(
        resourceRegistry.shop.folder,
        resourceFileKey('shop', shop.id),
        { $schema: resourceSchemaPath('shop'), ...shop },
      );
      set((state) => {
        state.savedShops[shop.id] = castDraft(shop);
      });
    },

    updateShop: async (id, updates) => {
      const before = find(id);
      if (!before) return;
      const merged = normalizeResourceDocument(
        { ...before, ...updates, id: before.id } as Shop,
        'shop',
        get().project?.idPrefix,
      );
      if (sameShop(before, merged)) return;
      const now = Date.now();
      const merging =
        now - (lastEditAt.get(id) ?? 0) < HISTORY_MERGE_MS && get().shopPast[id]?.length;
      lastEditAt.set(id, now);
      set((state) => {
        if (!merging) {
          const past = (state.shopPast[id] ??= []);
          past.push(castDraft(before));
          if (past.length > HISTORY_LIMIT) past.shift();
        }
        state.shopFuture[id] = [];
      });
      replace(id, merged);
      syncDirty(id);
    },

    deleteShop: async (id) => {
      cancelPendingSaveUnit(saveUnitOf(id));
      useSaveStore.getState().clearUnit(saveUnitOf(id));
      set((state) => {
        state.shops = state.shops.filter((entry) => entry.id !== id);
        delete state.savedShops[id];
        delete state.shopPast[id];
        delete state.shopFuture[id];
        if (state.selectedShopId === id) state.selectedShopId = null;
      });
      await fileSystem.deleteJson(
        resourceRegistry.shop.folder,
        resourceFileKey('shop', id),
      );
    },

    saveShop: async (id) => {
      const unit = saveUnitOf(id);
      const shop = find(id);
      cancelPendingSaveUnit(unit);
      if (!shop) return;
      const saves = useSaveStore.getState();
      const errors = validateShop(shop);
      if (errors.length) {
        saves.markError(unit, errors.join(' '));
        return;
      }
      saves.markSaving(unit);
      try {
        await fileSystem.saveJson(
          resourceRegistry.shop.folder,
          resourceFileKey('shop', id),
          { $schema: resourceSchemaPath('shop'), ...shop },
        );
        set((state) => {
          state.savedShops[id] = castDraft(shop);
        });
        if (sameShop(find(id), shop)) saves.markSaved(unit);
        else syncDirty(id);
      } catch (error) {
        saves.markError(unit, error instanceof Error ? error.message : 'Unknown error');
      }
    },

    discardShop: (id) => {
      cancelPendingSaveUnit(saveUnitOf(id));
      const saved = get().savedShops[id];
      if (saved) replace(id, saved);
      set((state) => {
        delete state.shopPast[id];
        delete state.shopFuture[id];
      });
      lastEditAt.delete(id);
      useSaveStore.getState().clearUnit(saveUnitOf(id));
    },

    undoShop: (id) => history('undo', id),
    redoShop: (id) => history('redo', id),

    resetShops: () => {
      for (const id of new Set([
        ...get().shops.map((entry) => entry.id),
        ...Object.keys(get().savedShops),
      ])) {
        cancelPendingSaveUnit(saveUnitOf(id));
        useSaveStore.getState().clearUnit(saveUnitOf(id));
      }
      lastEditAt.clear();
      set({
        shops: [],
        selectedShopId: null,
        savedShops: {},
        shopPast: {},
        shopFuture: {},
      });
    },
  };
};
