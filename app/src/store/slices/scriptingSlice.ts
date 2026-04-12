import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import {
  GameVariable,
  ScriptTable,
  ScriptFunction,
  ScriptNamespace,
  ScriptContextType,
} from '../../types/schema';
import { persistProject, persistScriptingState } from '../storeHelpers';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface ScriptingSlice {
  gameVariables: GameVariable[];
  scriptTables: ScriptTable[];
  scriptFunctions: ScriptFunction[];
  scriptNamespaces: ScriptNamespace[];
  scriptContextTypes: ScriptContextType[];

  // Game variable CRUD
  addGameVariable: (variable: GameVariable) => Promise<void>;
  updateGameVariable: (key: string, updates: Partial<GameVariable>) => Promise<void>;
  deleteGameVariable: (key: string) => Promise<void>;

  // Script table CRUD
  addScriptTable: (table: ScriptTable) => Promise<void>;
  updateScriptTable: (id: string, updates: Partial<ScriptTable>) => Promise<void>;
  deleteScriptTable: (id: string) => Promise<void>;

  // Script function CRUD
  addScriptFunction: (fn: ScriptFunction) => Promise<void>;
  updateScriptFunction: (id: string, updates: Partial<ScriptFunction>) => Promise<void>;
  deleteScriptFunction: (id: string) => Promise<void>;

  // Script namespace CRUD
  addScriptNamespace: (ns: ScriptNamespace) => Promise<void>;
  updateScriptNamespace: (id: string, updates: Partial<ScriptNamespace>) => Promise<void>;
  deleteScriptNamespace: (id: string) => Promise<void>;

  // Script context type CRUD
  addScriptContextType: (ct: ScriptContextType) => Promise<void>;
  updateScriptContextType: (id: string, updates: Partial<ScriptContextType>) => Promise<void>;
  deleteScriptContextType: (id: string) => Promise<void>;
}

export const createScriptingSlice: ImmerStateCreator<ScriptingSlice> = (set, get) => {
  const persist = () =>
    persistScriptingState(
      {
        project: get().project,
        gameVariables: get().gameVariables,
        scriptTables: get().scriptTables,
        scriptFunctions: get().scriptFunctions,
        scriptNamespaces: get().scriptNamespaces,
        scriptContextTypes: get().scriptContextTypes,
      },
      set,
    );

  return {
    gameVariables: [],
    scriptTables: [],
    scriptFunctions: [],
    scriptNamespaces: [],
    scriptContextTypes: [],

    // ── Game variables ──────────────────────────────────────────────────────
    addGameVariable: async (variable) => {
      set((state) => {
        state.gameVariables.push(castDraft(variable));
      });
      const proj = get().project;
      if (proj) {
        const projectToSave = { ...proj, gameVariables: get().gameVariables };
        await persistProject(projectToSave);
        set((state) => {
          state.project = castDraft(projectToSave);
        });
      }
    },

    updateGameVariable: async (key, updates) => {
      set((state) => {
        const v = state.gameVariables.find((g) => g.key === key);
        if (v) Object.assign(v, updates);
      });
      const proj = get().project;
      if (proj) {
        const projectToSave = { ...proj, gameVariables: get().gameVariables };
        await persistProject(projectToSave);
        set((state) => {
          state.project = castDraft(projectToSave);
        });
      }
    },

    deleteGameVariable: async (key) => {
      set((state) => {
        state.gameVariables = state.gameVariables.filter((g) => g.key !== key);
      });
      const proj = get().project;
      if (proj) {
        const projectToSave = { ...proj, gameVariables: get().gameVariables };
        await persistProject(projectToSave);
        set((state) => {
          state.project = castDraft(projectToSave);
        });
      }
    },

    // ── Script tables ───────────────────────────────────────────────────────
    addScriptTable: async (table) => {
      set((state) => {
        state.scriptTables.push(castDraft(table));
      });
      await persist();
    },

    updateScriptTable: async (id, updates) => {
      set((state) => {
        const t = state.scriptTables.find((x) => x.id === id);
        if (t) Object.assign(t, updates);
      });
      await persist();
    },

    deleteScriptTable: async (id) => {
      set((state) => {
        state.scriptTables = state.scriptTables.filter((x) => x.id !== id);
      });
      await persist();
    },

    // ── Script functions ────────────────────────────────────────────────────
    addScriptFunction: async (fn) => {
      set((state) => {
        state.scriptFunctions.push(castDraft(fn));
      });
      await persist();
    },

    updateScriptFunction: async (id, updates) => {
      set((state) => {
        const f = state.scriptFunctions.find((x) => x.id === id);
        if (f) Object.assign(f, updates);
      });
      await persist();
    },

    deleteScriptFunction: async (id) => {
      set((state) => {
        state.scriptFunctions = state.scriptFunctions.filter((x) => x.id !== id);
      });
      await persist();
    },

    // ── Script namespaces ───────────────────────────────────────────────────
    addScriptNamespace: async (ns) => {
      set((state) => {
        state.scriptNamespaces.push(castDraft(ns));
      });
      await persist();
    },

    updateScriptNamespace: async (id, updates) => {
      set((state) => {
        const n = state.scriptNamespaces.find((x) => x.id === id);
        if (n) Object.assign(n, updates);
      });
      await persist();
    },

    deleteScriptNamespace: async (id) => {
      set((state) => {
        state.scriptNamespaces = state.scriptNamespaces.filter((x) => x.id !== id);
      });
      await persist();
    },

    // ── Script context types ────────────────────────────────────────────────
    addScriptContextType: async (ct) => {
      set((state) => {
        state.scriptContextTypes.push(castDraft(ct));
      });
      await persist();
    },

    updateScriptContextType: async (id, updates) => {
      set((state) => {
        const c = state.scriptContextTypes.find((x) => x.id === id);
        if (c) Object.assign(c, updates);
      });
      await persist();
    },

    deleteScriptContextType: async (id) => {
      set((state) => {
        state.scriptContextTypes = state.scriptContextTypes.filter((x) => x.id !== id);
      });
      await persist();
    },
  };
};
