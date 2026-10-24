import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceTab } from '../types/workspace';

vi.mock('./saveManager', () => ({
  cancelPendingSaveUnit: vi.fn(),
  clearSaveUnit: vi.fn(),
  getDirtySaveUnitIds: vi.fn(() => []),
  saveMapImmediate: vi.fn(),
  saveProjectImmediate: vi.fn(),
  saveTilesetImmediate: vi.fn(),
}));

vi.mock('./fileSystem', () => ({
  fileSystem: {
    resolveFilename: (_subDir: string, filename: string) => filename,
    readJson: vi.fn(),
  },
}));

vi.mock('../store/useEditorStore', () => ({
  useEditorStore: {
    getState: vi.fn(() => ({
      currentMap: null,
      maps: [],
      tilesets: new Map(),
      project: null,
      layerDefinitions: [],
      setCurrentMap: vi.fn(),
    })),
    setState: vi.fn(),
  },
}));

vi.mock('../store/useAppSettingsStore', () => ({
  useAppSettingsStore: {
    getState: vi.fn(() => ({
      saveDraft: vi.fn(),
      resetDraft: vi.fn(),
    })),
  },
}));

describe('workspaceSaveActions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('treats dialogue tabs as saveable workspace tabs', async () => {
    const { canSaveWorkspaceTab } = await import('./workspaceSaveActions');

    const dialogueTab: WorkspaceTab = {
      id: 'dialogues',
      document: {
        kind: 'dialogues',
        label: 'Dialogues',
        saveUnitId: 'dialogues',
      },
    };

    expect(canSaveWorkspaceTab(dialogueTab)).toBe(true);
  });

  it('delegates saving to a registered tab override', async () => {
    const { registerWorkspaceTabSaveOverride, saveWorkspaceTab } =
      await import('./workspaceSaveActions');
    const saveTab = vi.fn(async () => undefined);
    const unregister = registerWorkspaceTabSaveOverride('dialogues', { saveTab });

    const dialogueTab: WorkspaceTab = {
      id: 'dialogues',
      document: {
        kind: 'dialogues',
        label: 'Dialogues',
        saveUnitId: 'dialogues',
      },
    };

    await saveWorkspaceTab(dialogueTab);

    expect(saveTab).toHaveBeenCalledWith(dialogueTab);
    unregister();
  });

  it('runs registered save-all overrides after normal dirty save units', async () => {
    const { registerWorkspaceTabSaveOverride, saveAllDirtyWorkspaceUnits } =
      await import('./workspaceSaveActions');
    const saveAll = vi.fn(async () => undefined);
    const unregister = registerWorkspaceTabSaveOverride('dialogues', { saveAll });

    await saveAllDirtyWorkspaceUnits();

    expect(saveAll).toHaveBeenCalledTimes(1);
    unregister();
  });
});
