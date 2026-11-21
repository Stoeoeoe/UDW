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
import type { ObjectDefinition } from '../../types/object';
import { fileSystem } from '../../lib/fileSystem';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface ObjectSlice {
  objects: ObjectDefinition[];
  /** The last saved version of each object, to tell unsaved edits apart. */
  savedObjects: Record<string, ObjectDefinition>;
  objectPast: Record<string, ObjectDefinition[]>;
  objectFuture: Record<string, ObjectDefinition[]>;

  addObject: (object: ObjectDefinition) => Promise<void>;
  updateObject: (id: string, updates: Partial<ObjectDefinition>) => void;
  deleteObject: (id: string) => Promise<void>;
  saveObject: (id: string) => Promise<void>;
  discardObject: (id: string) => void;
  undoObject: (id: string) => void;
  redoObject: (id: string) => void;
  resetObjects: () => void;
}

/** What stops an object from being written. */
export function validateObject(object: ObjectDefinition): string[] {
  return object.name.trim() ? [] : ['The object needs a name.'];
}

const HISTORY_LIMIT = 50;
// Quick consecutive edits, such as typing a name, are one undo step.
const HISTORY_MERGE_MS = 800;
const lastEditAt = new Map<string, number>();

const same = (a: ObjectDefinition | undefined, b: ObjectDefinition | undefined) =>
  JSON.stringify(a) === JSON.stringify(b);

const saveUnitOf = (id: string) => `object:${id}`;

const write = (object: ObjectDefinition) =>
  fileSystem.saveJson(resourceRegistry.object.folder, resourceFileKey('object', object.id), {
    $schema: resourceSchemaPath('object'),
    ...object,
  });

export const createObjectSlice: ImmerStateCreator<ObjectSlice> = (set, get) => {
  const find = (id: string) => get().objects.find((entry) => entry.id === id);

  // Dirty means different from the saved file, so undoing back to it clears the mark.
  const syncDirty = (id: string) => {
    const unit = saveUnitOf(id);
    if (same(find(id), get().savedObjects[id])) {
      cancelPendingSaveUnit(unit);
      useSaveStore.getState().clearUnit(unit);
      return;
    }
    const projectPath = get().projectPath;
    scheduleSaveUnit(unit, async () => {
      if (get().projectPath === projectPath) await get().saveObject(id);
    });
  };

  const replace = (id: string, object: ObjectDefinition | undefined) =>
    set((state) => {
      const index = state.objects.findIndex((entry) => entry.id === id);
      if (!object) {
        if (index >= 0) state.objects.splice(index, 1);
      } else if (index >= 0) state.objects[index] = castDraft(object);
      else state.objects.push(castDraft(object));
    });

  const history = (direction: 'undo' | 'redo', id: string) => {
    const from = direction === 'undo' ? 'objectPast' : 'objectFuture';
    const to = direction === 'undo' ? 'objectFuture' : 'objectPast';
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
    objects: [],
    savedObjects: {},
    objectPast: {},
    objectFuture: {},

    addObject: async (object) => {
      object = normalizeResourceDocument(object, 'object', get().project?.idPrefix);
      assertUniqueResourceIds([...get().objects, object]);
      replace(object.id, object);
      await write(object);
      set((state) => {
        state.savedObjects[object.id] = castDraft(object);
      });
    },

    updateObject: (id, updates) => {
      const before = find(id);
      if (!before) throw new Error(`Unknown object ${id}.`);
      const merged = { ...before, ...updates, id: before.id };
      if (same(before, merged)) return;
      const now = Date.now();
      const merging =
        now - (lastEditAt.get(id) ?? 0) < HISTORY_MERGE_MS && get().objectPast[id]?.length;
      lastEditAt.set(id, now);
      set((state) => {
        if (!merging) {
          const past = (state.objectPast[id] ??= []);
          past.push(castDraft(before));
          if (past.length > HISTORY_LIMIT) past.shift();
        }
        state.objectFuture[id] = [];
      });
      replace(id, merged);
      syncDirty(id);
    },

    deleteObject: async (id) => {
      cancelPendingSaveUnit(saveUnitOf(id));
      useSaveStore.getState().clearUnit(saveUnitOf(id));
      set((state) => {
        state.objects = state.objects.filter((entry) => entry.id !== id);
        delete state.savedObjects[id];
        delete state.objectPast[id];
        delete state.objectFuture[id];
      });
      await fileSystem.deleteJson(resourceRegistry.object.folder, resourceFileKey('object', id));
    },

    saveObject: async (id) => {
      const unit = saveUnitOf(id);
      const object = find(id);
      cancelPendingSaveUnit(unit);
      if (!object) return;
      const saves = useSaveStore.getState();
      const errors = validateObject(object);
      if (errors.length) {
        saves.markError(unit, errors.join(' '));
        return;
      }
      saves.markSaving(unit);
      try {
        await write(object);
        set((state) => {
          state.savedObjects[id] = castDraft(object);
        });
        if (same(find(id), object)) saves.markSaved(unit);
        else syncDirty(id);
      } catch (error) {
        saves.markError(unit, error instanceof Error ? error.message : 'Unknown error');
      }
    },

    discardObject: (id) => {
      cancelPendingSaveUnit(saveUnitOf(id));
      const saved = get().savedObjects[id];
      if (saved) replace(id, saved);
      set((state) => {
        delete state.objectPast[id];
        delete state.objectFuture[id];
      });
      lastEditAt.delete(id);
      useSaveStore.getState().clearUnit(saveUnitOf(id));
    },

    undoObject: (id) => history('undo', id),
    redoObject: (id) => history('redo', id),

    resetObjects: () => {
      for (const id of new Set([
        ...get().objects.map((entry) => entry.id),
        ...Object.keys(get().savedObjects),
      ])) {
        cancelPendingSaveUnit(saveUnitOf(id));
        useSaveStore.getState().clearUnit(saveUnitOf(id));
      }
      lastEditAt.clear();
      set({
        objects: [],
        savedObjects: {},
        objectPast: {},
        objectFuture: {},
      });
    },
  };
};
