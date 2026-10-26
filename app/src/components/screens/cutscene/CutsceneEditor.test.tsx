import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CutsceneEditor } from './CutsceneEditor';
import { useEditorStore, runEditorHistoryCommand } from '../../../store/useEditorStore';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { useSaveStore } from '../../../lib/saveManager';
import { fileSystem } from '../../../lib/fileSystem';
import { parseCutscene } from '../../../lib/cutscenes';
import { parseScriptingManifest } from '../../../lib/scriptingManifest';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import manifest from '../../../lib/__fixtures__/cutscene-bindings.json';
import unityBindings from '../../../lib/__fixtures__/unity-bindings-v2.json';
import positionMethod from '../../../lib/__fixtures__/position-action.json';
import prototype from '../../../lib/__fixtures__/prototype.v2.runtime.cutscene.json';
import { theme } from '../../../theme';
import { saveWorkspaceTab } from '../../../lib/workspaceSaveActions';
import { createEditorResourceDocument } from '../../../lib/editorResourceTypes';

const { previewProps } = vi.hoisted(() => ({ previewProps: vi.fn() }));
vi.mock('../../common/MapPreviewPicker', () => ({
  MapPreviewPicker: (props: unknown) => {
    previewProps(props);
    return <div>Map preview</div>;
  },
}));
vi.mock('../../../lib/fileSystem', () => ({
  fileSystem: {
    saveJson: vi.fn(async () => undefined),
    deleteJson: vi.fn(async () => undefined),
    readJson: vi.fn(async () => null),
  },
}));

