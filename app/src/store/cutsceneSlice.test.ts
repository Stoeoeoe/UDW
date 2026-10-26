import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from './useEditorStore';
import { snapshotCutscene } from './slices/cutsceneSlice';
import { useSaveStore } from '../lib/saveManager';
import { fileSystem } from '../lib/fileSystem';
import manifest from '../lib/__fixtures__/cutscene-bindings.json';
import prototype from '../lib/__fixtures__/prototype.v2.runtime.cutscene.json';
import { parseCutscene } from '../lib/cutscenes';
import { parseScriptingManifest } from '../lib/scriptingManifest';
import { useScriptingManifestStore } from './useScriptingManifestStore';
import { useAppSettingsStore } from './useAppSettingsStore';
import type { EntityType, Map as GameMap } from '../types/schema';

vi.mock('../lib/fileSystem', () => ({
  fileSystem: {
    saveJson: vi.fn(async () => undefined),
    deleteJson: vi.fn(async () => undefined),
    readJson: vi.fn(async () => null),
    loadAllCutscenes: vi.fn(async () => []),
  },
}));

const map = (): GameMap => ({
  version: 1,
  id: 'base:map-1',
  name: 'Map',
  width: 20,
  height: 20,
  layers: [],
  baseTilesetId: 'base:tiles',
  tilesetRefs: ['base:tiles'],
  entities: [
    { id: 'cutscene-prototype-host-01', typeId: 'base:host', position: [0, 0], properties: {} },
  ],
  spatialPrimitives: {
    anchors: [{ id: 'prototype-meeting', name: 'Meeting', position: [16, 16], tags: [] }],
  },
});

