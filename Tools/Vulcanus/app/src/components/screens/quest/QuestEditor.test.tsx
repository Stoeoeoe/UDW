import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { enableMapSet } from 'immer';
import { EditorDocumentFrame } from '../../common/EditorDocumentFrame';
import { FiStar } from 'react-icons/fi';
import { QuestEditor } from './QuestEditor';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import { useEditorStore } from '../../../store/useEditorStore';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { fileSystem } from '../../../lib/fileSystem';
import { theme } from '../../../theme';
import type { Character } from '../../../types/schema';

enableMapSet();
const graph = vi.hoisted(() => ({ props: {} as any }));
vi.mock('@xyflow/react', async (original) => ({
  ...(await original<typeof import('@xyflow/react')>()),
  ReactFlowProvider: ({ children }: any) => children,
  ReactFlow: (props: any) => {
    graph.props = props;
    return (
      <div aria-label="Quest graph">
        {props.nodes.map((node: any) => {
          const Node = props.nodeTypes[node.type];
          return (
            <div key={node.id} data-node-id={node.id} onClick={() => props.onNodeClick({}, node)}>
              <Node {...node} />
            </div>
          );
        })}
      </div>
    );
  },
  useReactFlow: () => ({
    fitView: vi.fn(),
    screenToFlowPosition: (p: { x: number; y: number }) => ({ x: p.x - 20, y: p.y - 10 }),
    getZoom: () => 1,
    getNodes: () =>
      graph.props.nodes.map((n: any) => ({ ...n, measured: { width: 300, height: 220 } })),
  }),
  useNodesInitialized: () => false,
  Handle: () => null,
  Background: () => null,
  Controls: () => null,
}));

