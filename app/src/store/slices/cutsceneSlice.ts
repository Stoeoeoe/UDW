import cutsceneJsonSchema from '../../../../schemas/cutscene.schema.json';
import { castDraft } from 'immer';
import type { StateCreator } from 'zustand';
import type { EditorStore } from '../useEditorStore';
import type { Cutscene } from '../../types/cutscene';
import {
  exportCutscene,
  parseCutscene,
  readCutsceneMetadata,
  validateCutsceneTriggers,
} from '../../lib/cutscenes';
import { fileSystem } from '../../lib/fileSystem';
import { resourceFileKey } from '../../lib/resourceRegistry';
import { qualifyResourceId } from '../../lib/resourceIds';
import { cancelPendingSaveUnit, scheduleSaveUnit, useSaveStore } from '../../lib/saveManager';
import { getManifestActions } from '../../lib/scriptingManifest';
import { useScriptingManifestStore } from '../useScriptingManifestStore';

export interface CutsceneSnapshot {
  document: Cutscene | null;
  labels: Record<string, string>;
  folder: string;
}
export interface CutsceneSlice {
  cutscenes: Cutscene[];
  cutsceneLabels: Record<string, string>;
  cutsceneFolders: Record<string, string>;
  createCutscene: (id: string, name: string, folderPath?: string) => string;
  deleteCutscene: (id: string) => void;
  cutsceneLoadError: string | null;
  selectedCutsceneId: string | null;
  cutscenePast: Record<string, CutsceneSnapshot[]>;
  cutsceneFuture: Record<string, CutsceneSnapshot[]>;
  savedCutscenes: Record<string, CutsceneSnapshot>;
  editCutscenes: (
    edit: (
      draft: Cutscene[],
      labels: Record<string, string>,
      folders: Record<string, string>,
    ) => void,
  ) => void;
  undoCutscene: (id?: string) => void;
  redoCutscene: (id?: string) => void;
  loadCutscenes: () => Promise<void>;
  saveCutscene: (id: string) => Promise<void>;
  discardCutscene: (id: string) => void;
  resetCutscenes: () => void;
}
type Creator = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  CutsceneSlice
>;
const emptySnapshot = (): CutsceneSnapshot => ({ document: null, labels: {}, folder: '' });

