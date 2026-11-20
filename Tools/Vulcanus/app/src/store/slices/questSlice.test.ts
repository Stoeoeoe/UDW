import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { enableMapSet } from 'immer';
import { useEditorStore } from '../useEditorStore';
import { useWorkspaceStore } from '../useWorkspaceStore';
import { useSaveStore } from '../../lib/saveManager';
import { fileSystem, FileSystemManager } from '../../lib/fileSystem';
import { saveAllDirtyWorkspaceUnits } from '../../lib/workspaceSaveActions';
import type { Quest } from '../../types/quest';
import { graphFromQuest, withGraph } from '../../lib/questGraph.fixture';

enableMapSet();
const quest: Quest = withGraph({
  formatVersion: 1,
  id: 'base:festival_wine',
  title: 'Wine for the festival',
  description: 'The priestess needs wine.',
  steps: [
    {
      id: 'buy',
      journal: 'Buy two amphorae of wine.',
      objectives: [{ id: 'carry', kind: 'have', item: 'base:wine', count: 2, text: 'Wine' }],
    },
  ],
});
beforeEach(() => {
  useWorkspaceStore.getState().setAutosaveEnabled(false);
  useEditorStore.getState().resetQuests();
});
afterEach(() => {
  useEditorStore.getState().resetQuests();
  vi.restoreAllMocks();
  delete (window as unknown as { ipcRenderer?: unknown }).ipcRenderer;
});