vi.mock('../scripting/LuaScriptEditor', () => ({
  LuaScriptEditor: ({
    value,
    onChange,
    documentId,
  }: {
    value: string;
    onChange: (v: string) => void;
    documentId: string;
  }) => (
    <textarea aria-label={documentId} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('../routine/DialogueSelect', () => ({
  DialogueSelect: ({ value, onChange }: { value?: string; onChange: (v?: string) => void }) => (
    <input
      aria-label="Quest dialogue"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
beforeEach(() => {
  useWorkspaceStore.getState().setAutosaveEnabled(false);
  useEditorStore.getState().resetQuests();
  useEditorStore.setState({
    characters: [{ id: 'base:fabia', name: 'Fabia' }] as Character[],
    items: [{ id: 'base:fig', name: 'Fig' }] as any,
    maps: [],
    dialogues: new Map(),
    quests: [
      {
        formatVersion: 1,
        id: 'base:festival',
        title: 'Festival',
        description: 'Help Fabia.',
        steps: [
          {
            id: 'talk',
            journal: 'Ask Fabia.',
            objectives: [
              {
                id: 'ask',
                text: 'Talk to Fabia',
                kind: 'talk',
                character: 'base:fabia',
                dialogue: 'base:festival_intro',
              },
            ],
          },
        ],
      },
    ],
  });
  useScriptingManifestStore.setState({
    manifest: {
      schemaVersion: 2,
      resources: { item: [{ id: 'base:fig', description: 'Fig' }] },
      modules: [
        {
          path: 'Inventory',
          methods: [
            {
              name: 'Give',
              writesState: true,
              parameters: [
                { name: 'itemId', type: 'string', resourceType: 'item' },
                { name: 'count', type: 'number' },
              ],
            },
          ],
        },
      ],
    },
  });
  vi.spyOn(fileSystem, 'saveJson').mockResolvedValue();
});
afterEach(() => {
  cleanup();
  useEditorStore.getState().resetQuests();
  vi.restoreAllMocks();
});
const show = () =>
  render(
    <ChakraProvider theme={theme}>
      <EditorDocumentFrame
        title="Festival"
        resourceId="base:festival"
        icon={FiStar}
        layout="sequence"
      >
        <QuestEditor questId="base:festival" />
      </EditorDocumentFrame>
    </ChakraProvider>,
  );
const addQuestNode = (label: string, source = 'step-node-0') => {
  act(() => {
    graph.props.onConnectStart({}, { nodeId: source, handleId: 'exec:next', handleType: 'source' });
    graph.props.onConnectEnd({ clientX: 450, clientY: 250 }, { isValid: false, toNode: null });
  });
  fireEvent.click(screen.getByRole('button', { name: label, exact: true }));
};

describe('quest editor', () => {
  it('changes objective kind without retaining forbidden dialogue or character fields', () => {
    show();
    fireEvent.click(screen.getByLabelText('Select objective ask'));
    fireEvent.change(screen.getByLabelText('Objective kind'), { target: { value: 'condition' } });
    const objective = useEditorStore.getState().quests[0].steps[0].objectives[0];
    expect(objective).toEqual({
      id: 'ask',
      text: 'Talk to Fabia',
      kind: 'condition',
      condition: '',
    });
    expect(screen.queryByLabelText('Quest dialogue')).toBeNull();
  });
  it('adds typed steps from the palette and edits their journal and deadline', () => {
    show();
    addQuestNode('Deliver items');
    expect(useEditorStore.getState().quests[0].steps[1].objectives[0]).toMatchObject({
      kind: 'deliver',
      count: 1,
    });
    fireEvent.change(screen.getByLabelText('Character'), { target: { value: 'base:fabia' } });
    fireEvent.change(screen.getByLabelText('Item'), { target: { value: 'base:fig' } });
    fireEvent.click(screen.getByText('Deadline'));
    fireEvent.change(screen.getByLabelText('Deadline days'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Step ID'), { target: { value: 'deliver' } });
    const quest = useEditorStore.getState().quests[0];
    expect(quest.steps[1].deadline).toEqual({ days: 2 });
    expect(
      quest.editorGraph!.nodes.find((n) => n.kind === 'step' && n.stepId === 'deliver'),
    ).toBeTruthy();
    expect(quest.steps[0].id).toBe('talk');
    act(() => useEditorStore.getState().discardQuest('base:festival'));
    expect(screen.getByText('Quest not found.')).toBeTruthy();
  });
  it('adds and removes objectives directly in the step node', () => {
    show();
    fireEvent.change(screen.getByLabelText('Add objective to talk'), { target: { value: 'have' } });
    expect(useEditorStore.getState().quests[0].steps[0].objectives.map((o) => o.kind)).toEqual([
      'talk',
      'have',
    ]);
    fireEvent.click(screen.getByLabelText('Remove objective objective-1'));
    expect(useEditorStore.getState().quests[0].steps[0].objectives.map((o) => o.id)).toEqual([
      'ask',
    ]);
  });
  it('uses shared resource and numeric fields for reward actions and saves compiled Lua', async () => {
    show();
    addQuestNode('Give');
    fireEvent.change(screen.getByLabelText('Give itemId'), { target: { value: 'base:fig' } });
    fireEvent.change(screen.getByLabelText('Give count'), { target: { value: '5' } });
    await act(async () => useEditorStore.getState().saveQuest('base:festival'));
    const saved = vi
      .mocked(fileSystem.saveJson)
      .mock.calls.find((c) => c[1].endsWith('.quest.json'))?.[2] as any;
    expect(saved.steps[0].onComplete).toBe('Inventory.Give("base:fig", 5)');
    expect(saved.editorGraph.nodes.find((n: any) => n.kind === 'action').action.arguments).toEqual({
      itemId: 'base:fig',
      count: 5,
    });
  });
  it('preserves existing Lua hooks as editable nodes rather than hidden settings fields', () => {
    useEditorStore.setState((s) => ({
      quests: [{ ...s.quests[0], onComplete: 'Inventory.Give("base:fig", 1)' }],
    }));
    show();
    const view = graph.props.nodes.find((n: any) => n.id === 'completion-script');
    act(() => graph.props.onNodeClick({}, view));
    fireEvent.change(screen.getByLabelText('base:festival/completion-script'), {
      target: { value: 'Inventory.Give("base:fig", 2)' },
    });
    expect(useEditorStore.getState().quests[0].onComplete).toContain(
      'Inventory.Give("base:fig", 2)',
    );
  });
  it('adds completion actions after the selected Complete quest node', () => {
    show();
    act(() =>
      graph.props.onNodeClick(
        {},
        graph.props.nodes.find((n: any) => n.id === 'complete'),
      ),
    );
    addQuestNode('Give', 'complete');
    fireEvent.change(screen.getByLabelText('Give itemId'), { target: { value: 'base:fig' } });
    fireEvent.change(screen.getByLabelText('Give count'), { target: { value: '1' } });
    expect(useEditorStore.getState().quests[0].onComplete).toBe('Inventory.Give("base:fig", 1)');
    expect(useEditorStore.getState().quests[0].steps[0].onComplete).toBeUndefined();
  });
  it('deletes a typed single-objective node as a step rather than leaving an empty step', () => {
    show();
    fireEvent.click(screen.getByLabelText('Select objective ask'));
    fireEvent.click(screen.getByText('Delete step'));
    expect(useEditorStore.getState().quests[0].steps).toHaveLength(0);
    expect(
      useEditorStore.getState().quests[0].editorGraph!.nodes.some((n) => n.kind === 'step'),
    ).toBe(false);
  });
  it('opens the shared searchable picker on right click at the canvas position', () => {
    show();
    const preventDefault = vi.fn();
    act(() => graph.props.onPaneContextMenu({ clientX: 420, clientY: 260, preventDefault }));
    expect(preventDefault).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Search graph nodes'), {
      target: { value: 'condition' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Wait for condition' }));
    const q = useEditorStore.getState().quests[0];
    expect(q.editorGraph!.nodes.at(-1)!.position).toEqual({ x: 400, y: 250 });
    expect(q.steps).toHaveLength(2);
  });
  it('inserts an execution-pin suggestion into the dragged wire and preserves existing step IDs', () => {
    show();
    addQuestNode('Have items', 'begin');
    const q = useEditorStore.getState().quests[0];
    const added = q.editorGraph!.nodes.find((n) => n.kind === 'step' && n.stepId !== 'talk')!;
    expect(q.editorGraph!.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'begin', target: added.id }),
        expect.objectContaining({ source: added.id, target: 'step-node-0' }),
      ]),
    );
    expect(q.steps.map((s) => s.id)).toEqual([added.stepId, 'talk']);
    expect(added.position).toEqual({ x: 430, y: 240 });
  });
  it('does not propose nodes for a completed wire connection, and Escape cancels suggestions', () => {
    show();
    act(() => {
      graph.props.onConnectStart(
        {},
        { nodeId: 'begin', handleId: 'exec:next', handleType: 'source' },
      );
      graph.props.onConnectEnd(
        { clientX: 420, clientY: 260 },
        { isValid: true, toNode: { id: 'step-node-0' } },
      );
    });
    expect(screen.queryByRole('dialog', { name: 'Choose graph node' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add node', exact: true }));
    fireEvent.keyDown(screen.getByLabelText('Search graph nodes'), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Choose graph node' })).toBeNull();
    expect(useEditorStore.getState().quests[0].editorGraph).toBeUndefined();
  });
  it('duplicates a selected quest step through the shared toolbar with fresh persistent IDs', () => {
    show();
    act(() =>
      graph.props.onNodeClick(
        {},
        graph.props.nodes.find((n: any) => n.id === 'step-node-0'),
      ),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Duplicate selection (Ctrl/Cmd+D)', exact: true }),
    );
    const q = useEditorStore.getState().quests[0];
    expect(q.steps.map((s) => s.id)).toEqual(['talk', 'step-1']);
    expect(q.steps[1].objectives[0].id).toBe('ask');
    expect(q.editorGraph!.nodes.filter((n) => n.kind === 'step').map((n) => n.stepId)).toEqual([
      'talk',
      'step-1',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete selection', exact: true }));
    expect(useEditorStore.getState().quests[0].steps.map((s) => s.id)).toEqual(['talk']);
  });
  it('shares node comments and keeps them through quest export', async () => {
    show();
    const buttons = screen.getAllByLabelText('Add node comment');
    fireEvent.click(buttons[1]);
    fireEvent.change(screen.getByLabelText('Talk to character comment'), {
      target: { value: 'Fabia introduction' },
    });
    await act(async () => useEditorStore.getState().saveQuest('base:festival'));
    expect(
      useEditorStore.getState().quests[0].editorGraph!.nodes.find((n) => n.stepId === 'talk')!
        .comment,
    ).toBe('Fabia introduction');
  });
  it('starts by itself at chosen moments, warns about the clock and keeps it through export', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByLabelText('Starts by itself'));
    expect(useEditorStore.getState().quests[0].start).toEqual({ when: [{ on: 'newDay' }] });
    fireEvent.change(screen.getByLabelText('Moment 1'), { target: { value: 'newSeason' } });
    fireEvent.change(screen.getByLabelText('Season'), { target: { value: 'winter' } });
    expect(useEditorStore.getState().quests[0].start!.when).toEqual([
      { on: 'newSeason', season: 'winter' },
    ]);
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add moment' }));
    fireEvent.change(screen.getByLabelText('Moment 2'), { target: { value: 'everyTenMinutes' } });
    expect(screen.getByRole('status').textContent).toContain('Every 10 minutes');
    expect(screen.getByText('Winter begins')).toBeTruthy();
    await act(async () => useEditorStore.getState().saveQuest('base:festival'));
    expect(fileSystem.saveJson).toHaveBeenCalledWith(
      'quests',
      expect.any(String),
      expect.objectContaining({
        start: { when: [{ on: 'newSeason', season: 'winter' }, { on: 'everyTenMinutes' }] },
      }),
    );
    fireEvent.click(screen.getByLabelText('Remove moment 2'));
    fireEvent.click(screen.getByLabelText('Remove moment 1'));
    expect(useEditorStore.getState().quests[0].start).toBeUndefined();
  });
  it('lists the dialogue node that starts the quest', () => {
    useEditorStore.setState({
      dialogues: new Map([
        [
          'base:greeting',
          {
            id: 'base:greeting',
            name: 'Greeting',
            nodes: [{ id: 'go', type: 'action', lua: "Quests.Start('base:festival')" }],
          } as any,
        ],
      ]),
    });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByText('Dialogue Greeting, node go')).toBeTruthy();
  });
  it('shows when the quest starts by itself on the Begin node', () => {
    useEditorStore.setState({
      maps: [{ id: 'base:harbour', name: 'Harbour' }] as any,
      quests: [
        {
          ...useEditorStore.getState().quests[0],
          start: {
            when: [{ on: 'locationChanged', map: 'base:harbour' }, { on: 'everyTenMinutes' }],
            condition: "GameState.Story.Has('met')",
          },
        },
      ],
    });
    show();
    const begin = screen.getByLabelText('Quest start');
    expect(begin.textContent).toContain('The player enters Harbour');
    expect(begin.textContent).toContain("GameState.Story.Has('met')");
    expect(begin.textContent).toContain('Checked every 10 minutes');
    act(() => useEditorStore.getState().updateQuest('base:festival', { start: undefined }));
    expect(screen.getByLabelText('Quest start').textContent).toBe('Starts only through an action');
  });
});
