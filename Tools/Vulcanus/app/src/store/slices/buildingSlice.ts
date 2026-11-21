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
import type { Building, BuildingKit } from '../../types/building';
import { planIssues, type PlanIssue } from '../../lib/buildings/validate';
import { useResolvedKitsStore, type ResolvedKitState } from '../useResolvedKitsStore';
import { fileSystem } from '../../lib/fileSystem';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface BuildingSlice {
  buildings: Building[];
  /** The last saved version of each building, to tell unsaved edits apart. */
  savedBuildings: Record<string, Building>;
  buildingPast: Record<string, Building[]>;
  buildingFuture: Record<string, Building[]>;

  addBuilding: (building: Building) => Promise<void>;
  updateBuilding: (id: string, updates: Partial<Building>) => void;
  deleteBuilding: (id: string) => Promise<void>;
  saveBuilding: (id: string) => Promise<void>;
  discardBuilding: (id: string) => void;
  undoBuilding: (id: string) => void;
  redoBuilding: (id: string) => void;
  resetBuildings: () => void;
}

/**
 * What stops a building from being written, with the cells each problem concerns: a name, a kit that exists and can
 * be read, and the rules of its plan, with the kit's pieces and floors once the kit has been read.
 */
export function buildingIssues(
  building: Building,
  kits: readonly BuildingKit[],
  resolved: ResolvedKitState | undefined,
): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const add = (message: string) => issues.push({ message, floor: null, cells: [] });
  if (!building.name.trim()) add('The building needs a name.');
  if (building.kit && !kits.some((kit) => kit.id === building.kit))
    add(`The kit ${building.kit} does not exist.`);
  else if (resolved?.status === 'error') add(`The kit cannot be read: ${resolved.error}`);
  return [
    ...issues,
    ...planIssues(building, resolved?.status === 'ready' ? resolved.kit : undefined),
  ];
}

export const validateBuilding = (building: Building, kits: readonly BuildingKit[]) =>
  buildingIssues(building, kits, useResolvedKitsStore.getState().kits[building.kit]).map(
    (issue) => issue.message,
  );

const HISTORY_LIMIT = 50;
// Quick consecutive edits, such as typing a name, are one undo step.
const HISTORY_MERGE_MS = 800;
const lastEditAt = new Map<string, number>();

const same = (a: Building | undefined, b: Building | undefined) =>
  JSON.stringify(a) === JSON.stringify(b);

const saveUnitOf = (id: string) => `building:${id}`;

const write = (building: Building) =>
  fileSystem.saveJson(
    resourceRegistry['building'].folder,
    resourceFileKey('building', building.id),
    { $schema: resourceSchemaPath('building'), ...building },
  );

export const createBuildingSlice: ImmerStateCreator<BuildingSlice> = (set, get) => {
  const find = (id: string) => get().buildings.find((entry) => entry.id === id);

  // Dirty means different from the saved file, so undoing back to it clears the mark.
  const syncDirty = (id: string) => {
    const unit = saveUnitOf(id);
    if (same(find(id), get().savedBuildings[id])) {
      cancelPendingSaveUnit(unit);
      useSaveStore.getState().clearUnit(unit);
      return;
    }
    const projectPath = get().projectPath;
    scheduleSaveUnit(unit, async () => {
      if (get().projectPath === projectPath) await get().saveBuilding(id);
    });
  };

  const replace = (id: string, building: Building | undefined) =>
    set((state) => {
      const index = state.buildings.findIndex((entry) => entry.id === id);
      if (!building) {
        if (index >= 0) state.buildings.splice(index, 1);
      } else if (index >= 0) state.buildings[index] = castDraft(building);
      else state.buildings.push(castDraft(building));
    });

  const history = (direction: 'undo' | 'redo', id: string) => {
    const from = direction === 'undo' ? 'buildingPast' : 'buildingFuture';
    const to = direction === 'undo' ? 'buildingFuture' : 'buildingPast';
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
    buildings: [],
    savedBuildings: {},
    buildingPast: {},
    buildingFuture: {},

    addBuilding: async (building) => {
      building = normalizeResourceDocument(building, 'building', get().project?.idPrefix);
      assertUniqueResourceIds([...get().buildings, building]);
      replace(building.id, building);
      await write(building);
      set((state) => {
        state.savedBuildings[building.id] = castDraft(building);
      });
    },

    updateBuilding: (id, updates) => {
      const before = find(id);
      if (!before) throw new Error(`Unknown building ${id}.`);
      const merged = { ...before, ...updates, id: before.id };
      if (same(before, merged)) return;
      const now = Date.now();
      const merging =
        now - (lastEditAt.get(id) ?? 0) < HISTORY_MERGE_MS && get().buildingPast[id]?.length;
      lastEditAt.set(id, now);
      set((state) => {
        if (!merging) {
          const past = (state.buildingPast[id] ??= []);
          past.push(castDraft(before));
          if (past.length > HISTORY_LIMIT) past.shift();
        }
        state.buildingFuture[id] = [];
      });
      replace(id, merged);
      syncDirty(id);
    },

    deleteBuilding: async (id) => {
      cancelPendingSaveUnit(saveUnitOf(id));
      useSaveStore.getState().clearUnit(saveUnitOf(id));
      set((state) => {
        state.buildings = state.buildings.filter((entry) => entry.id !== id);
        delete state.savedBuildings[id];
        delete state.buildingPast[id];
        delete state.buildingFuture[id];
      });
      await fileSystem.deleteJson(
        resourceRegistry['building'].folder,
        resourceFileKey('building', id),
      );
    },

    saveBuilding: async (id) => {
      const unit = saveUnitOf(id);
      const building = find(id);
      cancelPendingSaveUnit(unit);
      if (!building) return;
      const saves = useSaveStore.getState();
      const errors = validateBuilding(building, get().buildingKits);
      if (errors.length) {
        saves.markError(unit, errors.join(' '));
        return;
      }
      saves.markSaving(unit);
      try {
        await write(building);
        set((state) => {
          state.savedBuildings[id] = castDraft(building);
        });
        if (same(find(id), building)) saves.markSaved(unit);
        else syncDirty(id);
      } catch (error) {
        saves.markError(unit, error instanceof Error ? error.message : 'Unknown error');
      }
    },

    discardBuilding: (id) => {
      cancelPendingSaveUnit(saveUnitOf(id));
      const saved = get().savedBuildings[id];
      if (saved) replace(id, saved);
      set((state) => {
        delete state.buildingPast[id];
        delete state.buildingFuture[id];
      });
      lastEditAt.delete(id);
      useSaveStore.getState().clearUnit(saveUnitOf(id));
    },

    undoBuilding: (id) => history('undo', id),
    redoBuilding: (id) => history('redo', id),

    resetBuildings: () => {
      for (const id of new Set([
        ...get().buildings.map((entry) => entry.id),
        ...Object.keys(get().savedBuildings),
      ])) {
        cancelPendingSaveUnit(saveUnitOf(id));
        useSaveStore.getState().clearUnit(saveUnitOf(id));
      }
      lastEditAt.clear();
      set({
        buildings: [],
        savedBuildings: {},
        buildingPast: {},
        buildingFuture: {},
      });
    },
  };
};