describe('cutscene authoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollTo = vi.fn();
    useWorkspaceStore.getState().resetWorkspace();
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
    vi.mocked(fileSystem.readJson).mockResolvedValue(manifest);
    useEditorStore.setState({
      project: { id: 'game', idPrefix: 'base', tileSize: 16 } as never,
      cutscenes: [parseCutscene(prototype)],
      cutsceneLabels: {},
      cutsceneFolders: {},
      selectedCutsceneId: prototype.id,
      cutsceneLoadError: null,
      cutscenePast: {},
      cutsceneFuture: {},
      maps: [
        {
          id: prototype.mapId,
          name: 'Map',
          layers: [],
          entities: [
            {
              id: 'cutscene-prototype-host-01',
              typeId: 'base:host',
              position: [32, 48],
              properties: {},
            },
          ],
          spatialPrimitives: {
            anchors: [{ id: 'prototype-meeting', name: 'Meeting', position: [64, 80], tags: [] }],
          },
        } as never,
      ],
      currentMap: null,
      entityTypes: [{ id: 'base:host', displayName: 'Host definition', category: 'npc' } as never],
      dialogues: new Map([
        ['prototype_greeting', { id: 'prototype_greeting', name: 'Greeting' } as never],
      ]),
      savedCutscenes: {},
    });
  });

  const mount = (id = prototype.id) =>
    render(
      <ChakraProvider theme={theme}>
        <CutsceneEditor cutsceneId={id} />
      </ChakraProvider>,
    );

  it('updates the shared insertion palette while the manifest changes', async () => {
    mount();
    expect(screen.queryByRole('button', { name: /import.*manifest/i })).not.toBeInTheDocument();
    const changed = structuredClone(manifest);
    changed.modules[0].methods[0].action!.displayName = 'Updated face action';
    act(() =>
      useScriptingManifestStore.getState().acceptUpdate({
        path: 'C:/Unity/bindings.json',
        revision: 2,
        content: changed,
        error: null,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add step', exact: true }));
    expect(await screen.findByRole('button', { name: 'Updated face action' })).toBeInTheDocument();
  });

  it('opens the requested document without another resource sidebar', () => {
    useEditorStore.setState({
      cutscenes: [parseCutscene(prototype), { ...parseCutscene(prototype), id: 'base:second' }],
      cutsceneLabels: { 'base:second': 'Second scene' },
    });
    const view = (id: string) => (
      <ChakraProvider theme={theme}>
        <CutsceneEditor cutsceneId={id} />
      </ChakraProvider>
    );
    const { rerender } = render(view('base:second'));
    expect(screen.getByDisplayValue('base:second')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sequence' })).not.toContainElement(
      screen.getByRole('region', { name: 'Map preview' }),
    );
    expect(screen.getByRole('region', { name: 'Map preview' })).toContainElement(
      screen.getByText('Map preview'),
    );
    expect(screen.queryByText('Walk an existing actor to a map anchor.')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search cutscenes...')).not.toBeInTheDocument();
    rerender(view(prototype.id));
    expect(screen.getByDisplayValue(prototype.id)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('base:second')).not.toBeInTheDocument();
  });

  it('selects compact steps in the Inspector and supports global history after duplicate/reorder', async () => {
    useWorkspaceStore
      .getState()
      .openDocument(
        createEditorResourceDocument({ type: 'cutscene', id: prototype.id, name: 'Intro' }),
        { pin: true },
      );
    const user = userEvent.setup();
    mount();
    expect(screen.queryByRole('button', { name: 'Undo', exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Redo', exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Cutscene' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Step 1 actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate step' }));
    const copy = useEditorStore.getState().cutscenes[0].sequence[1];
    expect(copy.id).not.toBe('approach');
    expect(copy.arguments).toEqual(prototype.sequence[0].arguments);
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: 'Duplicate step' })).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Step 1 actions' })).toHaveFocus(),
    );
    await user.click(screen.getByRole('button', { name: 'Step 2 actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Move down' }));
    expect(useEditorStore.getState().cutscenes[0].sequence[2].id).toBe(copy.id);
    act(() => {
      expect(runEditorHistoryCommand('undo', document.body)).toBe(true);
    });
    expect(useEditorStore.getState().cutscenes[0].sequence[1].id).toBe(copy.id);
    act(() => {
      expect(runEditorHistoryCommand('redo', document.body)).toBe(true);
    });
    expect(useEditorStore.getState().cutscenes[0].sequence[2].id).toBe(copy.id);
  }, 15000);

  it('routes global history to the active document and leaves text editing alone', () => {
    const second = { ...parseCutscene(prototype), id: 'base:second' };
    useEditorStore.setState({ cutscenes: [parseCutscene(prototype), second] });
    useEditorStore.getState().editCutscenes((draft) => {
      draft[0].allowSkip = false;
      draft[1].allowSkip = false;
    });
    useWorkspaceStore
      .getState()
      .openDocument(
        createEditorResourceDocument({ type: 'cutscene', id: second.id, name: 'Second' }),
        { pin: true },
      );
    const input = document.createElement('input');
    expect(runEditorHistoryCommand('undo', input)).toBe(false);
    expect(useEditorStore.getState().cutscenes[1].allowSkip).toBe(false);
    expect(runEditorHistoryCommand('undo', document.body)).toBe(true);
    expect(useEditorStore.getState().cutscenes[1].allowSkip).toBe(true);
    expect(useEditorStore.getState().cutscenes[0].allowSkip).toBe(false);
  });

  it('edits scene settings and completion separately while saving only this file', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'An editor-only title' } });
    expect(screen.queryByLabelText('Completion actions (Lua)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'On completion', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore original' }));
    expect(useEditorStore.getState().cutscenes[0].onComplete.actorPlacements).toEqual([]);
    expect(screen.queryByRole('button', { name: /validate.*export/i })).not.toBeInTheDocument();
    await act(async () => {
      await saveWorkspaceTab({
        id: `cutscene:${prototype.id}`,
        document: createEditorResourceDocument({
          type: 'cutscene',
          id: prototype.id,
          name: 'Intro',
        }),
      });
    });
    await waitFor(() =>
      expect(fileSystem.saveJson).toHaveBeenCalledWith(
        'cutscenes',
        `${prototype.id}.runtime.cutscene.json`,
        expect.objectContaining({ onComplete: { steps: [], actorPlacements: [] } }),
      ),
    );
    expect(fileSystem.saveJson).toHaveBeenCalledWith('', 'cutscene-editor.json', {
      labels: { [prototype.id]: 'An editor-only title' },
      folders: {},
    });
  });

  it('inserts a manifest-defined step between existing steps and selects its required fields', async () => {
    mount();
    fireEvent.click(screen.getAllByRole('button', { name: '+ insert', exact: true })[1]);
    fireEvent.click(await screen.findByRole('button', { name: 'Move to anchor', exact: true }));
    const step = useEditorStore.getState().cutscenes[0].sequence[1];
    expect(Object.keys(step.arguments)).toEqual(['actor', 'destination']);
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    expect(screen.getAllByText(/Must not be blank/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('actor')).toBeInTheDocument();
    expect(screen.getByLabelText('destination')).toBeInTheDocument();
  });

  it('updates accumulated overlays per selected step and refreshes them when preview metadata changes', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Host definition.*Meeting/ }));
    expect(screen.getByText('After step 1')).toBeInTheDocument();
    expect(previewProps.mock.lastCall![0].overlays).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'segment', from: [2, 3], to: [4, 5], label: '1' }),
        expect.objectContaining({ kind: 'actor', ghost: true, position: [2, 3] }),
        expect.objectContaining({ kind: 'actor', position: [4, 5], label: 'Host definition' }),
      ]),
    );
    const changed = structuredClone(manifest);
    changed.modules[0].methods[1].action!.preview.spatialState = 'unknown';
    act(() =>
      useScriptingManifestStore.getState().acceptUpdate({
        path: 'C:/Unity/bindings.json',
        revision: 2,
        content: changed,
        error: null,
      }),
    );
    expect(
      previewProps.mock.lastCall![0].overlays.filter(
        (overlay: { kind: string; ghost?: boolean }) => overlay.kind === 'actor' && !overlay.ghost,
      ),
    ).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Greeting', exact: true }));
    expect(screen.getByText('After step 3')).toBeInTheDocument();
    expect(screen.getByText('Dialogue: Greeting')).toBeInTheDocument();
    expect(screen.getAllByText(/Spatial state is unknown/).length).toBeGreaterThan(0);
  });

  it('explains facing the runtime player and separates it from earlier movement arrows', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Host definition.*Player/ }));
    expect(screen.getByText('Host definition faces Player')).toBeInTheDocument();
    expect(screen.getByText(/Player position is determined at runtime/)).toBeInTheDocument();
    expect(
      previewProps.mock.lastCall![0].overlays.some((o: { kind: string }) => o.kind === 'segment'),
    ).toBe(false);
    expect(previewProps.mock.lastCall![0].overlays).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Host definition (turning)' })]),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show movement history' }));
    expect(
      previewProps.mock.lastCall![0].overlays.some((o: { kind: string }) => o.kind === 'segment'),
    ).toBe(true);
  });

  it('authors numeric manifest arguments and saves decimals and zero as JSON numbers', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add step', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Wait', exact: true }));
    expect(screen.getByRole('spinbutton', { name: 'seconds' })).not.toBeDisabled();
    expect(useEditorStore.getState().cutscenes[0].sequence[3].arguments.seconds).toBe('');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'seconds' }), {
      target: { value: '0.5' },
    });
    expect(useEditorStore.getState().cutscenes[0].sequence[3].arguments.seconds).toBe(0.5);
    await act(async () => {
      await useEditorStore.getState().saveCutscene(prototype.id);
    });
    expect(fileSystem.saveJson).toHaveBeenCalledWith(
      'cutscenes',
      `${prototype.id}.runtime.cutscene.json`,
      expect.objectContaining({
        sequence: expect.arrayContaining([
          expect.objectContaining({ action: 'cutscene.wait', arguments: { seconds: 0.5 } }),
        ]),
      }),
    );
    fireEvent.change(screen.getByRole('spinbutton', { name: 'seconds' }), {
      target: { value: '0' },
    });
    expect(useEditorStore.getState().cutscenes[0].sequence[3].arguments.seconds).toBe(0);
    expect(screen.getByRole('button', { name: '0', exact: true })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'seconds' }), {
      target: { value: '' },
    });
    expect(useEditorStore.getState().cutscenes[0].sequence[3].arguments.seconds).toBe('');
    await act(async () => {
      await expect(useEditorStore.getState().saveCutscene(prototype.id)).rejects.toThrow();
    });
  });

  it('selects resources by description and preserves unresolved IDs across manifest updates', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add step', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Play animation', exact: true }));
    expect(screen.getByRole('option', { name: /PassOut/ })).toHaveValue('base:pass-out');
    fireEvent.change(screen.getByLabelText('actor'), { target: { value: 'player' } });
    fireEvent.change(screen.getByLabelText('animation'), { target: { value: 'base:pass-out' } });
    expect(useEditorStore.getState().cutscenes[0].sequence[3].arguments).toEqual({
      actor: 'player',
      animation: 'base:pass-out',
    });
    await act(async () => {
      await useEditorStore.getState().saveCutscene(prototype.id);
    });
    expect(fileSystem.saveJson).toHaveBeenCalledWith(
      'cutscenes',
      `${prototype.id}.runtime.cutscene.json`,
      expect.objectContaining({
        sequence: expect.arrayContaining([
          expect.objectContaining({
            action: 'actors.playAnimation',
            arguments: { actor: 'player', animation: 'base:pass-out' },
          }),
        ]),
      }),
    );
    const changed = structuredClone(manifest);
    changed.resources.animation[0].description = 'Updated resource description';
    act(() =>
      useScriptingManifestStore.getState().acceptUpdate({
        path: 'C:/Unity/bindings.json',
        revision: 2,
        content: changed,
        error: null,
      }),
    );
    expect(screen.getByRole('option', { name: /Updated resource description/ })).toHaveValue(
      'base:pass-out',
    );
    changed.resources.animation = [];
    act(() =>
      useScriptingManifestStore.getState().acceptUpdate({
        path: 'C:/Unity/bindings.json',
        revision: 3,
        content: changed,
        error: null,
      }),
    );
    expect(screen.getByLabelText('animation')).toHaveValue('base:pass-out');
    expect(screen.getAllByText(/Missing animation resource: base:pass-out/).length).toBeGreaterThan(
      0,
    );
    useScriptingManifestStore.setState({
      refresh: vi.fn(async () => parseScriptingManifest(changed)),
    });
    await act(async () => {
      await expect(useEditorStore.getState().saveCutscene(prototype.id)).rejects.toThrow(
        'Missing animation resource',
      );
    });
    act(() =>
      useScriptingManifestStore.getState().acceptUpdate({
        path: 'C:/Unity/bindings.json',
        revision: 4,
        content: { ...changed, resources: {} },
        error: null,
      }),
    );
    expect(screen.getAllByText(/Missing resource list "animation"/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('animation')).toHaveValue('base:pass-out');
  });

  it('uses separate phase tabs and offers only permitted immediate setup actions', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Before start', exact: true }));
    expect(screen.getByText('After setup')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Step 1 actions' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Completion actions (Lua)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add setup step', exact: true }));
    expect(
      await screen.findByRole('button', { name: 'Face actor', exact: true }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Move to anchor', exact: true }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Wait', exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Face actor', exact: true }));
    const step = useEditorStore.getState().cutscenes[0].onStart![0];
    expect(step.action).toBe('actors.face');
    expect(screen.getByText('Setup step 1 of 1')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('actor'), { target: { value: 'player' } });
    fireEvent.change(screen.getByLabelText('target'), {
      target: { value: 'cutscene-prototype-host-01' },
    });
    expect(useEditorStore.getState().cutscenes[0].onStart![0].arguments.actor).toBe('player');
    fireEvent.click(screen.getByRole('button', { name: 'On completion', exact: true }));
    expect(
      screen.getByRole('button', { name: 'Add completion step', exact: true }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Completion actions (Lua)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Setup step 1 actions' })).not.toBeInTheDocument();
  });

  it('moves eligible steps between phases without changing IDs or labels, including undo/redo', async () => {
    const user = userEvent.setup();
    useEditorStore.setState({
      cutsceneLabels: { [`${prototype.id}/greet`]: 'Greeting orientation' },
    });
    mount();
    await user.click(screen.getByRole('button', { name: 'Step 1 actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Move to Before start' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Step 2 actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Move to Before start' }));
    expect(useEditorStore.getState().cutscenes[0].onStart![0].id).toBe('greet');
    expect(useEditorStore.getState().cutscenes[0].sequence.map((s) => s.id)).toEqual([
      'approach',
      'talk',
    ]);
    expect(screen.getByText('Setup step 1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Greeting orientation' })).toBeInTheDocument();
    await act(async () => {
      await useEditorStore.getState().saveCutscene(prototype.id);
    });
    expect(fileSystem.saveJson).toHaveBeenCalledWith(
      'cutscenes',
      `${prototype.id}.runtime.cutscene.json`,
      expect.objectContaining({ onStart: [prototype.sequence[1]] }),
    );
    act(() => useEditorStore.getState().undoCutscene(prototype.id));
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    expect(useEditorStore.getState().cutscenes[0].onStart).toBeUndefined();
    act(() => useEditorStore.getState().redoCutscene(prototype.id));
    expect(screen.getByText('Setup step 1 of 1')).toBeInTheDocument();
    expect(useEditorStore.getState().cutsceneLabels[`${prototype.id}/greet`]).toBe(
      'Greeting orientation',
    );
    await user.click(screen.getByRole('button', { name: 'Setup step 1 actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Move to On completion' }));
    expect(screen.getByText('Completion step 1 of 1')).toBeInTheDocument();
    expect(useEditorStore.getState().cutscenes[0].onComplete.steps[0].id).toBe('greet');
    expect(useEditorStore.getState().cutscenes[0].onStart).toEqual([]);
    await act(async () => {
      await useEditorStore.getState().saveCutscene(prototype.id);
    });
    expect(fileSystem.saveJson).toHaveBeenLastCalledWith(
      '',
      'cutscene-editor.json',
      expect.anything(),
    );
    expect(fileSystem.saveJson).toHaveBeenCalledWith(
      'cutscenes',
      `${prototype.id}.runtime.cutscene.json`,
      expect.objectContaining({
        formatVersion: 2,
        onComplete: expect.objectContaining({ steps: [prototype.sequence[1]] }),
      }),
    );
  }, 15000);

  it('authors position objects and stages map placement until confirmed, with Escape cancellation', async () => {
    const extended = {
      ...manifest,
      modules: [...manifest.modules, { path: 'PositionFixture', methods: [positionMethod] }],
    };
    useScriptingManifestStore.setState({
      refresh: vi.fn(async () => parseScriptingManifest(extended)),
    });
    act(() =>
      useScriptingManifestStore.getState().acceptUpdate({
        path: 'C:/Unity/bindings.json',
        revision: 2,
        content: extended,
        error: null,
      }),
    );
    // Validation requires actual map bounds for pixel positions.
    useEditorStore.setState({
      maps: useEditorStore.getState().maps.map((map) => ({ ...map, width: 32, height: 32 })),
    });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Before start', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Add setup step', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Place character', exact: true }));
    fireEvent.change(screen.getByLabelText('actor'), { target: { value: 'player' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Position X' }), {
      target: { value: '171' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Position Y' }), {
      target: { value: '106' },
    });
    const step = () => useEditorStore.getState().cutscenes[0].onStart![0];
    expect(step().arguments.position).toEqual({ x: 171, y: 106 });
    fireEvent.click(screen.getByRole('radio', { name: 'Pixel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick on map' }));
    expect(previewProps.mock.lastCall![0].positionPick.mode).toBe('pixel');
    act(() => previewProps.mock.lastCall![0].positionPick.onHover({ x: 180, y: 110 }));
    expect(step().arguments.position).toEqual({ x: 171, y: 106 });
    expect(previewProps.mock.lastCall![0].overlays).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'placement', position: [11.25, 6.875] }),
      ]),
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(previewProps.mock.lastCall![0].positionPick).toBeUndefined();
    expect(step().arguments.position).toEqual({ x: 171, y: 106 });
    fireEvent.click(screen.getByRole('button', { name: 'Pick on map' }));
    act(() => previewProps.mock.lastCall![0].positionPick.onPick({ x: 168, y: 104 }));
    expect(step().arguments.position).toEqual({ x: 168, y: 104 });
    expect(screen.getByRole('spinbutton', { name: 'Position X' })).toHaveValue('168');
    await act(async () => {
      await useEditorStore.getState().saveCutscene(prototype.id);
    });
    expect(fileSystem.saveJson).toHaveBeenCalledWith(
      'cutscenes',
      `${prototype.id}.runtime.cutscene.json`,
      expect.objectContaining({
        onStart: [
          expect.objectContaining({ arguments: { actor: 'player', position: { x: 168, y: 104 } } }),
        ],
      }),
    );
  });

  it('authors spawned roles with shared anchor and resource pickers, and recalculates scope', async () => {
    useScriptingManifestStore.setState({
      refresh: vi.fn(async () => parseScriptingManifest(unityBindings)),
    });
    useScriptingManifestStore.getState().acceptUpdate({
      path: 'C:/Unity/bindings.json',
      revision: 2,
      content: unityBindings,
      error: null,
    });
    const scene = parseCutscene(prototype);
    scene.onStart = [
      {
        id: 'spawn-guest',
        action: 'actors.spawn',
        arguments: {
          actor: 'guest',
          definition: 'base:cutscene-prototype-host',
          position: { anchor: 'prototype-meeting' },
        },
      },
      { id: 'face-guest', action: 'actors.face', arguments: { actor: 'guest', target: 'player' } },
    ];
    useEditorStore.setState({
      cutscenes: [scene],
      actors: [{ id: 'base:cutscene-prototype-host', name: 'Host', icon: 'H' }],
      maps: useEditorStore.getState().maps.map((m) => ({ ...m, width: 32, height: 32 })),
    });
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Before start/ }));
    fireEvent.click(screen.getByRole('button', { name: /^guest.*Host.*Meeting/ }));
    expect(screen.getByLabelText('Instance name').tagName).toBe('INPUT');
    expect(screen.getByLabelText('Character')).toHaveValue('base:cutscene-prototype-host');
    expect(screen.getByRole('option', { name: /Host/ })).toHaveValue(
      'base:cutscene-prototype-host',
    );
    expect(screen.getByRole('radio', { name: 'Anchor' })).toBeChecked();
    expect(screen.getByLabelText('Position anchor')).toHaveValue('prototype-meeting');
    fireEvent.click(screen.getByRole('radio', { name: 'Grid' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick on map' }));
    act(() => previewProps.mock.lastCall![0].positionPick.onHover({ x: 168, y: 104 }));
    expect(previewProps.mock.lastCall![0].overlays).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'placement', icon: 'H', position: [10.5, 6.5] }),
      ]),
    );
    act(() => previewProps.mock.lastCall![0].positionPick.onPick({ x: 168, y: 104 }));
    expect(useEditorStore.getState().cutscenes[0].onStart![0].arguments.position).toEqual({
      x: 168,
      y: 104,
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Anchor' }));
    fireEvent.change(screen.getByLabelText('Position anchor'), {
      target: { value: 'prototype-meeting' },
    });
    expect(useEditorStore.getState().cutscenes[0].onStart![0].arguments.position).toEqual({
      anchor: 'prototype-meeting',
    });
    fireEvent.click(screen.getByRole('button', { name: /^guest.*Player$/ }));
    expect(screen.getByLabelText('actor')).toHaveValue('guest');
    expect(screen.getAllByRole('option', { name: /guest/ }).length).toBe(2);
    act(() =>
      useEditorStore.getState().editCutscenes((draft) => {
        draft[0].onStart!.reverse();
      }),
    );
    expect(screen.getByLabelText('actor')).toHaveValue('guest');
    expect(screen.getByRole('option', { name: /Missing: guest/ })).toBeInTheDocument();
    act(() =>
      useEditorStore.getState().editCutscenes((draft) => {
        draft[0].onStart!.reverse();
        draft[0].onStart![0].arguments.actor = 'visitor';
      }),
    );
    expect(screen.getAllByRole('option', { name: /visitor/ }).length).toBe(2);
    expect(screen.getByLabelText('actor')).toHaveValue('guest');
    fireEvent.click(screen.getByRole('button', { name: 'On completion', exact: true }));
    expect(screen.getAllByRole('option', { name: /visitor/ }).length).toBeGreaterThan(0);
  }, 30000);

  it('uses project actors for spawning and suggests a unique instance name', async () => {
    useScriptingManifestStore.setState({
      refresh: vi.fn(async () => parseScriptingManifest(unityBindings)),
    });
    useScriptingManifestStore.getState().acceptUpdate({
      path: 'C:/Unity/bindings.json',
      revision: 2,
      content: unityBindings,
      error: null,
    });
    const scene = parseCutscene(prototype);
    scene.onStart = [
      {
        id: 'spawn',
        action: 'actors.spawn',
        arguments: { actor: '', definition: '', position: { anchor: 'prototype-meeting' } },
      },
    ];
    useEditorStore.setState({
      cutscenes: [scene],
      actors: [
        { id: 'base:cutscene-prototype-host', name: 'Gagaa', icon: 'G' },
        { id: 'base:player', name: 'Player', icon: 'P' },
      ],
    });
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Before start/ }));
    fireEvent.click(screen.getByRole('button', { name: /Not set.*Not set.*Meeting/ }));
    expect(screen.getByRole('option', { name: /Gagaa/ })).toBeEnabled();
    expect(screen.getByRole('option', { name: /Player/ })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Character'), {
      target: { value: 'base:cutscene-prototype-host' },
    });
    expect(screen.getByLabelText('Instance name')).toHaveValue('gagaa');
    fireEvent.change(screen.getByLabelText('Character'), { target: { value: 'base:player' } });
    expect(screen.getByLabelText('Character')).toHaveValue('base:player');
    await act(async () => {
      await useEditorStore.getState().saveCutscene(prototype.id);
    });
    expect(fileSystem.saveJson).toHaveBeenCalledWith(
      'cutscenes',
      `${prototype.id}.runtime.cutscene.json`,
      expect.objectContaining({
        onStart: [
          expect.objectContaining({
            arguments: {
              actor: 'gagaa',
              definition: 'base:player',
              position: { anchor: 'prototype-meeting' },
            },
          }),
        ],
      }),
    );

    expect(previewProps.mock.lastCall![0].overlays).toEqual(
      expect.arrayContaining([expect.objectContaining({ actorId: 'gagaa', icon: 'P' })]),
    );
    fireEvent.change(screen.getByLabelText('Character'), {
      target: { value: 'base:cutscene-prototype-host' },
    });

    expect(useEditorStore.getState().cutscenes[0].onStart![0].arguments).toEqual({
      actor: 'gagaa',
      definition: 'base:cutscene-prototype-host',
      position: { anchor: 'prototype-meeting' },
    });
    fireEvent.change(screen.getByLabelText('Instance name'), { target: { value: 'guest' } });
    fireEvent.change(screen.getByLabelText('Character'), {
      target: { value: 'base:cutscene-prototype-host' },
    });
    expect(screen.getByLabelText('Instance name')).toHaveValue('guest');
  });

  it('shows concrete completion step issues and keeps raw Lua out of all phases', async () => {
    mount();
    expect(screen.queryByText(/Live validation|Valid cutscene/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'On completion', exact: true }));
    expect(screen.queryByLabelText('Completion actions (Lua)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add completion step', exact: true }));
    expect(
      await screen.findByRole('button', { name: 'Face actor', exact: true }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Wait', exact: true })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Play animation', exact: true }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Face actor', exact: true }));
    expect(screen.getAllByText(/Must not be blank/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('actor'), {
      target: { value: 'cutscene-prototype-host-01' },
    });
    fireEvent.change(screen.getByLabelText('target'), { target: { value: 'player' } });
    expect(screen.queryByText(/Must not be blank/)).not.toBeInTheDocument();
    act(() => useEditorStore.setState({ dialogues: new Map() }));
    fireEvent.click(screen.getByRole('button', { name: /^Sequence/ }));
    expect(screen.getByText(/Missing dialogueRef/)).toBeInTheDocument();
    expect(fileSystem.saveJson).not.toHaveBeenCalled();
  });
});