describe('quest saving', () => {
  it('checks on save, where unknown content only warns, and then holds what it wrote', async () => {
    const save = vi.spyOn(fileSystem, 'saveJson').mockResolvedValue();
    useEditorStore.setState({ items: [] });
    await useEditorStore.getState().addQuest(quest);
    expect(useEditorStore.getState().questIssues[quest.id]).toEqual({
      errors: [],
      warnings: ['buy.carry: unknown item base:wine.'],
    });
    const editorGraph = graphFromQuest({ ...quest, onComplete: 'local reward = 5' });
    useEditorStore.getState().updateQuest(quest.id, { editorGraph });
    expect(useEditorStore.getState().quests[0].onComplete).toBeUndefined();
    await useEditorStore.getState().saveQuest(quest.id);
    const { $schema, ...written } = save.mock.calls
      .filter((c) => c[1].endsWith('.quest.json'))
      .at(-1)![2] as Quest & { $schema: string };
    expect($schema).toBeDefined();
    expect(written.onComplete).toBe('do\nlocal reward = 5\nend');
    expect(useEditorStore.getState().quests[0]).toEqual(written);
  });
  it('compiles graph hooks at save and marks the authored source clean without rescheduling', async () => {
    const save = vi.spyOn(fileSystem, 'saveJson').mockResolvedValue();
    await useEditorStore.getState().addQuest(quest);
    const editorGraph = graphFromQuest({ ...quest, onComplete: 'local reward = 5' });
    useEditorStore.getState().updateQuest(quest.id, { editorGraph });
    await useEditorStore.getState().saveQuest(quest.id);
    expect(save.mock.calls.filter((c) => c[1].endsWith('.quest.json')).at(-1)?.[2]).toMatchObject({
      onComplete: 'do\nlocal reward = 5\nend',
      editorGraph,
    });
    expect(useSaveStore.getState().saveUnits[`quest:${quest.id}`].dirty).toBe(false);
    useEditorStore.getState().updateQuest(quest.id, { editorGraph: { ...editorGraph, edges: [] } });
    save.mockClear();
    await useEditorStore.getState().saveQuest(quest.id);
    expect(save).not.toHaveBeenCalled();
    expect(useSaveStore.getState().saveUnits[`quest:${quest.id}`].status).toBe('error');
  });
  it('writes source and i18n separately and keeps a failed export dirty for retry', async () => {
    const save = vi.spyOn(fileSystem, 'saveJson').mockResolvedValue();
    await useEditorStore.getState().addQuest(quest);
    expect(save.mock.calls.map((call) => call[1])).toEqual([
      'base:festival_wine.quest.json',
      'base:festival_wine.i18n.json',
    ]);
    expect(save.mock.calls[1][2]).toMatchObject({
      questId: quest.id,
      messages: expect.arrayContaining([
        { msgKey: 'quest.base:festival_wine.buy.carry.text', text: 'Wine' },
      ]),
    });
    useEditorStore.getState().updateQuest(quest.id, { title: 'Festival wine' });
    save.mockImplementation(async (_folder, filename) => {
      if (filename.endsWith('.i18n.json')) throw new Error('Disk full');
    });
    await useEditorStore.getState().saveQuest(quest.id);
    expect(useSaveStore.getState().saveUnits[`quest:${quest.id}`]).toMatchObject({
      dirty: true,
      status: 'error',
      error: 'Disk full',
    });
    save.mockResolvedValue();
    await useEditorStore.getState().saveQuest(quest.id);
    expect(useSaveStore.getState().saveUnits[`quest:${quest.id}`].dirty).toBe(false);
  });
  it('keeps invalid edits out of the import file and supports undo, redo and discard', async () => {
    const save = vi.spyOn(fileSystem, 'saveJson').mockResolvedValue();
    await useEditorStore.getState().addQuest(quest);
    save.mockClear();
    useEditorStore.getState().updateQuest(quest.id, { steps: [] });
    await useEditorStore.getState().saveQuest(quest.id);
    expect(save).not.toHaveBeenCalled();
    expect(useSaveStore.getState().saveUnits[`quest:${quest.id}`].status).toBe('error');
    useEditorStore.getState().undoQuest(quest.id);
    expect(useEditorStore.getState().quests[0]).toEqual(quest);
    expect(useSaveStore.getState().saveUnits[`quest:${quest.id}`]).toMatchObject({
      dirty: false,
      status: 'idle',
    });
    useEditorStore.getState().redoQuest(quest.id);
    expect(useEditorStore.getState().quests[0].steps).toEqual([]);
    useEditorStore.getState().discardQuest(quest.id);
    expect(useEditorStore.getState().quests[0]).toEqual(quest);
  });
  it('saves every dirty quest in Save All', async () => {
    const save = vi.spyOn(fileSystem, 'saveJson').mockResolvedValue();
    const second = { ...quest, id: 'mod:festival_wine' };
    await useEditorStore.getState().addQuest(quest);
    await useEditorStore.getState().addQuest(second);
    useEditorStore.getState().updateQuest(quest.id, { title: 'First changed' });
    useEditorStore.getState().updateQuest(second.id, { title: 'Second changed' });
    save.mockClear();
    await saveAllDirtyWorkspaceUnits();
    expect(save.mock.calls.map((call) => call[1])).toEqual([
      'base:festival_wine.quest.json',
      'base:festival_wine.i18n.json',
      'mod:festival_wine.quest.json',
      'mod:festival_wine.i18n.json',
    ]);
  });
  it('resolves a renamed source and its sidecar to matching physical filenames', async () => {
    const writes: { filename: string; data: unknown }[] = [];
    const invoke = vi.fn(async (channel: string, payload?: { filename: string; data: unknown }) => {
      if (channel === 'app:open-project')
        return {
          project: { id: 'example', name: 'Example', idPrefix: 'base' },
          projectPath: 'C:/GameDev/UrdewValley/Assets/Vulcan/0204project',
        };
      if (channel === 'app:fs-read-dir')
        return [{ filename: 'Festival Story.quest.json', data: quest }];
      if (channel === 'app:fs-write-json') writes.push(payload!);
    });
    Object.assign(window, { ipcRenderer: { invoke } });
    const fs = new FileSystemManager();
    await fs.openProject();
    expect(await fs.loadAllQuests()).toEqual([quest]);
    await fs.saveJson('quests', 'base:festival_wine.quest.json', quest);
    await fs.saveJson('quests', 'base:festival_wine.i18n.json', {
      questId: quest.id,
      messages: [],
    });
    expect(writes.map((w) => w.filename)).toEqual([
      'Festival Story.quest.json',
      'Festival Story.i18n.json',
    ]);
    expect(writes[1].data).toMatchObject({
      questId: quest.id,
      $schema: expect.stringContaining('quest-i18n.schema.json'),
    });
  });
});
