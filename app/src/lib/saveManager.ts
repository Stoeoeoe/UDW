import { resourceFileKey, resourceRegistry, resourceSchemaPath } from './resourceRegistry';
/**
 * Save Manager - central save-unit tracking with manual save support and optional autosave.
 */

import { create } from 'zustand';
import { fileSystem } from './fileSystem';
import { DialogueDocument, Map as GameMap, Project, Tileset } from '../types/schema';
import { serializeMap } from './mapMigration';
import { serializeTileset } from './tilesetMigration';
import { useAppSettingsStore } from '../store/useAppSettingsStore';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface SaveUnitState {
  status: SaveStatus;
  lastSaved: Date | null;
  error: string | null;
  dirty: boolean;
}

export interface SaveState {
  activeSaveUnitId: string | null;
  saveUnits: Record<string, SaveUnitState>;
  status: SaveStatus;
  lastSaved: Date | null;
  error: string | null;
}

interface SaveStore extends SaveState {
  setActiveSaveUnit: (saveUnitId: string | null) => void;
  markDirty: (saveUnitId: string) => void;
  markSaving: (saveUnitId: string) => void;
  markSaved: (saveUnitId: string) => void;
  markError: (saveUnitId: string, error: string) => void;
  clearUnit: (saveUnitId: string) => void;
  reset: () => void;
}

interface SaveAccessors {
  getMapById?: (mapId: string) => GameMap | null;
  getProject?: () => Project | null;
  getTilesetById?: (tilesetId: string) => Tileset | null;
}

const saveAccessors: SaveAccessors = {};

export function registerSaveAccessors(accessors: SaveAccessors): void {
  Object.assign(saveAccessors, accessors);
}

function emptySaveUnitState(): SaveUnitState {
  return {
    status: 'idle',
    lastSaved: null,
    error: null,
    dirty: false,
  };
}

function getTrackedUnit(state: SaveState, saveUnitId: string | null): SaveUnitState {
  if (!saveUnitId) return emptySaveUnitState();
  return state.saveUnits[saveUnitId] ?? emptySaveUnitState();
}

function syncActiveState(state: SaveState): Pick<SaveState, 'status' | 'lastSaved' | 'error'> {
  const active = getTrackedUnit(state, state.activeSaveUnitId);
  return {
    status: active.status,
    lastSaved: active.lastSaved,
    error: active.error,
  };
}

function updateSaveUnit(
  state: SaveState,
  saveUnitId: string,
  updater: (unit: SaveUnitState) => SaveUnitState,
): SaveState {
  const current = state.saveUnits[saveUnitId] ?? emptySaveUnitState();
  const nextSaveUnits = {
    ...state.saveUnits,
    [saveUnitId]: updater(current),
  };
  const nextState = {
    ...state,
    saveUnits: nextSaveUnits,
  };
  return {
    ...nextState,
    ...syncActiveState(nextState),
  };
}

export const useSaveStore = create<SaveStore>((set) => ({
  activeSaveUnitId: null,
  saveUnits: {},
  status: 'idle',
  lastSaved: null,
  error: null,

  setActiveSaveUnit: (saveUnitId) =>
    set((state) => {
      const nextState = {
        ...state,
        activeSaveUnitId: saveUnitId,
      };
      return {
        ...nextState,
        ...syncActiveState(nextState),
      };
    }),

  markDirty: (saveUnitId) =>
    set((state) =>
      updateSaveUnit(state, saveUnitId, (unit) => ({
        ...unit,
        status: 'dirty',
        dirty: true,
        error: null,
      })),
    ),

  markSaving: (saveUnitId) =>
    set((state) =>
      updateSaveUnit(state, saveUnitId, (unit) => ({
        ...unit,
        status: 'saving',
        error: null,
      })),
    ),

  markSaved: (saveUnitId) =>
    set((state) =>
      updateSaveUnit(state, saveUnitId, (unit) => ({
        ...unit,
        status: 'saved',
        dirty: false,
        error: null,
        lastSaved: new Date(),
      })),
    ),

  markError: (saveUnitId, error) =>
    set((state) =>
      updateSaveUnit(state, saveUnitId, (unit) => ({
        ...unit,
        status: 'error',
        dirty: true,
        error,
      })),
    ),

  clearUnit: (saveUnitId) =>
    set((state) =>
      updateSaveUnit(state, saveUnitId, () => ({
        status: 'idle',
        lastSaved: null,
        error: null,
        dirty: false,
      })),
    ),

  reset: () =>
    set({
      activeSaveUnitId: null,
      saveUnits: {},
      status: 'idle',
      lastSaved: null,
      error: null,
    }),
}));

const mapSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
let projectSaveTimer: ReturnType<typeof setTimeout> | null = null;
const dialogueDocSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const tilesetSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

const DEBOUNCE_DELAY = 1000;
const SAVED_DISPLAY_DURATION = 2000;

function shouldAutosave(): boolean {
  return useAppSettingsStore.getState().savedSettings.autosaveEnabled;
}

function scheduleSavedReset(saveUnitId: string): void {
  setTimeout(() => {
    const tracked = useSaveStore.getState().saveUnits[saveUnitId];
    if (!tracked) return;
    if (tracked.status !== 'saved' || tracked.dirty) return;

    useSaveStore.setState((state) =>
      updateSaveUnit(state, saveUnitId, (unit) => ({
        ...unit,
        status: 'idle',
      })),
    );
  }, SAVED_DISPLAY_DURATION);
}

export function getSaveUnitStatus(saveUnitId: string | null): SaveUnitState {
  return getTrackedUnit(useSaveStore.getState(), saveUnitId);
}

export function getDirtySaveUnitIds(): string[] {
  return Object.entries(useSaveStore.getState().saveUnits)
    .filter(([, unit]) => unit.dirty)
    .map(([saveUnitId]) => saveUnitId);
}

export function markSaveUnitDirty(saveUnitId: string): void {
  useSaveStore.getState().markDirty(saveUnitId);
}

export function clearSaveUnit(saveUnitId: string): void {
  useSaveStore.getState().clearUnit(saveUnitId);
}

export function cancelPendingSaveUnit(saveUnitId: string): void {
  if (saveUnitId.startsWith('location:')) {
    const mapId = saveUnitId.slice('location:'.length);
    const existing = mapSaveTimers.get(mapId);
    if (existing) {
      clearTimeout(existing);
      mapSaveTimers.delete(mapId);
    }
    return;
  }

  if (saveUnitId.startsWith('tileset:')) {
    const tilesetId = saveUnitId.slice('tileset:'.length);
    const existing = tilesetSaveTimers.get(tilesetId);
    if (existing) {
      clearTimeout(existing);
      tilesetSaveTimers.delete(tilesetId);
    }
    return;
  }

  if ((saveUnitId === 'configuration' || saveUnitId === 'settings') && projectSaveTimer) {
    clearTimeout(projectSaveTimer);
    projectSaveTimer = null;
  }
}

export function saveMapDebounced(map: GameMap): void {
  const saveUnitId = `location:${map.id}`;
  useSaveStore.getState().markDirty(saveUnitId);

  if (!shouldAutosave()) {
    return;
  }

  const existing = mapSaveTimers.get(map.id);
  if (existing) clearTimeout(existing);

  const timeoutId = setTimeout(async () => {
    const latestMap = saveAccessors.getMapById?.(map.id) ?? map;
    await saveMapImmediate(latestMap);
    mapSaveTimers.delete(map.id);
  }, DEBOUNCE_DELAY);

  mapSaveTimers.set(map.id, timeoutId);
}

export async function saveMapImmediate(map: GameMap): Promise<void> {
  const saveUnitId = `location:${map.id}`;
  useSaveStore.getState().markSaving(saveUnitId);

  try {
    await fileSystem.saveJson(
      resourceRegistry.location.folder,
      resourceFileKey('location', map.id),
      {
        $schema: resourceSchemaPath('location'),
        ...serializeMap(map),
      },
    );
    useSaveStore.getState().markSaved(saveUnitId);
    scheduleSavedReset(saveUnitId);
  } catch (error) {
    console.error('Failed to save map:', error);
    useSaveStore
      .getState()
      .markError(saveUnitId, error instanceof Error ? error.message : 'Unknown error');
  }
}

