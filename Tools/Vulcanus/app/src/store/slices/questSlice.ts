import {
  resourceFileKey,
  resourceSchemaPath,
  normalizeResourceDocument,
} from '../../lib/resourceRegistry';
import { assertUniqueResourceIds } from '../../lib/resourceIds';
import { cancelPendingSaveUnit, scheduleSaveUnit, useSaveStore } from '../../lib/saveManager';
import {
  questI18n,
  questReferenceWarnings,
  questStartWarnings,
  validateQuest,
  type QuestReferences,
} from '../../lib/quests';
import { compileQuestGraph, questActionResources } from '../../lib/questGraph';
import { useScriptingManifestStore } from '../useScriptingManifestStore';
import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import type { Quest } from '../../types/quest';
import { fileSystem } from '../../lib/fileSystem';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

/** What the last check of a quest found: errors block saving, warnings don't. */
export interface QuestIssues {
  errors: string[];
  warnings: string[];
}

export interface QuestSlice {
  quests: Quest[];
  /** The last saved version of each quest, to tell unsaved edits apart. */
  savedQuests: Record<string, Quest>;
  questPast: Record<string, Quest[]>;
  questFuture: Record<string, Quest[]>;
  /** From the last save or check of each quest. */
  questIssues: Record<string, QuestIssues>;

  addQuest: (quest: Quest) => Promise<void>;
  updateQuest: (id: string, updates: Partial<Quest>) => void;
  deleteQuest: (id: string) => Promise<void>;
  saveQuest: (id: string) => Promise<void>;
  /** Checks the quest as saving does, without saving it. */
  checkQuest: (id: string) => QuestIssues;
  discardQuest: (id: string) => void;
  undoQuest: (id: string) => void;
  redoQuest: (id: string) => void;
  resetQuests: () => void;
}

const HISTORY_LIMIT = 50;
// Quick consecutive edits, such as typing a time, are one undo step.
const HISTORY_MERGE_MS = 800;
const lastEditAt = new Map<string, number>();

const sameQuest = (a: Quest | undefined, b: Quest | undefined) =>
  JSON.stringify(a) === JSON.stringify(b);

const saveUnitOf = (id: string) => `quest:${id}`;

const write = async (quest: Quest) => {
  await fileSystem.saveJson('quests', resourceFileKey('quest', quest.id), {
    $schema: resourceSchemaPath('quest'),
    ...quest,
  });
  await fileSystem.saveJson('quests', resourceFileKey('quest-i18n', quest.id), {
    $schema: resourceSchemaPath('quest-i18n'),
    ...questI18n(quest),
  });
};

