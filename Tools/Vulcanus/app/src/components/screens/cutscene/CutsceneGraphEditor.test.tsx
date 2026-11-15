import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorDocumentFrame } from '../../common/EditorDocumentFrame';
import { FiFilm } from 'react-icons/fi';
import { EditorHistoryActions } from '../../layout/EditorHistoryActions';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { CutsceneEditor } from './CutsceneEditor';
import { useEditorStore } from '../../../store/useEditorStore';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import { useSaveStore } from '../../../lib/saveManager';
import { parseCutscene } from '../../../lib/cutscenes';
import manifest from '../../../lib/__fixtures__/cutscene-bindings.json';
import prototype from '../../../lib/__fixtures__/prototype.v2.runtime.cutscene.json';
import { theme } from '../../../theme';

const mocks = vi.hoisted(() => ({ preview: vi.fn(), nodes: [] as any[], props: {} as any }));
// Real-browser checks cover canvas gestures/Monaco; render the actual node and settings forms here.
vi.mock('@xyflow/react', () => ({
  ReactFlowProvider: ({ children }: any) => children,
  ReactFlow: ({ nodes, nodeTypes, ...props }: any) => {
    mocks.props = props;
    mocks.nodes = nodes;
    const Node = nodeTypes.cutscene;
    return (
      <div aria-label="Cutscene graph">
        {nodes.map((node: any) => (
          <Node key={node.id} {...node} />
        ))}
      </div>
    );
  },
  useReactFlow: () => ({
    getNodes: () => mocks.nodes.map((node) => ({ ...node, measured: { width: 300, height: 260 } })),
    fitView: vi.fn(),
    screenToFlowPosition: (point: unknown) => point,
  }),
  Handle: () => null,
  Background: () => null,
  Controls: () => null,
  Position: { Left: 'left', Right: 'right' },
  MarkerType: { ArrowClosed: 'arrowclosed' },
}));
vi.mock('./CutsceneGraphLuaEditor', () => ({
  default: ({ value, onChange }: any) => (
    <textarea aria-label="Lua script" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('../../common/MapPreviewPicker', () => ({
  MapPreviewPicker: (props: unknown) => {
    mocks.preview(props);
    return <div>Map preview</div>;
  },
}));
vi.mock('../../../lib/fileSystem', () => ({
  fileSystem: { saveJson: vi.fn(async () => undefined), readJson: vi.fn(async () => null) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({
    tabs: [
      {
        id: 'cutscene:' + prototype.id,
        document: {
          kind: 'cutscene',
          cutsceneId: prototype.id,
          label: 'Prototype',
          saveUnitId: 'cutscene:' + prototype.id,
        },
      },
    ],
    activeTabId: 'cutscene:' + prototype.id,
  });
  HTMLElement.prototype.scrollTo = vi.fn();
  useSaveStore.getState().reset();
  useScriptingManifestStore.setState({ path: 'C:/Unity/bindings.json', revision: -1 });
  useScriptingManifestStore
    .getState()
    .acceptUpdate({ path: 'C:/Unity/bindings.json', revision: 1, content: manifest, error: null });
  useEditorStore.setState({
    project: { id: 'game', idPrefix: 'base', tileSize: 16 } as never,
    cutscenes: [parseCutscene(prototype)],
    selectedCutsceneId: prototype.id,
    cutsceneLabels: {},
    cutsceneFolders: {},
    cutsceneLoadError: null,
    cutscenePast: {},
    cutsceneFuture: {},
    savedCutscenes: {},
    currentMap: null,
    maps: [
      {
        id: prototype.mapId,
        name: 'Map',
        layers: [],
        width: 32,
        height: 24,
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
    entityTypes: [{ id: 'base:host', displayName: 'Host definition', category: 'npc' } as never],
    dialogues: new Map([
      ['prototype_greeting', { id: 'prototype_greeting', name: 'Greeting' } as never],
    ]),
  });
});
afterEach(() => {
  cleanup();
  useSaveStore.getState().reset();
});

const mount = () =>
  render(
    <ChakraProvider theme={theme}>
      <EditorHistoryActions />
      <EditorDocumentFrame
        title="Prototype"
        resourceId={prototype.id}
        icon={FiFilm}
        layout="canvas"
      >
        <CutsceneEditor cutsceneId={prototype.id} />
      </EditorDocumentFrame>
    </ChakraProvider>,
  );
const scene = () => useEditorStore.getState().cutscenes[0];

describe('graph-only cutscene authoring', () => {
  it('preserves untouched nodes while editing, and uses current state after undo', () => {
    mount();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add node comment' })[0]);
    const before = new Map(mocks.nodes.map((n) => [n.id, n.data]));
    const entry = mocks.nodes.find((n) => n.data.authored.kind === 'entry');
    fireEvent.change(screen.getByRole('textbox', { name: 'Begin comment' }), {
      target: { value: 'Opening' },
    });
    for (const node of mocks.nodes)
      if (node.id !== entry.id) expect(node.data).toBe(before.get(node.id));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('textbox', { name: 'Begin comment' })).toHaveValue('');
    fireEvent.change(screen.getByRole('textbox', { name: 'Begin comment' }), {
      target: { value: 'Revised opening' },
    });
    expect(scene().graphs?.sequence?.nodes.find((n) => n.kind === 'entry')?.comment).toBe(
      'Revised opening',
    );
  });
  it('edits inline and standalone comments with undo, and searches categorized nodes', () => {
    mount();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add node comment' })[0]);
    fireEvent.change(screen.getByRole('textbox', { name: 'Begin comment' }), {
      target: { value: 'Establish the shot' },
    });
    expect(scene().graphs?.sequence?.nodes.find((n) => n.kind === 'entry')?.comment).toBe(
      'Establish the shot',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add node', exact: true }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search graph nodes' }), {
      target: { value: 'Comments' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Node category' }), {
      target: { value: 'Comments' },
    });
    expect(screen.queryByRole('group', { name: 'Comments' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Comment', exact: true }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Canvas comment' }), {
      target: { value: 'Wait for both actors here' },
    });
    expect(scene().graphs?.sequence?.nodes.find((n) => n.kind === 'comment')?.comment).toBe(
      'Wait for both actors here',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(scene().graphs?.sequence?.nodes.find((n) => n.kind === 'comment')?.comment).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Remove node comment' }));
    expect(
      scene().graphs?.sequence?.nodes.find((n) => n.kind === 'entry')?.comment,
    ).toBeUndefined();
  });
  it('opens ordered content as nodes without a List switch or step editor', () => {
    mount();
    expect(screen.getByLabelText('Cutscene graph')).toBeInTheDocument();
    expect(screen.getAllByText('Begin').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'List', exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add step', exact: true })).not.toBeInTheDocument();
    expect(scene().graphs).toBeUndefined();
  });
  it('persists the edited phase as a graph with undo/redo', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Auto layout', exact: true }));
    expect(scene().sequence).toEqual([]);
    expect(scene().graphs?.sequence?.nodes.some((n) => n.id === 'approach')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(scene().graphs).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(scene().sequence).toEqual([]);
    expect(screen.queryByRole('button', { name: 'List', exact: true })).not.toBeInTheDocument();
  });
  it('preserves names, transitions and variables in scene settings', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Name'), { target: { value: 'Intro' } });
    expect(useEditorStore.getState().cutsceneLabels[prototype.id]).toBe('Intro');
    fireEvent.click(dialog.getByRole('checkbox', { name: 'Show transition' }));
    expect(scene().transition?.enabled).toBe(false);
    fireEvent.click(dialog.getByRole('button', { name: 'Add variable' }));
    fireEvent.change(dialog.getByRole('textbox', { name: 'Variable 1 name' }), {
      target: { value: 'speed' },
    });
    expect(scene().variables?.[0].name).toBe('speed');
  });
  it('uses the declared Lua width even while React Flow still reports 300 pixels', () => {
    const updated = structuredClone(manifest);
    updated.modules.push({
      path: 'Test',
      methods: [
        {
          name: 'RunLua',
          parameters: [{ name: 'code', type: 'string', semanticType: 'lua', picker: 'lua' }],
          returnType: 'nil',
          writesState: true,
          action: {
            id: 'test.lua',
            displayName: 'Wide Lua',
            category: 'Test',
            description: 'A Lua editor with a wider node.',
            contexts: ['cutscene'],
            execution: 'immediate',
            phases: ['sequence'],
          },
        },
      ],
    } as never);
    useScriptingManifestStore
      .getState()
      .acceptUpdate({ path: 'C:/Unity/bindings.json', revision: 2, content: updated, error: null });
    expect(useScriptingManifestStore.getState().error).toBeNull();
    useEditorStore.getState().editCutscenes((scenes) => {
      scenes[0].sequence.push({
        id: 'wide',
        action: 'test.lua',
        arguments: { code: 'local value = 1' },
      });
    });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Auto layout', exact: true }));
    const graph = scene().graphs!.sequence!;
    const wide = graph.nodes.find((n) => n.id === 'wide')!;
    const next = graph.nodes.find(
      (n) =>
        n.id === graph.edges.find((e) => e.kind === 'execution' && e.source === wide.id)!.target,
    )!;
    expect(next.position.x - wide.position.x).toBeGreaterThanOrEqual(460 + 110);
  });
  it('preserves final facing and pixel placement controls', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /On completion/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Final positions' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByRole('combobox', { name: 'Final facing' }), {
      target: { value: 'West' },
    });
    fireEvent.click(dialog.getByRole('radio', { name: 'Pixel' }));
    fireEvent.change(dialog.getByRole('spinbutton', { name: 'Position X' }), {
      target: { value: '171' },
    });
    fireEvent.change(dialog.getByRole('spinbutton', { name: 'Position Y' }), {
      target: { value: '106' },
    });
    expect(scene().onComplete.characterPlacements[0]).toMatchObject({
      position: { x: 171, y: 106 },
      facing: 'West',
    });
    act(() => useEditorStore.getState().undoCutscene(prototype.id));
    expect(scene().onComplete.characterPlacements[0].position?.y).not.toBe(106);
  });
  it('picks final positions on the map and restores original placement', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /On completion/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Final positions' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.click(dialog.getByRole('radio', { name: 'Grid' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Pick on map' }));
    act(() => mocks.preview.mock.lastCall![0].positionPick.onPick({ x: 168, y: 104 }));
    expect(scene().onComplete.characterPlacements[0]).toEqual({
      character: 'cutscene-prototype-host-01',
      position: { x: 168, y: 104 },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Restore original' }));
    expect(scene().onComplete.characterPlacements).toEqual([]);
  });
  it('opens shared node suggestions from both a right click and an execution pin', () => {
    mount();
    const preventDefault = vi.fn();
    act(() => mocks.props.onPaneContextMenu({ clientX: 400, clientY: 250, preventDefault }));
    expect(preventDefault).toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Choose graph node' })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close node suggestions'));
    const start = mocks.nodes.find((n) => n.data.authored.kind === 'entry');
    act(() => {
      mocks.props.onConnectStart(
        {},
        { nodeId: start.id, handleId: 'exec:next', handleType: 'source' },
      );
      mocks.props.onConnectEnd({ clientX: 480, clientY: 320 }, { isValid: false, toNode: null });
    });
    fireEvent.change(screen.getByLabelText('Search graph nodes'), { target: { value: 'Wait' } });
    fireEvent.click(screen.getByRole('button', { name: 'Wait → in', exact: true }));
    expect(
      scene().graphs?.sequence?.nodes.some(
        (n) => n.kind === 'action' && n.step?.action === 'cutscene.wait',
      ),
    ).toBe(true);
    expect(
      scene().graphs?.sequence?.edges.some((e) => e.source === start.id && e.target !== 'approach'),
    ).toBe(true);
  });
});