export function saveProjectDebounced(
  project: Project,
  saveUnitId: 'configuration' | 'settings' = 'configuration',
): void {
  useSaveStore.getState().markDirty(saveUnitId);

  if (!shouldAutosave()) {
    return;
  }

  if (projectSaveTimer) clearTimeout(projectSaveTimer);

  projectSaveTimer = setTimeout(async () => {
    const latestProject = saveAccessors.getProject?.() ?? project;
    await saveProjectImmediate(latestProject, saveUnitId);
    projectSaveTimer = null;
  }, DEBOUNCE_DELAY);
}

export async function saveProjectImmediate(
  project: Project,
  saveUnitId: 'configuration' | 'settings' = 'configuration',
): Promise<void> {
  useSaveStore.getState().markSaving(saveUnitId);

  try {
    const { entityTypes: _legacyEntityTypes, ...projectToSave } = project;
    await fileSystem.saveJson(
      resourceRegistry.project.folder,
      resourceFileKey('project', project.id),
      {
        $schema: resourceSchemaPath('project'),
        ...projectToSave,
      },
    );
    useSaveStore.getState().markSaved(saveUnitId);
    scheduleSavedReset(saveUnitId);
  } catch (error) {
    console.error('Failed to save project:', error);
    useSaveStore
      .getState()
      .markError(saveUnitId, error instanceof Error ? error.message : 'Unknown error');
  }
}

export function saveTilesetDebounced(tilesetId: string): void {
  const saveUnitId = `tileset:${tilesetId}`;
  useSaveStore.getState().markDirty(saveUnitId);

  if (!shouldAutosave()) {
    return;
  }

  const existing = tilesetSaveTimers.get(tilesetId);
  if (existing) clearTimeout(existing);

  const timeoutId = setTimeout(async () => {
    const latestTileset = saveAccessors.getTilesetById?.(tilesetId);
    if (latestTileset) await saveTilesetImmediate(latestTileset);
    tilesetSaveTimers.delete(tilesetId);
  }, DEBOUNCE_DELAY);

  tilesetSaveTimers.set(tilesetId, timeoutId);
}

export async function saveTilesetImmediate(tileset: Tileset): Promise<void> {
  const saveUnitId = `tileset:${tileset.id}`;
  useSaveStore.getState().markSaving(saveUnitId);

  try {
    const snapshot = serializeTileset(JSON.parse(JSON.stringify(tileset)) as Tileset);
    await fileSystem.saveJson(
      resourceRegistry.tileset.folder,
      resourceFileKey('tileset', tileset.id),
      snapshot,
    );
    useSaveStore.getState().markSaved(saveUnitId);
    scheduleSavedReset(saveUnitId);
  } catch (error) {
    console.error('Failed to save tileset:', error);
    useSaveStore
      .getState()
      .markError(saveUnitId, error instanceof Error ? error.message : 'Unknown error');
  }
}

export function saveDialogueDebounced(dialogue: DialogueDocument): void {
  const existing = dialogueDocSaveTimers.get(dialogue.id);
  if (existing) clearTimeout(existing);

  const timeoutId = setTimeout(async () => {
    await saveDialogueImmediate(dialogue);
    dialogueDocSaveTimers.delete(dialogue.id);
  }, DEBOUNCE_DELAY);

  dialogueDocSaveTimers.set(dialogue.id, timeoutId);
}

export async function saveDialogueImmediate(dialogue: DialogueDocument): Promise<void> {
  try {
    await fileSystem.saveJson(
      resourceRegistry.dialogue.folder,
      resourceFileKey('dialogue', dialogue.id),
      {
        $schema: resourceSchemaPath('dialogue'),
        ...dialogue,
      },
    );
  } catch (error) {
    console.error('Failed to save dialogue document:', error);
  }
}

export async function flushPendingSaves(): Promise<void> {
  for (const timer of mapSaveTimers.values()) {
    clearTimeout(timer);
  }
  mapSaveTimers.clear();
  if (projectSaveTimer) {
    clearTimeout(projectSaveTimer);
    projectSaveTimer = null;
  }

  for (const timer of dialogueDocSaveTimers.values()) {
    clearTimeout(timer);
  }
  dialogueDocSaveTimers.clear();

  for (const timer of tilesetSaveTimers.values()) {
    clearTimeout(timer);
  }
  tilesetSaveTimers.clear();
}