describe('cutscene document lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useScriptingManifestStore.setState({
      path: 'C:/Unity/bindings.json',
      revision: -1,
      refresh: vi.fn(async () => parseScriptingManifest(manifest)),
    });
    useScriptingManifestStore.getState().acceptUpdate({
      path: 'C:/Unity/bindings.json',
      revision: 1,
      content: manifest,
      error: null,
    });
    useSaveStore.getState().reset();
    useEditorStore.setState({
      cutscenes: [parseCutscene(prototype)],
      cutsceneLabels: {},
      cutsceneFolders: {},
      cutscenePast: {},
      cutsceneFuture: {},
      cutsceneLoadError: null,
      savedCutscenes: {},
      selectedCutsceneId: prototype.id,
      maps: [map()],
      currentMap: null,
      entityTypes: [{ id: 'base:host', category: 'npc', displayName: 'Host' } as EntityType],
      dialogues: new Map([['prototype_greeting', { id: 'prototype_greeting' } as never]]),
    });
    useEditorStore.setState({
      savedCutscenes: { [prototype.id]: snapshotCutscene(useEditorStore.getState(), prototype.id) },
    });
    vi.mocked(fileSystem.readJson).mockResolvedValue(null);
  });

  function addSavedSibling() {
    const sibling = { ...parseCutscene(prototype), id: 'base:second' };
    useEditorStore.setState((state) => ({
      cutscenes: [...state.cutscenes, sibling],
      cutsceneLabels: { ...state.cutsceneLabels, [sibling.id]: 'Saved sibling' },
    }));
    useEditorStore.setState((state) => ({
      savedCutscenes: {
        ...state.savedCutscenes,
        [sibling.id]: snapshotCutscene(state, sibling.id),
      },
    }));
    return sibling.id;
  }

  it('saves only the requested file even when another file is invalid and has unsaved metadata', async () => {
    const sibling = addSavedSibling();
    useEditorStore.getState().editCutscenes((documents, labels, folders) => {
      documents.find((scene) => scene.id === sibling)!.sequence[0].arguments.actor = 'missing';
      labels[sibling] = 'Unsaved sibling label';
      folders[sibling] = 'Unsaved folder';
      labels[prototype.id] = 'Saved current label';
    });
    await useEditorStore.getState().saveCutscene(prototype.id);
    const sources = vi
      .mocked(fileSystem.saveJson)
      .mock.calls.filter((call) => call[0] === 'cutscenes');
    expect(sources).toHaveLength(1);
    expect(sources[0][1]).toBe(`${prototype.id}.runtime.cutscene.json`);
    expect(fileSystem.saveJson).toHaveBeenCalledWith('', 'cutscene-editor.json', {
      labels: { [prototype.id]: 'Saved current label', [sibling]: 'Saved sibling' },
      folders: {},
    });
    expect(useSaveStore.getState().saveUnits[`cutscene:${prototype.id}`].dirty).toBe(false);
    expect(useSaveStore.getState().saveUnits[`cutscene:${sibling}`].dirty).toBe(true);
    expect(fileSystem.deleteJson).not.toHaveBeenCalled();
  });

  it('discards and undoes one file without reverting edits or history in another', () => {
    const sibling = addSavedSibling();
    useEditorStore.getState().editCutscenes((documents) => {
      documents[0].allowSkip = false;
    });
    useEditorStore.getState().editCutscenes((documents) => {
      documents.find((scene) => scene.id === sibling)!.allowSkip = false;
    });
    useEditorStore.getState().undoCutscene(prototype.id);
    expect(useEditorStore.getState().cutscenes[0].allowSkip).toBe(true);
    expect(
      useEditorStore.getState().cutscenes.find((scene) => scene.id === sibling)!.allowSkip,
    ).toBe(false);
    useEditorStore.getState().redoCutscene(prototype.id);
    useEditorStore.getState().discardCutscene(prototype.id);
    expect(useEditorStore.getState().cutscenes[0].allowSkip).toBe(true);
    expect(useEditorStore.getState().cutscenePast[prototype.id]).toBeUndefined();
    expect(useSaveStore.getState().saveUnits[`cutscene:${sibling}`].dirty).toBe(true);
    useEditorStore.getState().undoCutscene(sibling);
    expect(
      useEditorStore.getState().cutscenes.find((scene) => scene.id === sibling)!.allowSkip,
    ).toBe(true);
    expect(useSaveStore.getState().saveUnits[`cutscene:${sibling}`].dirty).toBe(false);
  });

  it('does not apply a pending sibling deletion when saving the current file', async () => {
    const sibling = addSavedSibling();
    useEditorStore.getState().deleteCutscene(sibling);
    await useEditorStore.getState().saveCutscene(prototype.id);
    expect(fileSystem.deleteJson).not.toHaveBeenCalled();
    expect(useSaveStore.getState().saveUnits[`cutscene:${sibling}`].dirty).toBe(true);
    await useEditorStore.getState().saveCutscene(sibling);
    expect(fileSystem.deleteJson).toHaveBeenCalledExactlyOnceWith(
      'cutscenes',
      `${sibling}.runtime.cutscene.json`,
    );
  });

  it('merges per-file editor metadata when two saves are requested together', async () => {
    const sibling = addSavedSibling();
    useEditorStore.getState().editCutscenes((_documents, labels) => {
      labels[prototype.id] = 'First';
      labels[sibling] = 'Second';
    });
    await Promise.all([
      useEditorStore.getState().saveCutscene(prototype.id),
      useEditorStore.getState().saveCutscene(sibling),
    ]);
    expect(fileSystem.saveJson).toHaveBeenLastCalledWith('', 'cutscene-editor.json', {
      labels: { [prototype.id]: 'First', [sibling]: 'Second' },
      folders: {},
    });
  });

  it('uses the normal autosave preference and saves only the edited file', async () => {
    const sibling = addSavedSibling();
    const settings = useAppSettingsStore.getState().savedSettings;
    vi.useFakeTimers();
    try {
      useAppSettingsStore.setState({ savedSettings: { ...settings, autosaveEnabled: true } });
      useEditorStore.getState().editCutscenes((documents) => {
        documents.find((scene) => scene.id === sibling)!.allowSkip = false;
      });
      expect(fileSystem.saveJson).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000);
      const sources = vi
        .mocked(fileSystem.saveJson)
        .mock.calls.filter((call) => call[0] === 'cutscenes');
      expect(sources).toHaveLength(1);
      expect(sources[0][1]).toBe(`${sibling}.runtime.cutscene.json`);
    } finally {
      useAppSettingsStore.setState({ savedSettings: settings });
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('cancels pending cutscene autosaves when leaving or reloading a project', async () => {
    const settings = useAppSettingsStore.getState().savedSettings;
    vi.useFakeTimers();
    try {
      useAppSettingsStore.setState({ savedSettings: { ...settings, autosaveEnabled: true } });
      useEditorStore.getState().editCutscenes((documents) => {
        documents[0].allowSkip = false;
      });
      useEditorStore.getState().resetCutscenes();
      await vi.advanceTimersByTimeAsync(1000);
      expect(fileSystem.saveJson).not.toHaveBeenCalled();
      expect(useSaveStore.getState().saveUnits[`cutscene:${prototype.id}`].dirty).toBe(false);
    } finally {
      useAppSettingsStore.setState({ savedSettings: settings });
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('keeps beat identities through edits, duplication, reorder, delete, undo and redo', () => {
    const store = useEditorStore.getState();
    store.editCutscenes((draft, labels) => {
      labels[`${prototype.id}/approach`] = 'Walk over';
      const s = draft[0];
      s.sequence[0].arguments.destination = 'other-anchor';
      s.sequence.push({ ...s.sequence[0], id: 'copy', arguments: { ...s.sequence[0].arguments } });
      s.sequence.reverse();
    });
    expect(useEditorStore.getState().cutscenes[0].sequence.map((s) => s.id)).toEqual([
      'copy',
      'talk',
      'greet',
      'approach',
    ]);
    store.undoCutscene();
    expect(useEditorStore.getState().cutscenes[0]).toEqual(prototype);
    expect(useEditorStore.getState().cutsceneLabels).toEqual({});
    store.redoCutscene();
    expect(useEditorStore.getState().cutsceneLabels[`${prototype.id}/approach`]).toBe('Walk over');
    store.editCutscenes((draft) => {
      draft[0].sequence.splice(0, 1);
    });
    expect(useEditorStore.getState().cutsceneFuture[prototype.id]).toHaveLength(0);
    expect(useSaveStore.getState().saveUnits[`cutscene:${prototype.id}`].dirty).toBe(true);
  });

  it('validates the requested file before writing and keeps failures dirty', async () => {
    useEditorStore.getState().editCutscenes((draft) => {
      draft.push({
        ...parseCutscene(prototype),
        id: 'base:second',
        sequence: [
          { id: 'bad', action: 'actors.face', arguments: { actor: 'missing', target: 'player' } },
        ],
      });
    });
    await expect(useEditorStore.getState().saveCutscene('base:second')).rejects.toThrow(
      'base:second',
    );
    expect(fileSystem.saveJson).not.toHaveBeenCalled();
    expect(fileSystem.deleteJson).not.toHaveBeenCalled();
    expect(useSaveStore.getState().saveUnits['cutscene:base:second']).toMatchObject({
      dirty: true,
      status: 'error',
    });
  });

  it('exports a second cutscene without registration and saves labels outside runtime sources', async () => {
    useEditorStore.getState().editCutscenes((draft, labels) => {
      draft.push({ ...parseCutscene(prototype), id: 'base:second' });
      labels['base:second'] = 'A second scene';
    });
    await useEditorStore.getState().saveCutscene('base:second');
    expect(fileSystem.saveJson).toHaveBeenCalledWith(
      'schemas',
      'cutscene.schema.json',
      expect.any(Object),
    );
    expect(fileSystem.saveJson).toHaveBeenCalledWith(
      'cutscenes',
      'base:second.runtime.cutscene.json',
      expect.objectContaining({ id: 'base:second', onComplete: prototype.onComplete }),
    );
    const runtime = vi
      .mocked(fileSystem.saveJson)
      .mock.calls.filter((call) => call[0] === 'cutscenes');
    expect(runtime).toHaveLength(1);
    expect(JSON.stringify(runtime)).not.toContain('A second scene');
    expect(fileSystem.saveJson).toHaveBeenCalledWith('', 'cutscene-editor.json', {
      labels: { 'base:second': 'A second scene' },
      folders: {},
    });
    expect(useSaveStore.getState().saveUnits['cutscene:base:second'].dirty).toBe(false);
  });

  it('rejects ineligible completion steps without executing mutations or writing sources', async () => {
    useEditorStore.getState().editCutscenes((draft) => {
      draft[0].onComplete.steps = [
        { id: 'invalid-completion', action: 'cutscene.wait', arguments: { seconds: 0 } },
      ];
    });
    await expect(useEditorStore.getState().saveCutscene(prototype.id)).rejects.toThrow(
      'not allowed in completion',
    );
    expect(fileSystem.saveJson).not.toHaveBeenCalled();
  });

  it('only removes deleted sources at export and allows undoing deletion first', async () => {
    const store = useEditorStore.getState();
    store.editCutscenes((draft) => {
      draft.splice(0, 1);
    });
    expect(fileSystem.deleteJson).not.toHaveBeenCalled();
    store.undoCutscene();
    await store.saveCutscene(prototype.id);
    expect(fileSystem.deleteJson).not.toHaveBeenCalled();
    store.editCutscenes((draft) => {
      draft.splice(0, 1);
    });
    await store.saveCutscene(prototype.id);
    expect(fileSystem.deleteJson).toHaveBeenCalledWith(
      'cutscenes',
      `${prototype.id}.runtime.cutscene.json`,
    );
  });

  it('does not write with a missing or incompatible current manifest', async () => {
    useScriptingManifestStore.setState({
      refresh: vi.fn(async () => {
        throw new Error('Invalid Lua manifest version');
      }),
    });
    await expect(useEditorStore.getState().saveCutscene(prototype.id)).rejects.toThrow('manifest');
    expect(fileSystem.saveJson).not.toHaveBeenCalled();
  });

  it('blocks export of trigger references to deleted cutscenes', async () => {
    const target = map();
    target.spatialPrimitives!.triggers = [
      {
        id: 'zone',
        shape: 'rectangle',
        position: [1, 2],
        size: [3, 4],
        type: 'cutscene',
        cutsceneId: prototype.id,
      },
    ];
    useEditorStore.setState({ maps: [target] });
    useEditorStore.getState().editCutscenes((draft) => {
      draft.splice(0, 1);
    });
    await expect(useEditorStore.getState().saveCutscene(prototype.id)).rejects.toThrow(
      'Trigger zone',
    );
    expect(fileSystem.deleteJson).not.toHaveBeenCalled();
  });

  it('reloads sources and separate labels when discarding edits', async () => {
    vi.mocked(fileSystem.loadAllCutscenes).mockResolvedValue([parseCutscene(prototype)]);
    vi.mocked(fileSystem.readJson).mockResolvedValue({ labels: { [prototype.id]: 'Saved title' } });
    useEditorStore.getState().editCutscenes((draft) => {
      draft[0].sequence.reverse();
    });
    await useEditorStore.getState().loadCutscenes();
    expect(useEditorStore.getState().cutscenes[0]).toEqual(prototype);
    expect(useEditorStore.getState().cutsceneLabels[prototype.id]).toBe('Saved title');
    expect(useEditorStore.getState().cutscenePast).toEqual({});
    expect(useSaveStore.getState().saveUnits[`cutscene:${prototype.id}`]).toMatchObject({
      dirty: false,
      status: 'idle',
    });
  });

  it('keeps malformed sources visible as a load error and blocks overwriting them', async () => {
    vi.mocked(fileSystem.loadAllCutscenes).mockRejectedValueOnce(
      new Error('unknown source field: outcome'),
    );
    await expect(useEditorStore.getState().loadCutscenes()).rejects.toThrow('outcome');
    expect(useEditorStore.getState().cutsceneLoadError).toContain('outcome');
    await expect(useEditorStore.getState().saveCutscene(prototype.id)).rejects.toThrow('outcome');
    expect(fileSystem.saveJson).not.toHaveBeenCalled();
  });

  it.each(['rectangle', 'polygon'] as const)(
    'retains %s trigger geometry while switching from a location link',
    (shape) => {
      vi.useFakeTimers();
      try {
        const target = map();
        const trigger = {
          id: 'zone',
          shape,
          position: [32, 48] as [number, number],
          size: [16, 32] as [number, number],
          points: [
            [32, 48],
            [48, 48],
            [48, 80],
          ] as [number, number][],
          type: 'locationLinkTrigger' as const,
        };
        target.spatialPrimitives!.triggers = [trigger];
        target.locationLinks = [
          {
            id: 'link',
            triggerId: 'zone',
            targetMapId: target.id,
            targetAnchorId: 'prototype-meeting',
          },
        ];
        useEditorStore.setState({ currentMap: target });
        useEditorStore
          .getState()
          .updateTrigger('zone', { type: 'cutscene', cutsceneId: prototype.id }, true);
        const updated = useEditorStore.getState().currentMap!;
        expect(updated.spatialPrimitives!.triggers![0]).toEqual({
          ...trigger,
          type: 'cutscene',
          cutsceneId: prototype.id,
        });
        expect(updated.locationLinks).toEqual([]);
        expect(() =>
          useEditorStore.getState().addLocationLink({
            id: 'forbidden',
            triggerId: 'zone',
            targetMapId: target.id,
            targetAnchorId: 'prototype-meeting',
          }),
        ).toThrow('cannot also be a location link');
        expect(() =>
          useEditorStore.getState().updateTrigger('zone', { cutsceneId: 'base:missing' }, true),
        ).toThrow('belonging to this map');
      } finally {
        vi.clearAllTimers();
        vi.useRealTimers();
      }
    },
  );
});
