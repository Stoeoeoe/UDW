import {
  resourceFileKey,
  resourceRegistry,
  resourceSchemaPath,
  normalizeResourceDocument,
} from '../../lib/resourceRegistry';
import { assertUniqueResourceIds } from '../../lib/resourceIds';
import { cancelPendingSaveUnit, scheduleSaveUnit, useSaveStore } from '../../lib/saveManager';
import { validateRoutine } from '../../lib/routines';
import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import type { Routine } from '../../types/routine';
import { fileSystem } from '../../lib/fileSystem';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface RoutineSlice {
  routines: Routine[];
  selectedRoutineId: string | null;
  /** The last saved version of each routine, to tell unsaved edits apart. */
  savedRoutines: Record<string, Routine>;
  routinePast: Record<string, Routine[]>;
  routineFuture: Record<string, Routine[]>;

  setSelectedRoutine: (id: string | null) => void;
  addRoutine: (routine: Routine) => Promise<void>;
  updateRoutine: (id: string, updates: Partial<Routine>) => void;
  deleteRoutine: (id: string) => Promise<void>;
  saveRoutine: (id: string) => Promise<void>;
  discardRoutine: (id: string) => void;
  undoRoutine: (id: string) => void;
  redoRoutine: (id: string) => void;
  resetRoutines: () => void;
}

const HISTORY_LIMIT = 50;
// Quick consecutive edits, such as typing a time, are one undo step.
const HISTORY_MERGE_MS = 800;
const lastEditAt = new Map<string, number>();

const sameRoutine = (a: Routine | undefined, b: Routine | undefined) =>
  JSON.stringify(a) === JSON.stringify(b);

const saveUnitOf = (id: string) => `routine:${id}`;

const write = (routine: Routine) =>
  fileSystem.saveJson(resourceRegistry.routine.folder, resourceFileKey('routine', routine.id), {
    $schema: resourceSchemaPath('routine'),
    ...routine,
  });

export const createRoutineSlice: ImmerStateCreator<RoutineSlice> = (set, get) => {
  const find = (id: string) => get().routines.find((entry) => entry.id === id);

  // Dirty means different from the saved file, so undoing back to it clears the mark.
  const syncDirty = (id: string) => {
    const unit = saveUnitOf(id);
    if (sameRoutine(find(id), get().savedRoutines[id])) {
      cancelPendingSaveUnit(unit);
      useSaveStore.getState().clearUnit(unit);
      return;
    }
    const projectPath = get().projectPath;
    scheduleSaveUnit(unit, async () => {
      if (get().projectPath === projectPath) await get().saveRoutine(id);
    });
  };

  const replace = (id: string, routine: Routine | undefined) =>
    set((state) => {
      const index = state.routines.findIndex((entry) => entry.id === id);
      if (!routine) {
        if (index >= 0) state.routines.splice(index, 1);
      } else if (index >= 0) state.routines[index] = castDraft(routine);
      else state.routines.push(castDraft(routine));
    });

  const history = (direction: 'undo' | 'redo', id: string) => {
    const from = direction === 'undo' ? 'routinePast' : 'routineFuture';
    const to = direction === 'undo' ? 'routineFuture' : 'routinePast';
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
    routines: [],
    selectedRoutineId: null,
    savedRoutines: {},
    routinePast: {},
    routineFuture: {},

    setSelectedRoutine: (id) =>
      set((state) => {
        state.selectedRoutineId = id;
      }),

    addRoutine: async (routine) => {
      routine = normalizeResourceDocument(routine, 'routine', get().project?.idPrefix);
      assertUniqueResourceIds([...get().routines, routine]);
      replace(routine.id, routine);
      // A new routine may still lack its home anchor; it stays unsaved until it can be imported.
      if (validateRoutine(routine).length) {
        syncDirty(routine.id);
        return;
      }
      await write(routine);
      set((state) => {
        state.savedRoutines[routine.id] = castDraft(routine);
      });
    },

    updateRoutine: (id, updates) => {
      const before = find(id);
      if (!before) return;
      const merged = { ...before, ...updates, id: before.id };
      if (sameRoutine(before, merged)) return;
      const now = Date.now();
      const merging =
        now - (lastEditAt.get(id) ?? 0) < HISTORY_MERGE_MS && get().routinePast[id]?.length;
      lastEditAt.set(id, now);
      set((state) => {
        if (!merging) {
          const past = (state.routinePast[id] ??= []);
          past.push(castDraft(before));
          if (past.length > HISTORY_LIMIT) past.shift();
        }
        state.routineFuture[id] = [];
      });
      replace(id, merged);
      syncDirty(id);
    },

    deleteRoutine: async (id) => {
      cancelPendingSaveUnit(saveUnitOf(id));
      useSaveStore.getState().clearUnit(saveUnitOf(id));
      set((state) => {
        state.routines = state.routines.filter((entry) => entry.id !== id);
        delete state.savedRoutines[id];
        delete state.routinePast[id];
        delete state.routineFuture[id];
        if (state.selectedRoutineId === id) state.selectedRoutineId = null;
      });
      await fileSystem.deleteJson(resourceRegistry.routine.folder, resourceFileKey('routine', id));
    },

    saveRoutine: async (id) => {
      const unit = saveUnitOf(id);
      const routine = find(id);
      cancelPendingSaveUnit(unit);
      if (!routine) return;
      const saves = useSaveStore.getState();
      // Only rules Unity's importer enforces block the write; missing anchors and the like are shown in the
      // editor, because they are fixed elsewhere (in the map) and must not hold back the file.
      const errors = validateRoutine(routine);
      if (errors.length) {
        saves.markError(unit, errors.map((issue) => issue.message).join(' '));
        return;
      }
      saves.markSaving(unit);
      try {
        await write(routine);
        set((state) => {
          state.savedRoutines[id] = castDraft(routine);
        });
        if (sameRoutine(find(id), routine)) saves.markSaved(unit);
        else syncDirty(id);
      } catch (error) {
        saves.markError(unit, error instanceof Error ? error.message : 'Unknown error');
      }
    },

    discardRoutine: (id) => {
      cancelPendingSaveUnit(saveUnitOf(id));
      const saved = get().savedRoutines[id];
      if (saved) replace(id, saved);
      set((state) => {
        delete state.routinePast[id];
        delete state.routineFuture[id];
      });
      lastEditAt.delete(id);
      useSaveStore.getState().clearUnit(saveUnitOf(id));
    },

    undoRoutine: (id) => history('undo', id),
    redoRoutine: (id) => history('redo', id),

    resetRoutines: () => {
      for (const id of new Set([
        ...get().routines.map((entry) => entry.id),
        ...Object.keys(get().savedRoutines),
      ])) {
        cancelPendingSaveUnit(saveUnitOf(id));
        useSaveStore.getState().clearUnit(saveUnitOf(id));
      }
      lastEditAt.clear();
      set({
        routines: [],
        selectedRoutineId: null,
        savedRoutines: {},
        routinePast: {},
        routineFuture: {},
      });
    },
  };
};