export const createQuestSlice: ImmerStateCreator<QuestSlice> = (set, get) => {
  const find = (id: string) => get().quests.find((entry) => entry.id === id);

  // Dirty means different from the saved file, so undoing back to it clears the mark.
  const syncDirty = (id: string) => {
    const unit = saveUnitOf(id);
    if (sameQuest(find(id), get().savedQuests[id])) {
      cancelPendingSaveUnit(unit);
      useSaveStore.getState().clearUnit(unit);
      return;
    }
    const projectPath = get().projectPath;
    scheduleSaveUnit(unit, async () => {
      if (get().projectPath === projectPath) await get().saveQuest(id);
    });
  };

  const replace = (id: string, quest: Quest | undefined) =>
    set((state) => {
      const index = state.quests.findIndex((entry) => entry.id === id);
      if (!quest) {
        if (index >= 0) state.quests.splice(index, 1);
      } else if (index >= 0) state.quests[index] = castDraft(quest);
      else state.quests.push(castDraft(quest));
    });

  /** Records the quest's issues; the export is there when nothing blocks saving. */
  const check = (quest: Quest) => {
    const state = get();
    const manifest = useScriptingManifestStore.getState().manifest;
    const resources = questActionResources(manifest, state);
    const references: QuestReferences = {
      characterIds: new Set(state.characters.map((c) => c.id)),
      itemIds: new Set(state.items.map((i) => i.id)),
      dialogueIds: new Set(state.dialogues.keys()),
      maps: state.maps,
    };
    const issues: QuestIssues = {
      errors: validateQuest(quest, manifest, resources),
      warnings: [
        ...questReferenceWarnings(quest, references, resources),
        ...questStartWarnings(quest),
      ],
    };
    set((draft) => {
      draft.questIssues[quest.id] = issues;
    });
    return {
      issues,
      exported: issues.errors.length ? undefined : compileQuestGraph(quest, manifest, resources),
    };
  };

  const history = (direction: 'undo' | 'redo', id: string) => {
    const from = direction === 'undo' ? 'questPast' : 'questFuture';
    const to = direction === 'undo' ? 'questFuture' : 'questPast';
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
    quests: [],
    savedQuests: {},
    questPast: {},
    questFuture: {},
    questIssues: {},

    addQuest: async (quest) => {
      quest = normalizeResourceDocument(quest, 'quest', get().project?.idPrefix);
      assertUniqueResourceIds([...get().quests, quest]);
      replace(quest.id, quest);
      await get().saveQuest(quest.id);
      const unit = useSaveStore.getState().saveUnits[saveUnitOf(quest.id)];
      if (unit.status === 'error') throw new Error(unit.error!);
    },

    updateQuest: (id, updates) => {
      const before = find(id);
      if (!before) throw new Error(`Unknown quest ${id}.`);
      const merged = { ...before, ...updates, id: before.id };
      if (sameQuest(before, merged)) return;
      const now = Date.now();
      const merging =
        now - (lastEditAt.get(id) ?? 0) < HISTORY_MERGE_MS && get().questPast[id]?.length;
      lastEditAt.set(id, now);
      set((state) => {
        if (!merging) {
          const past = (state.questPast[id] ??= []);
          past.push(castDraft(before));
          if (past.length > HISTORY_LIMIT) past.shift();
        }
        state.questFuture[id] = [];
      });
      replace(id, merged);
      syncDirty(id);
    },

    deleteQuest: async (id) => {
      cancelPendingSaveUnit(saveUnitOf(id));
      for (const kind of ['quest-i18n', 'quest'] as const) {
        await fileSystem.deleteJson('quests', resourceFileKey(kind, id)).catch((error) => {
          // A new draft has no files yet; a hand-authored source may have no export.
          if (error instanceof DOMException && error.name === 'NotFoundError') return;
          throw error;
        });
      }
      useSaveStore.getState().clearUnit(saveUnitOf(id));
      set((state) => {
        state.quests = state.quests.filter((entry) => entry.id !== id);
        delete state.savedQuests[id];
        delete state.questPast[id];
        delete state.questFuture[id];
        delete state.questIssues[id];
      });
    },

    saveQuest: async (id) => {
      const unit = saveUnitOf(id);
      const quest = find(id);
      cancelPendingSaveUnit(unit);
      if (!quest) return;
      const saves = useSaveStore.getState();
      const { issues, exported } = check(quest);
      if (!exported) {
        saves.markError(unit, issues.errors.join(' '));
        return;
      }
      saves.markSaving(unit);
      try {
        await write(exported);
        set((state) => {
          state.savedQuests[id] = castDraft(exported);
        });
        // Unless edited meanwhile, the quest now holds what its file holds, compiled fields included.
        if (sameQuest(find(id), quest)) {
          replace(id, exported);
          saves.markSaved(unit);
        } else syncDirty(id);
      } catch (error) {
        saves.markError(unit, error instanceof Error ? error.message : 'Unknown error');
      }
    },

    checkQuest: (id) => {
      const quest = find(id);
      if (!quest) throw new Error(`Unknown quest ${id}.`);
      return check(quest).issues;
    },

    discardQuest: (id) => {
      cancelPendingSaveUnit(saveUnitOf(id));
      const saved = get().savedQuests[id];
      replace(id, saved);
      set((state) => {
        delete state.questPast[id];
        delete state.questFuture[id];
      });
      lastEditAt.delete(id);
      useSaveStore.getState().clearUnit(saveUnitOf(id));
    },

    undoQuest: (id) => history('undo', id),
    redoQuest: (id) => history('redo', id),

    resetQuests: () => {
      for (const id of new Set([
        ...get().quests.map((entry) => entry.id),
        ...Object.keys(get().savedQuests),
      ])) {
        cancelPendingSaveUnit(saveUnitOf(id));
        useSaveStore.getState().clearUnit(saveUnitOf(id));
      }
      lastEditAt.clear();
      set({
        quests: [],
        savedQuests: {},
        questPast: {},
        questFuture: {},
        questIssues: {},
      });
    },
  };
};
