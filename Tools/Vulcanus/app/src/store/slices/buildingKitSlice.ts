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
import type { BuildingKit } from '../../types/building';
import { fileSystem } from '../../lib/fileSystem';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface BuildingKitSlice {
  buildingKits: BuildingKit[];
  /** The last saved version of each kit, to tell unsaved edits apart. */
  savedBuildingKits: Record<string, BuildingKit>;
  buildingKitPast: Record<string, BuildingKit[]>;
  buildingKitFuture: Record<string, BuildingKit[]>;

  addBuildingKit: (buildingKit: BuildingKit) => Promise<void>;
  updateBuildingKit: (id: string, updates: Partial<BuildingKit>) => void;
  deleteBuildingKit: (id: string) => Promise<void>;
  saveBuildingKit: (id: string) => Promise<void>;
  discardBuildingKit: (id: string) => void;
  undoBuildingKit: (id: string) => void;
  redoBuildingKit: (id: string) => void;
  resetBuildingKits: () => void;
}

/** What stops a kit from being written. The pieces themselves are checked when the sheet is read. */
export function validateBuildingKit(kit: BuildingKit): string[] {
  const errors: string[] = [];
  if (!kit.name.trim()) errors.push('The kit needs a name.');
  if (!kit.source.trim()) errors.push('The kit needs a base sheet.');
  for (const [variation, path] of Object.entries(kit.variations ?? {}))
    if (!path.trim()) errors.push(`Variation ${variation} needs a sheet.`);
  return errors;
}

const HISTORY_LIMIT = 50;
// Quick consecutive edits, such as typing a name, are one undo step.
const HISTORY_MERGE_MS = 800;
const lastEditAt = new Map<string, number>();

const same = (a: BuildingKit | undefined, b: BuildingKit | undefined) =>
  JSON.stringify(a) === JSON.stringify(b);

const saveUnitOf = (id: string) => `building-kit:${id}`;

const write = (buildingKit: BuildingKit) =>
  fileSystem.saveJson(
    resourceRegistry['building-kit'].folder,
    resourceFileKey('building-kit', buildingKit.id),
    { $schema: resourceSchemaPath('building-kit'), ...buildingKit },
  );

export const createBuildingKitSlice: ImmerStateCreator<BuildingKitSlice> = (set, get) => {
  const find = (id: string) => get().buildingKits.find((entry) => entry.id === id);

  // Dirty means different from the saved file, so undoing back to it clears the mark.
  const syncDirty = (id: string) => {
    const unit = saveUnitOf(id);
    if (same(find(id), get().savedBuildingKits[id])) {
      cancelPendingSaveUnit(unit);
      useSaveStore.getState().clearUnit(unit);
      return;
    }
    const projectPath = get().projectPath;
    scheduleSaveUnit(unit, async () => {
      if (get().projectPath === projectPath) await get().saveBuildingKit(id);
    });
  };

  const replace = (id: string, buildingKit: BuildingKit | undefined) =>
    set((state) => {
      const index = state.buildingKits.findIndex((entry) => entry.id === id);
      if (!buildingKit) {
        if (index >= 0) state.buildingKits.splice(index, 1);
      } else if (index >= 0) state.buildingKits[index] = castDraft(buildingKit);
      else state.buildingKits.push(castDraft(buildingKit));
    });

  const history = (direction: 'undo' | 'redo', id: string) => {
    const from = direction === 'undo' ? 'buildingKitPast' : 'buildingKitFuture';
    const to = direction === 'undo' ? 'buildingKitFuture' : 'buildingKitPast';
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
    buildingKits: [],
    savedBuildingKits: {},
    buildingKitPast: {},
    buildingKitFuture: {},

    addBuildingKit: async (buildingKit) => {
      buildingKit = normalizeResourceDocument(buildingKit, 'building-kit', get().project?.idPrefix);
      assertUniqueResourceIds([...get().buildingKits, buildingKit]);
      replace(buildingKit.id, buildingKit);
      await write(buildingKit);
      set((state) => {
        state.savedBuildingKits[buildingKit.id] = castDraft(buildingKit);
      });
    },

    updateBuildingKit: (id, updates) => {
      const before = find(id);
      if (!before) throw new Error(`Unknown kit ${id}.`);
      const merged = { ...before, ...updates, id: before.id };
      if (same(before, merged)) return;
      const now = Date.now();
      const merging =
        now - (lastEditAt.get(id) ?? 0) < HISTORY_MERGE_MS && get().buildingKitPast[id]?.length;
      lastEditAt.set(id, now);
      set((state) => {
        if (!merging) {
          const past = (state.buildingKitPast[id] ??= []);
          past.push(castDraft(before));
          if (past.length > HISTORY_LIMIT) past.shift();
        }
        state.buildingKitFuture[id] = [];
      });
      replace(id, merged);
      syncDirty(id);
    },

    deleteBuildingKit: async (id) => {
      cancelPendingSaveUnit(saveUnitOf(id));
      useSaveStore.getState().clearUnit(saveUnitOf(id));
      set((state) => {
        state.buildingKits = state.buildingKits.filter((entry) => entry.id !== id);
        delete state.savedBuildingKits[id];
        delete state.buildingKitPast[id];
        delete state.buildingKitFuture[id];
      });
      await fileSystem.deleteJson(
        resourceRegistry['building-kit'].folder,
        resourceFileKey('building-kit', id),
      );
    },

    saveBuildingKit: async (id) => {
      const unit = saveUnitOf(id);
      const buildingKit = find(id);
      cancelPendingSaveUnit(unit);
      if (!buildingKit) return;
      const saves = useSaveStore.getState();
      const errors = validateBuildingKit(buildingKit);
      if (errors.length) {
        saves.markError(unit, errors.join(' '));
        return;
      }
      saves.markSaving(unit);
      try {
        await write(buildingKit);
        set((state) => {
          state.savedBuildingKits[id] = castDraft(buildingKit);
        });
        if (same(find(id), buildingKit)) saves.markSaved(unit);
        else syncDirty(id);
      } catch (error) {
        saves.markError(unit, error instanceof Error ? error.message : 'Unknown error');
      }
    },

    discardBuildingKit: (id) => {
      cancelPendingSaveUnit(saveUnitOf(id));
      const saved = get().savedBuildingKits[id];
      if (saved) replace(id, saved);
      set((state) => {
        delete state.buildingKitPast[id];
        delete state.buildingKitFuture[id];
      });
      lastEditAt.delete(id);
      useSaveStore.getState().clearUnit(saveUnitOf(id));
    },

    undoBuildingKit: (id) => history('undo', id),
    redoBuildingKit: (id) => history('redo', id),

    resetBuildingKits: () => {
      for (const id of new Set([
        ...get().buildingKits.map((entry) => entry.id),
        ...Object.keys(get().savedBuildingKits),
      ])) {
        cancelPendingSaveUnit(saveUnitOf(id));
        useSaveStore.getState().clearUnit(saveUnitOf(id));
      }
      lastEditAt.clear();
      set({
        buildingKits: [],
        savedBuildingKits: {},
        buildingKitPast: {},
        buildingKitFuture: {},
      });
    },
  };
};
