import { create } from 'zustand';
import { markSaveUnitDirty, useSaveStore } from '../lib/saveManager';

export type SettingsCategory = 'general' | 'editor' | 'grid' | 'export' | 'shortcuts';

export interface AppSettings {
  theme: 'dark' | 'light';
  autosaveEnabled: boolean;
  autosaveInterval: number;
  undoHistorySize: number;
  showTileIndices: boolean;
  snapToGrid: boolean;
  highlightHoveredTile: boolean;
  defaultTool: 'select' | 'stamp' | 'entityPlace';
  showGrid: boolean;
  gridOpacity: number;
  gridColor: string;
  exportFormat: 'json' | 'xml' | 'binary';
  prettyPrintJson: boolean;
  includeMetadata: boolean;
}

const STORAGE_KEY = 'vulcanus.appSettings';

export const defaultAppSettings: AppSettings = {
  theme: 'dark',
  autosaveEnabled: false,
  autosaveInterval: 5,
  undoHistorySize: 50,
  showTileIndices: false,
  snapToGrid: true,
  highlightHoveredTile: true,
  defaultTool: 'select',
  showGrid: true,
  gridOpacity: 30,
  gridColor: '#ffffff',
  exportFormat: 'json',
  prettyPrintJson: true,
  includeMetadata: true,
};

function loadSavedSettings(): AppSettings {
  if (typeof window === 'undefined') return defaultAppSettings;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultAppSettings;
    return {
      ...defaultAppSettings,
      ...(JSON.parse(raw) as Partial<AppSettings>),
    };
  } catch {
    return defaultAppSettings;
  }
}

function persistSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore local storage errors for now.
  }
}

interface AppSettingsStore {
  savedSettings: AppSettings;
  draftSettings: AppSettings;
  updateDraftSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetDraft: () => void;
  saveDraft: () => void;
}

const initialSettings = loadSavedSettings();

export const useAppSettingsStore = create<AppSettingsStore>((set, get) => ({
  savedSettings: initialSettings,
  draftSettings: initialSettings,

  updateDraftSetting: (key, value) =>
    set((state) => {
      const nextDraft = {
        ...state.draftSettings,
        [key]: value,
      };
      const isDirty = JSON.stringify(nextDraft) !== JSON.stringify(state.savedSettings);
      if (isDirty) {
        markSaveUnitDirty('settings');
      }
      return {
        draftSettings: nextDraft,
      };
    }),

  resetDraft: () =>
    set((state) => ({
      draftSettings: state.savedSettings,
    })),

  saveDraft: () => {
    const draft = get().draftSettings;
    persistSettings(draft);
    set({
      savedSettings: draft,
      draftSettings: draft,
    });
    useSaveStore.getState().markSaved('settings');
  },
}));