export function snapshotCutscene(
  state: Pick<CutsceneSlice, 'cutscenes' | 'cutsceneLabels' | 'cutsceneFolders'>,
  id: string,
): CutsceneSnapshot {
  const document = state.cutscenes.find((scene) => scene.id === id) ?? null;
  if (!document) return emptySnapshot();
  return {
    document,
    folder: state.cutsceneFolders[id] ?? '',
    labels: Object.fromEntries(
      Object.entries(state.cutsceneLabels)
        .filter(([key]) => key === id || key.startsWith(`${id}/`))
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}
const equalSnapshots = (a: CutsceneSnapshot, b: CutsceneSnapshot) =>
  JSON.stringify(a) === JSON.stringify(b);

function restoreSnapshot(
  state: Pick<CutsceneSlice, 'cutscenes' | 'cutsceneLabels' | 'cutsceneFolders'>,
  id: string,
  snapshot: CutsceneSnapshot,
) {
  const index = state.cutscenes.findIndex((scene) => scene.id === id);
  if (snapshot.document) {
    if (index < 0) state.cutscenes.push(snapshot.document);
    else state.cutscenes[index] = snapshot.document;
  } else if (index >= 0) state.cutscenes.splice(index, 1);
  for (const key of Object.keys(state.cutsceneLabels))
    if (key === id || key.startsWith(`${id}/`)) delete state.cutsceneLabels[key];
  Object.assign(state.cutsceneLabels, snapshot.labels);
  if (snapshot.folder) state.cutsceneFolders[id] = snapshot.folder;
  else delete state.cutsceneFolders[id];
}

// Serialize shared editor-metadata writes. Each save merges saved snapshots,
// never the unsaved labels or folders of another document.
let pendingWrite: Promise<void> = Promise.resolve();
function queueWrite(write: () => Promise<void>): Promise<void> {
  const result = pendingWrite.then(write);
  pendingWrite = result.catch(() => undefined);
  return result;
}

export const createCutsceneSlice: Creator = (set, get) => {
  const syncDirty = (id: string) => {
    const state = get();
    const unit = `cutscene:${id}`;
    if (equalSnapshots(snapshotCutscene(state, id), state.savedCutscenes[id] ?? emptySnapshot())) {
      cancelPendingSaveUnit(unit);
      useSaveStore.getState().clearUnit(unit);
    } else {
      const projectPath = state.projectPath;
      scheduleSaveUnit(unit, async () => {
        if (get().projectPath === projectPath) await get().saveCutscene(id);
      });
    }
  };
  const history = (direction: 'undo' | 'redo', requestedId?: string) => {
    const id = requestedId ?? get().selectedCutsceneId;
    if (!id) return;
    const from = direction === 'undo' ? 'cutscenePast' : 'cutsceneFuture';
    const to = direction === 'undo' ? 'cutsceneFuture' : 'cutscenePast';
    if (!get()[from][id]?.length) return;
    const current = snapshotCutscene(get(), id);
    set((state) => {
      (state[to][id] ??= []).push(castDraft(current));
      const snapshot = state[from][id].pop()!;
      restoreSnapshot(state, id, snapshot);
    });
    syncDirty(id);
  };
  return {
    cutscenes: [],
    cutsceneLabels: {},
    cutsceneFolders: {},
    cutsceneLoadError: null,
    selectedCutsceneId: null,
    cutscenePast: {},
    cutsceneFuture: {},
    savedCutscenes: {},
    resetCutscenes: () => {
      for (const id of new Set([
        ...get().cutscenes.map((scene) => scene.id),
        ...Object.keys(get().savedCutscenes),
      ])) {
        cancelPendingSaveUnit(`cutscene:${id}`);
        useSaveStore.getState().clearUnit(`cutscene:${id}`);
      }
      set({
        cutscenes: [],
        cutsceneLabels: {},
        cutsceneFolders: {},
        cutsceneLoadError: null,
        selectedCutsceneId: null,
        cutscenePast: {},
        cutsceneFuture: {},
        savedCutscenes: {},
      });
    },
    createCutscene: (id, name, folderPath = '') => {
      id = qualifyResourceId(id, get().project?.idPrefix);
      if (get().cutscenes.some((scene) => scene.id === id))
        throw new Error(`Cutscene ${id} already exists.`);
      get().editCutscenes((documents, labels, folders) => {
        documents.push({
          $schema: '../schemas/cutscene.schema.json',
          formatVersion: 2,
          id,
          mapId: '',
          allowSkip: false,
          onComplete: { steps: [], actorPlacements: [] },
          sequence: [],
        });
        labels[id] = name;
        folders[id] = folderPath;
      });
      set({ selectedCutsceneId: id });
      return id;
    },
    deleteCutscene: (id) => {
      if (!get().cutscenes.some((scene) => scene.id === id)) return;
      get().editCutscenes((documents) => {
        documents.splice(
          documents.findIndex((scene) => scene.id === id),
          1,
        );
      });
    },
    editCutscenes: (edit) => {
      const before = get();
      set((state) => {
        edit(state.cutscenes, state.cutsceneLabels, state.cutsceneFolders);
      });
      const after = get();
      const ids = new Set([...before.cutscenes, ...after.cutscenes].map((scene) => scene.id));
      for (const id of ids) {
        const previous = snapshotCutscene(before, id);
        if (equalSnapshots(previous, snapshotCutscene(after, id))) continue;
        set((state) => {
          const past = (state.cutscenePast[id] ??= []);
          past.push(castDraft(previous));
          if (past.length > 50) past.shift();
          state.cutsceneFuture[id] = [];
        });
        syncDirty(id);
      }
    },
    undoCutscene: (id) => history('undo', id),
    redoCutscene: (id) => history('redo', id),
    loadCutscenes: async () => {
      let documents: Cutscene[];
      let metadata: ReturnType<typeof readCutsceneMetadata>;
      try {
        documents = (await fileSystem.loadAllCutscenes()).map(parseCutscene);
        metadata = readCutsceneMetadata(await fileSystem.readJson('', 'cutscene-editor.json'));
      } catch (e) {
        set({
          cutsceneLoadError: `Cannot load cutscene sources or editor metadata: ${(e as Error).message}`,
        });
        throw e;
      }
      for (const id of new Set([
        ...get().cutscenes.map((scene) => scene.id),
        ...Object.keys(get().savedCutscenes),
      ])) {
        cancelPendingSaveUnit(`cutscene:${id}`);
        useSaveStore.getState().clearUnit(`cutscene:${id}`);
      }
      const loaded = {
        cutscenes: documents,
        cutsceneLabels: metadata.labels,
        cutsceneFolders: metadata.folders,
      };
      set((state) => {
        state.cutscenes = castDraft(documents);
        state.cutsceneLabels = metadata.labels;
        state.cutsceneFolders = metadata.folders;
        state.savedCutscenes = castDraft(
          Object.fromEntries(
            documents.map((scene) => [scene.id, snapshotCutscene(loaded, scene.id)]),
          ),
        );
        state.cutscenePast = {};
        state.cutsceneFuture = {};
        state.cutsceneLoadError = null;
        if (!documents.some((scene) => scene.id === state.selectedCutsceneId))
          state.selectedCutsceneId = documents[0]?.id ?? null;
      });
    },
    discardCutscene: (id) => {
      cancelPendingSaveUnit(`cutscene:${id}`);
      const saved = get().savedCutscenes[id] ?? emptySnapshot();
      set((state) => {
        restoreSnapshot(state, id, castDraft(saved));
        delete state.cutscenePast[id];
        delete state.cutsceneFuture[id];
      });
      useSaveStore.getState().clearUnit(`cutscene:${id}`);
    },
    saveCutscene: (id) =>
      queueWrite(async () => {
        const state = get();
        const snapshot = snapshotCutscene(state, id);
        const unit = `cutscene:${id}`;
        cancelPendingSaveUnit(unit);
        const saves = useSaveStore.getState();
        if (!snapshot.document && !state.savedCutscenes[id]) {
          saves.clearUnit(unit);
          return;
        }
        saves.markSaving(unit);
        try {
          if (state.cutsceneLoadError) throw new Error(state.cutsceneLoadError);
          const maps = state.maps.map((map) =>
            map.id === state.currentMap?.id ? state.currentMap : map,
          );
          const triggerErrors = maps.flatMap((map) =>
            validateCutsceneTriggers(
              {
                ...map,
                spatialPrimitives: {
                  ...map.spatialPrimitives,
                  triggers: map.spatialPrimitives?.triggers?.filter(
                    (trigger) => trigger.cutsceneId === id,
                  ),
                },
              },
              state.cutscenes,
            ),
          );
          if (triggerErrors.length) throw new Error(triggerErrors.join('; '));
          if (snapshot.document) {
            const manifest = await useScriptingManifestStore.getState().refresh();
            const source = exportCutscene(
              snapshot.document,
              getManifestActions(manifest, 'cutscene'),
              {
                maps,
                entityTypes: state.entityTypes,
                dialogueIds: [...state.dialogues.keys()],
                resources: manifest.resources,
                tileSize: state.project?.tileSize ?? 16,
              },
            );
            await fileSystem.saveJson('schemas', 'cutscene.schema.json', cutsceneJsonSchema);
            await fileSystem.saveJson('cutscenes', resourceFileKey('cutscene', id), source);
          } else await fileSystem.deleteJson('cutscenes', resourceFileKey('cutscene', id));
          const saved = { ...get().savedCutscenes };
          if (snapshot.document) saved[id] = snapshot;
          else delete saved[id];
          await fileSystem.saveJson('', 'cutscene-editor.json', {
            labels: Object.assign({}, ...Object.values(saved).map((entry) => entry.labels)),
            folders: Object.fromEntries(
              Object.entries(saved)
                .filter(([, entry]) => entry.folder)
                .map(([key, entry]) => [key, entry.folder]),
            ),
          });
          set((draft) => {
            draft.savedCutscenes = castDraft(saved);
          });
          if (equalSnapshots(snapshotCutscene(get(), id), snapshot)) saves.markSaved(unit);
          else syncDirty(id);
        } catch (e) {
          saves.markError(unit, (e as Error).message);
          throw e;
        }
      }),
  };
};
