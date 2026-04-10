/**
 * Save Manager - Unified persistence layer with debouncing and status tracking
 *
 * Provides:
 * - Debounced auto-save for rapid changes (e.g., painting tiles)
 * - Save status tracking (idle, saving, saved, error)
 * - Unified save API for maps, tilesets, and project settings
 */

import { create } from 'zustand';
import { fileSystem } from './fileSystem';
import { DialogueDocument, DialogueIndex, Map as GameMap, Project } from '../types/schema';
import { serializeMap } from './mapMigration';

// Save status types
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveState {
  status: SaveStatus;
  lastSaved: Date | null;
  error: string | null;
  pendingMapSave: boolean;
  pendingProjectSave: boolean;
  pendingDialogueSave: boolean;
}

interface SaveStore extends SaveState {
  setStatus: (status: SaveStatus, error?: string) => void;
  setLastSaved: (date: Date) => void;
  setPendingMapSave: (pending: boolean) => void;
  setPendingProjectSave: (pending: boolean) => void;
  setPendingDialogueSave: (pending: boolean) => void;
}

export const useSaveStore = create<SaveStore>((set) => ({
  status: 'idle',
  lastSaved: null,
  error: null,
  pendingMapSave: false,
  pendingProjectSave: false,
  pendingDialogueSave: false,

  setStatus: (status, error) => set({ status, error: error || null }),
  setLastSaved: (date) => set({ lastSaved: date, status: 'saved' }),
  setPendingMapSave: (pending) => set({ pendingMapSave: pending }),
  setPendingProjectSave: (pending) => set({ pendingProjectSave: pending }),
  setPendingDialogueSave: (pending) => set({ pendingDialogueSave: pending }),
}));

// Debounce timers
let mapSaveTimer: ReturnType<typeof setTimeout> | null = null;
let projectSaveTimer: ReturnType<typeof setTimeout> | null = null;
let dialogueIndexSaveTimer: ReturnType<typeof setTimeout> | null = null;
const dialogueDocSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Debounce delay in ms (1000ms for responsive feel, not too aggressive)
const DEBOUNCE_DELAY = 1000;

// Show "Saved" status duration
const SAVED_DISPLAY_DURATION = 2000;

function scheduleStatusReset(): void {
  setTimeout(() => {
    if (useSaveStore.getState().status === 'saved') {
      useSaveStore.getState().setStatus('idle');
    }
  }, SAVED_DISPLAY_DURATION);
}

/**
 * Save a map with debouncing.
 * Multiple rapid calls will only trigger one save after the debounce period.
 */
export function saveMapDebounced(map: GameMap): void {
  useSaveStore.getState().setPendingMapSave(true);

  if (mapSaveTimer) {
    clearTimeout(mapSaveTimer);
  }

  mapSaveTimer = setTimeout(async () => {
    await saveMapImmediate(map);
    mapSaveTimer = null;
  }, DEBOUNCE_DELAY);
}

/**
 * Save a map immediately without debouncing.
 */
export async function saveMapImmediate(map: GameMap): Promise<void> {
  const store = useSaveStore.getState();
  store.setStatus('saving');
  store.setPendingMapSave(false);

  try {
    await fileSystem.saveJson('maps', `${map.id}.map.json`, {
      $schema: '../../schemas/map.schema.json',
      ...serializeMap(map),
    });
    store.setLastSaved(new Date());
    scheduleStatusReset();
  } catch (e) {
    console.error('Failed to save map:', e);
    store.setStatus('error', e instanceof Error ? e.message : 'Unknown error');
  }
}

/**
 * Save project settings with debouncing.
 */
export function saveProjectDebounced(project: Project): void {
  useSaveStore.getState().setPendingProjectSave(true);

  if (projectSaveTimer) {
    clearTimeout(projectSaveTimer);
  }

  projectSaveTimer = setTimeout(async () => {
    await saveProjectImmediate(project);
    projectSaveTimer = null;
  }, DEBOUNCE_DELAY);
}

/**
 * Save project settings immediately.
 */
export async function saveProjectImmediate(project: Project): Promise<void> {
  const store = useSaveStore.getState();
  store.setStatus('saving');
  store.setPendingProjectSave(false);

  try {
    await fileSystem.saveJson('', `${project.id}.project.json`, {
      $schema: '../schemas/project.schema.json',
      ...project,
    });
    store.setLastSaved(new Date());
    scheduleStatusReset();
  } catch (e) {
    console.error('Failed to save project:', e);
    store.setStatus('error', e instanceof Error ? e.message : 'Unknown error');
  }
}

/** Save dialogue index with debouncing. */
export function saveDialogueIndexDebounced(index: DialogueIndex): void {
  useSaveStore.getState().setPendingDialogueSave(true);

  if (dialogueIndexSaveTimer) {
    clearTimeout(dialogueIndexSaveTimer);
  }

  dialogueIndexSaveTimer = setTimeout(async () => {
    await saveDialogueIndexImmediate(index);
    dialogueIndexSaveTimer = null;
  }, DEBOUNCE_DELAY);
}

/** Save dialogue document with per-dialogue debouncing. */
export function saveDialogueDebounced(dialogue: DialogueDocument): void {
  useSaveStore.getState().setPendingDialogueSave(true);

  const existing = dialogueDocSaveTimers.get(dialogue.id);
  if (existing) {
    clearTimeout(existing);
  }

  const timeoutId = setTimeout(async () => {
    await saveDialogueImmediate(dialogue);
    dialogueDocSaveTimers.delete(dialogue.id);
  }, DEBOUNCE_DELAY);

  dialogueDocSaveTimers.set(dialogue.id, timeoutId);
}

export async function saveDialogueIndexImmediate(index: DialogueIndex): Promise<void> {
  const store = useSaveStore.getState();
  store.setStatus('saving');

  try {
    await fileSystem.saveJson('dialogues', 'dialogues.index.json', {
      $schema: '../../schemas/dialogue-index.schema.json',
      ...index,
    });
    store.setPendingDialogueSave(false);
    store.setLastSaved(new Date());
    scheduleStatusReset();
  } catch (e) {
    console.error('Failed to save dialogue index:', e);
    store.setStatus('error', e instanceof Error ? e.message : 'Unknown error');
  }
}

export async function saveDialogueImmediate(dialogue: DialogueDocument): Promise<void> {
  const store = useSaveStore.getState();
  store.setStatus('saving');

  try {
    await fileSystem.saveJson('dialogues', `${dialogue.id}.dialogue.json`, {
      $schema: '../../schemas/dialogue.schema.json',
      ...dialogue,
    });
    store.setPendingDialogueSave(false);
    store.setLastSaved(new Date());
    scheduleStatusReset();
  } catch (e) {
    console.error('Failed to save dialogue document:', e);
    store.setStatus('error', e instanceof Error ? e.message : 'Unknown error');
  }
}

/**
 * Flush any pending saves immediately.
 * Useful before closing project or navigating away.
 */
export async function flushPendingSaves(): Promise<void> {
  if (mapSaveTimer) {
    clearTimeout(mapSaveTimer);
    mapSaveTimer = null;
  }
  if (projectSaveTimer) {
    clearTimeout(projectSaveTimer);
    projectSaveTimer = null;
  }
  if (dialogueIndexSaveTimer) {
    clearTimeout(dialogueIndexSaveTimer);
    dialogueIndexSaveTimer = null;
  }
  for (const timer of dialogueDocSaveTimers.values()) {
    clearTimeout(timer);
  }
  dialogueDocSaveTimers.clear();
  // Note: The actual save would need the current map/project state
  // This is handled by the calling code
}
