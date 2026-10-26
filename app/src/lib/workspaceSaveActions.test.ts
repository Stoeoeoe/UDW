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

  it('saves and discards only the cutscene identified by the active resource tab', async () => {
    const { saveWorkspaceTab, discardWorkspaceTabChanges } = await import('./workspaceSaveActions');
    const { useEditorStore } = await import('../store/useEditorStore');
    const state = useEditorStore.getState();
    const saveCutscene = vi.fn(async () => undefined);
    const discardCutscene = vi.fn();
    const loadCutscenes = vi.fn();
    const tab: WorkspaceTab = {
      id: 'cutscene:base:first',
      document: {
        kind: 'cutscene',
        cutsceneId: 'base:first',
        label: 'First',
        saveUnitId: 'cutscene:base:first',
      },
    };
    vi.mocked(useEditorStore.getState).mockReturnValueOnce({ ...state, saveCutscene } as never);
    await saveWorkspaceTab(tab);
    expect(saveCutscene).toHaveBeenCalledExactlyOnceWith('base:first');
    vi.mocked(useEditorStore.getState).mockReturnValueOnce({
      ...state,
      discardCutscene,
      loadCutscenes,
    } as never);
    await discardWorkspaceTabChanges(tab);
    expect(discardCutscene).toHaveBeenCalledExactlyOnceWith('base:first');
    expect(loadCutscenes).not.toHaveBeenCalled();
  });

  it('includes individual dirty cutscene files in the normal Save All pipeline', async () => {
    const { saveAllDirtyWorkspaceUnits } = await import('./workspaceSaveActions');
    const { useEditorStore } = await import('../store/useEditorStore');
    const { getDirtySaveUnitIds } = await import('./saveManager');
    const saveCutscene = vi.fn(async () => undefined);
    vi.mocked(useEditorStore.getState).mockReturnValueOnce({
      ...useEditorStore.getState(),
      saveCutscene,
    } as never);
    vi.mocked(getDirtySaveUnitIds).mockReturnValueOnce([
      'cutscene:base:first',
      'cutscene:base:second',
    ]);
    await saveAllDirtyWorkspaceUnits();
    expect(saveCutscene.mock.calls).toEqual([['base:first'], ['base:second']]);
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
