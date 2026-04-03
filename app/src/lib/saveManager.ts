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
import { Map as GameMap, Project } from '../types/schema';

// Save status types
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveState {
  status: SaveStatus;
  lastSaved: Date | null;
  error: string | null;
  pendingMapSave: boolean;
  pendingProjectSave: boolean;
}

interface SaveStore extends SaveState {
  setStatus: (status: SaveStatus, error?: string) => void;
  setLastSaved: (date: Date) => void;
  setPendingMapSave: (pending: boolean) => void;
  setPendingProjectSave: (pending: boolean) => void;
}

export const useSaveStore = create<SaveStore>((set) => ({
  status: 'idle',
  lastSaved: null,
  error: null,
  pendingMapSave: false,
  pendingProjectSave: false,

  setStatus: (status, error) => set({ status, error: error || null }),
  setLastSaved: (date) => set({ lastSaved: date, status: 'saved' }),
  setPendingMapSave: (pending) => set({ pendingMapSave: pending }),
  setPendingProjectSave: (pending) => set({ pendingProjectSave: pending }),
}));

// Debounce timers
let mapSaveTimer: ReturnType<typeof setTimeout> | null = null;
let projectSaveTimer: ReturnType<typeof setTimeout> | null = null;

// Debounce delay in ms (300ms for responsive feel, not too aggressive)
const DEBOUNCE_DELAY = 300;

// Show "Saved" status duration
const SAVED_DISPLAY_DURATION = 2000;

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
    await fileSystem.saveJson('maps', `${map.id}.map.json`, map);
    store.setLastSaved(new Date());

    // Auto-reset to idle after showing "Saved"
    setTimeout(() => {
      if (useSaveStore.getState().status === 'saved') {
        useSaveStore.getState().setStatus('idle');
      }
    }, SAVED_DISPLAY_DURATION);
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
    await fileSystem.saveJson('', 'project.json', project);
    store.setLastSaved(new Date());

    // Auto-reset to idle after showing "Saved"
    setTimeout(() => {
      if (useSaveStore.getState().status === 'saved') {
        useSaveStore.getState().setStatus('idle');
      }
    }, SAVED_DISPLAY_DURATION);
  } catch (e) {
    console.error('Failed to save project:', e);
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
  // Note: The actual save would need the current map/project state
  // This is handled by the calling code
}
