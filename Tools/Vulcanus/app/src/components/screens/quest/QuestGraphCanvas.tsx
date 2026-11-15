import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, HStack, Select, Text, VStack } from '@chakra-ui/react';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
  useNodesInitialized,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { produce } from 'immer';
import { GraphNodeFrame, GraphExecutionPort } from '../../common/graph/GraphNodeFrame';
import { GraphCanvas } from '../../common/graph/GraphCanvas';
import { GraphEditorShell } from '../../common/graph/GraphEditorShell';
import { useGraphEditor } from '../../common/graph/useGraphEditor';
import type { GraphCommand } from '../../common/graph/GraphEditorToolbar';
import {
  copyGraphSelection,
  pasteGraphSelection,
  deleteGraphSelection,
  layoutGraph,
  insertExecutionNode,
} from '../../../lib/graphEditing';
import { CutsceneGraphNode, type GraphViewNode } from '../cutscene/CutsceneGraphNode';
import { GraphEditingContext } from '../cutscene/CutsceneGraphContext';
import {
  graphFromQuest,
  newQuestObjective,
  questActions,
  questActionResources,
  questStepLabels,
  questWire,
} from '../../../lib/questGraph';
import { questStartWarnings, unusedQuestLocalId } from '../../../lib/quests';
import { describeStartMoment } from '../../../lib/questStarters';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import { useEditorStore } from '../../../store/useEditorStore';
import type { Quest, QuestObjective, QuestStep } from '../../../types/quest';
import type { QuestGraphNode, QuestGraph } from '../../../types/questGraph';
import '@xyflow/react/dist/style.css';
import '../cutscene/CutsceneGraph.css';

type QuestViewNode = Node<
  {
    authored: QuestGraphNode;
    quest: Quest;
    labels: Record<string, string>;
    changeComment: (id: string, comment: string | undefined) => void;
    selectObjective: (step: number, objective: number) => void;
    addObjective: (step: number, kind: QuestObjective['kind']) => void;
    removeObjective: (step: number, objective: number) => void;
  },
  'quest'
>;
type ViewNode = QuestViewNode | GraphViewNode;
function StepNode({ data, selected }: NodeProps<QuestViewNode>) {
  const n = data.authored;
  const index = data.quest.steps.findIndex((s) => s.id === n.stepId);
  const step = data.quest.steps[index];
  const title =
    n.kind === 'step'
      ? !n.group && step?.objectives.length === 1
        ? questStepLabels[step.objectives[0].kind]
        : questStepLabels.group
      : n.kind === 'entry'
        ? 'Begin'
        : n.kind === 'exit'
          ? 'Complete quest'
          : n.kind === 'failure'
            ? 'On failure'
            : 'Execute Lua Script';
  return (
    <GraphNodeFrame
      title={title}
      category={n.kind === 'step' ? 'quest-step' : n.kind === 'lua' ? 'script' : 'flow'}
      selected={selected}
      subtitle={step ? `Quest step · ${step.id}` : 'Execution'}
      comment={n.comment}
      onCommentChange={(value) => data.changeComment(n.id, value)}
    >
      <HStack className="cutscene-graph-execution" justify="space-between">
        {!['entry', 'failure'].includes(n.kind) && (
          <GraphExecutionPort direction="target" id="in" label="In" />
        )}
        <GraphExecutionPort
          direction="source"
          id="next"
          label={step ? 'Objectives complete' : n.kind === 'exit' ? 'On completion' : 'Next'}
        />
      </HStack>
      {step && (
        <VStack p={3} align="stretch" spacing={2}>
          <Text fontSize="sm">{step.journal}</Text>
          {step.objectives.map((o, oi) => (
            <HStack key={o.id}>
              <Button
                flex={1}
                className="nodrag"
                size="xs"
                variant="ghost"
                justifyContent="start"
                minW={0}
                aria-label={`Select objective ${o.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  data.selectObjective(index, oi);
                }}
              >
                <Text noOfLines={1}>{o.text}</Text>
              </Button>
              {(n.group || step.objectives.length > 1) && (
                <Button
                  className="nodrag"
                  size="xs"
                  variant="ghost"
                  aria-label={`Remove objective ${o.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    data.removeObjective(index, oi);
                  }}
                >
                  ×
                </Button>
              )}
            </HStack>
          ))}
          {step.objectives.map((o) => (
            <Box key={'summary-' + o.id} fontSize="xs" color="editorMutedText">
              {'character' in o && (
                <Text>
                  Character: {data.labels[o.character] || o.character || 'Choose character…'}
                </Text>
              )}
              {'item' in o && (
                <Text>
                  Item: {data.labels[o.item] || o.item || 'Choose item…'} × {o.count}
                </Text>
              )}
              {o.kind === 'reach' && (
                <Text>
                  Location: {data.labels[o.map] || o.map || 'Choose map…'}
                  {o.trigger ? ' / ' + o.trigger : ''}
                </Text>
              )}
              {o.kind === 'condition' && (
                <Text fontFamily="mono" noOfLines={2}>
                  {o.condition}
                </Text>
              )}
            </Box>
          ))}
          <Select
            className="nodrag"
            size="xs"
            aria-label={`Add objective to ${step.id}`}
            value=""
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => data.addObjective(index, e.target.value as QuestObjective['kind'])}
          >
            <option value="">+ Add objective…</option>
            {Object.entries(questStepLabels)
              .filter(([kind]) => kind !== 'group')
              .map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
          </Select>
          <Text color="editorMutedText" fontSize="xs">
            Waits for the player{step.objectives.length > 1 ? ' · all objectives required' : ''}
          </Text>
        </VStack>
      )}
      {n.kind === 'entry' && (
        <VStack p={3} align="stretch" spacing={1} fontSize="xs" aria-label="Quest start">
          {data.quest.start ? (
            <>
              <Text fontWeight="bold">Starts by itself when</Text>
              {data.quest.start.when.map((moment, i) => (
                <Text key={i}>· {describeStartMoment(moment, data.labels)}</Text>
              ))}
              {data.quest.start.condition && (
                <Text color="editorMutedText" fontFamily="mono" noOfLines={2}>
                  and {data.quest.start.condition}
                </Text>
              )}
              {questStartWarnings(data.quest).length > 0 && (
                <Text color="orange.400">Checked every 10 minutes</Text>
              )}
            </>
          ) : (
            <Text color="editorMutedText">Starts only through an action</Text>
          )}
        </VStack>
      )}
      {n.kind === 'lua' && (
        <Text p={3} fontSize="xs" fontFamily="mono" noOfLines={3}>
          {n.code || 'Select to edit script'}
        </Text>
      )}
    </GraphNodeFrame>
  );
}
const nodeTypes = { quest: StepNode, cutscene: CutsceneGraphNode };

export function QuestGraphCanvas(props: {
  quest: Quest;
  onChange: (updates: Partial<Quest>) => void;
  onSelect: (node: QuestGraphNode) => void;
  onObjective: (step: number, objective: number) => void;
}) {
  return (
    <ReactFlowProvider>
      <Workspace {...props} />
    </ReactFlowProvider>
  );
}

function Workspace({
  quest,
  onChange,
  onSelect,
  onObjective,
}: React.ComponentProps<typeof QuestGraphCanvas>) {
  const manifest = useScriptingManifestStore((s) => s.manifest);
  const characters = useEditorStore((s) => s.characters);
  const items = useEditorStore((s) => s.items);
  const maps = useEditorStore((s) => s.maps);
  const labels = useMemo(
    () => Object.fromEntries([...characters, ...items, ...maps].map((r) => [r.id, r.name])),
    [characters, items, maps],
  );
  const flow = useReactFlow<ViewNode>();
  const initialized = useNodesInitialized();
  useEffect(() => {
    if (!initialized) return;
    const frame = requestAnimationFrame(() => {
      void flow.fitView({ padding: 0.15, maxZoom: 1 });
    });
    return () => cancelAnimationFrame(frame);
  }, [initialized, flow]);
  const graph = useMemo(() => graphFromQuest(quest), [quest]);
  const actions = useMemo(() => questActions(manifest), [manifest]);
  const resources = useMemo(
    () => questActionResources(manifest, { characters, items }),
    [manifest, characters, items],
  );
  const [clipboard, setClipboard] = useState<{ graph: QuestGraph; steps: QuestStep[] }>();
  const pasteOffset = useRef(48);
  const operations = useRef<{
    run: (command: GraphCommand) => void;
    move: (nodes: { id: string; position: { x: number; y: number } }[]) => void;
    finishDrag: (nodes: ViewNode[], edge?: string) => void;
  }>(null!);
  const editor = useGraphEditor<ViewNode>({
    nodes: graph.nodes,
    edges: graph.edges,
    run: (command) => operations.current.run(command),
    move: (nodes) => operations.current.move(nodes),
    finishDrag: (nodes, edge) => operations.current.finishDrag(nodes, edge),
    insertable: (node) => ['step', 'action', 'lua'].includes(node.data.authored.kind),
  });
  const {
    selected,
    setSelected,
    selectedEdges,
    setSelectedEdges,
    picker,
    setPicker,
    insertionEdge,
  } = editor;
  const templates = [
    ...Object.entries(questStepLabels).map(([kind, label]) => ({
      id: `step:${kind}`,
      label,
      category: 'Quest steps',
    })),
    ...actions.map((a) => ({ id: a.id, label: a.displayName, category: a.category })),
    { id: 'lua', label: 'Execute Lua Script', category: 'Scripting' },
    ...(!picker?.from && !graph.nodes.some((n) => n.kind === 'failure')
      ? [{ id: 'failure', label: 'On failure', category: 'Quest' }]
      : []),
  ];
  // Completion/failure hooks accept actions, while quest steps belong to the active quest flow.
  const followsTerminal = (() => {
    if (!picker?.from) return false;
    let nodeId: string | undefined =
      picker.from.handleType === 'source'
        ? picker.from.nodeId
        : graph.edges.find((e) => e.target === picker.from.nodeId)?.source;
    const seen = new Set<string>();
    while (nodeId && !seen.has(nodeId)) {
      seen.add(nodeId);
      const node = graph.nodes.find((n) => n.id === nodeId)!;
      if (node.kind === 'exit' || node.kind === 'failure') return true;
      nodeId = graph.edges.find((e) => e.target === nodeId)?.source;
    }
    return false;
  })();
  const choices = templates.filter((c) => !followsTerminal || !c.id.startsWith('step:'));
  const mutate = (change: (g: QuestGraph) => void) =>
    onChange({ editorGraph: produce(graph, change) });
  const changeAction: React.ContextType<typeof GraphEditingContext>['change'] = (id, change) =>
    mutate((g) => {
      const node = g.nodes.find((n) => n.id === id)!;
      const view = {
        id,
        kind: 'action' as const,
        position: node.position,
        comment: node.comment,
        step: { id, action: node.action!.method, arguments: node.action!.arguments },
      };
      change(view);
      node.action!.arguments = view.step.arguments;
      if (view.comment === undefined) delete node.comment;
      else node.comment = view.comment;
    });
  const add = (kind: string) => {
    const id = `node-${crypto.randomUUID()}`;
    const next = structuredClone(graph);
    const anchor = next.nodes.find((n) => selected.has(n.id));
    const insertAfter =
      anchor && (!kind.startsWith('step:') || anchor.kind === 'step') ? anchor : undefined;
    const from = picker?.from;
    const target =
      picker && !from
        ? undefined
        : from
          ? next.edges.find((e) =>
              from.handleType === 'source' ? e.source === from.nodeId : e.target === from.nodeId,
            )
          : (next.edges.find((e) => selectedEdges.has(e.id)) ??
            (insertAfter
              ? next.edges.find((e) => e.source === insertAfter.id)
              : next.edges.find(
                  (e) => e.target === next.nodes.find((n) => n.kind === 'exit')?.id,
                )));
    const source = target
      ? next.nodes.find((n) => n.id === target.source)
      : from
        ? from.handleType === 'source'
          ? next.nodes.find((n) => n.id === from.nodeId)
          : undefined
        : picker
          ? undefined
          : insertAfter;
    const node: QuestGraphNode = {
      id,
      kind: 'lua',
      code: '',
      position: picker?.position ?? {
        x: (source?.position.x ?? 0) + 340,
        y: source?.position.y ?? 120,
      },
    };
    const updates: Partial<Quest> = {};
    if (kind.startsWith('step:')) {
      const type = kind.slice(5) as QuestObjective['kind'] | 'group';
      const stepId = unusedQuestLocalId(quest.steps, 'step');
      const objective = newQuestObjective(type === 'group' ? 'condition' : type, 'objective-1');
      node.kind = 'step';
      node.stepId = stepId;
      node.group = type === 'group';
      delete node.code;
      updates.steps = [
        ...quest.steps,
        { id: stepId, journal: 'Complete the next objective.', objectives: [objective] },
      ];
    } else if (kind === 'failure') {
      node.kind = 'failure';
      delete node.code;
      node.position = { x: 0, y: 540 };
    } else if (kind !== 'lua') {
      const action = actions.find((a) => a.id === kind)!;
      node.kind = 'action';
      delete node.code;
      node.action = {
        method: action.id,
        arguments: Object.fromEntries(
          action.parameters.map((p) => [
            p.name,
            p.defaultValue ??
              (p.nullable
                ? null
                : p.type === 'boolean'
                  ? false
                  : ['integer', 'number'].includes(p.type)
                    ? 0
                    : p.type === 'table'
                      ? {}
                      : ''),
          ]),
        ),
      };
    }
    next.nodes.push(node);
    if (target && kind !== 'failure') {
      next.edges = next.edges.filter((e) => e.id !== target.id);
      next.edges.push(questWire(target.source, id), questWire(id, target.target));
      // Make space without changing execution order or IDs.
      if (!picker)
        next.nodes
          .filter(
            (n) =>
              n.id !== id && n.position.y === node.position.y && n.position.x >= node.position.x,
          )
          .forEach((n) => {
            n.position.x += 340;
          });
    } else if (source && kind !== 'failure') {
      next.edges.push(questWire(source.id, id));
    } else if (from?.handleType === 'target') {
      next.edges.push(questWire(id, from.nodeId));
    }
    onChange({ ...updates, editorGraph: next });
    setSelected(new Set([id]));
    onSelect(node);
    setSelectedEdges(new Set());
    setPicker(undefined);
  };
  const addObjective = (index: number, kind: QuestObjective['kind']) => {
    const step = quest.steps[index];
    onChange({
      steps: quest.steps.map((s, i) =>
        i === index
          ? {
              ...s,
              objectives: [
                ...s.objectives,
                newQuestObjective(kind, unusedQuestLocalId(s.objectives, 'objective')),
              ],
            }
          : s,
      ),
      editorGraph: produce(graph, (g) => {
        g.nodes.find((n) => n.stepId === step.id)!.group = true;
      }),
    });
    onObjective(index, step.objectives.length);
  };
  const removeObjective = (index: number, objective: number) => {
    onChange({
      steps: quest.steps.map((s, i) =>
        i === index ? { ...s, objectives: s.objectives.filter((_, oi) => oi !== objective) } : s,
      ),
    });
    onSelect(graph.nodes.find((n) => n.stepId === quest.steps[index].id)!);
  };
  const copy = () => ({
    graph: copyGraphSelection(graph, selected),
    steps: quest.steps.filter((step) =>
      graph.nodes.some((n) => selected.has(n.id) && n.stepId === step.id),
    ),
  });
  const paste = (copied = clipboard, offset = pasteOffset.current) => {
    if (!copied?.graph.nodes.length) return;
    const next = structuredClone(graph);
    const ids = pasteGraphSelection(next, copied.graph, offset);
    const steps = [...quest.steps];
    for (const node of next.nodes.filter((n) => ids.includes(n.id) && n.kind === 'step')) {
      const original = copied.steps.find((s) => s.id === node.stepId)!;
      const id = unusedQuestLocalId(steps, 'step');
      steps.push({ ...structuredClone(original), id });
      node.stepId = id;
    }
    onChange({ editorGraph: next, steps });
    setSelected(new Set(ids));
    setSelectedEdges(new Set());
    pasteOffset.current += 48;
  };
  const move = (nodes: { id: string; position: { x: number; y: number } }[], edge?: string) =>
    mutate((g) => {
      for (const node of nodes) g.nodes.find((n) => n.id === node.id)!.position = node.position;
      if (edge && nodes.length === 1) insertExecutionNode(g, nodes[0].id, edge);
    });
  operations.current = {
    move,
    finishDrag: move,
    run: (command) => {
      if (command === 'copy') {
        setClipboard(copy());
        pasteOffset.current = 48;
      } else if (command === 'paste') paste();
      else if (command === 'duplicate') paste(copy(), 48);
      else if (command === 'delete') {
        const next = structuredClone(graph);
        deleteGraphSelection(next, selected, selectedEdges);
        const survivingSteps = new Set(next.nodes.map((n) => n.stepId));
        onChange({ editorGraph: next, steps: quest.steps.filter((s) => survivingSteps.has(s.id)) });
        editor.clear();
      } else if (command === 'layout') {
        const sizes = new Map(
          flow
            .getNodes()
            .map((n) => [
              n.id,
              { width: n.measured?.width ?? 300, height: n.measured?.height ?? 260 },
            ]),
        );
        mutate((g) => layoutGraph(g, sizes));
        requestAnimationFrame(() => {
          void flow.fitView({ padding: 0.15, duration: 200 });
        });
      } else if (command === 'undo') useEditorStore.getState().undoQuest(quest.id);
      else if (command === 'redo') useEditorStore.getState().redoQuest(quest.id);
    },
  };
  const views: ViewNode[] = graph.nodes.map((node) =>
    node.kind === 'action'
      ? {
          id: node.id,
          type: 'cutscene',
          position: node.position,
          selected: selected.has(node.id),
          style: { width: 300 },
          data: {
            authored: {
              id: node.id,
              kind: 'action',
              position: node.position,
              comment: node.comment,
              step: { id: node.id, action: node.action!.method, arguments: node.action!.arguments },
            },
            incoming: [],
            tracks: 0,
            options: {},
          },
        }
      : {
          id: node.id,
          type: 'quest',
          style: { width: 300 },
          position: node.position,
          selected: selected.has(node.id),
          deletable: !['entry', 'exit'].includes(node.kind),
          data: {
            authored: node,
            quest,
            labels,
            changeComment: (id, value) =>
              mutate((g) => {
                const node = g.nodes.find((n) => n.id === id)!;
                if (value === undefined) delete node.comment;
                else node.comment = value;
              }),
            selectObjective: (step, objective) => {
              setSelected(new Set([node.id]));
              onObjective(step, objective);
            },
            addObjective,
            removeObjective,
          },
        },
  );
  return (
    <GraphEditingContext.Provider
      value={{
        scene: { id: quest.id },
        actions,
        resources,
        phase: 'sequence',
        executionOnly: true,
        characterReferences: characters.map((c) => ({ id: c.id, name: c.name })),
        argumentReferences: {},
        change: changeAction,
        spatial: () => {
          throw new Error('Spatial actions belong to cutscenes.');
        },
      }}
    >
      <GraphEditorShell
        editor={editor}
        choices={choices}
        onInsert={(choice) => add(choice.id)}
        canPaste={Boolean(clipboard?.graph.nodes.length)}
      >
        <GraphCanvas<ViewNode>
          nodes={views}
          nodeTypes={nodeTypes}
          edges={graph.edges.map((e) => ({
            ...e,
            sourceHandle: 'exec:next',
            targetHandle: 'exec:in',
            className: e.id === insertionEdge ? 'execution insertion-target' : 'execution',
            selected: selectedEdges.has(e.id),
            markerEnd: { type: MarkerType.ArrowClosed },
          }))}
          {...editor.canvasProps}
          onNodeClick={(event, view) => {
            if (!event.ctrlKey && !event.metaKey && !event.shiftKey)
              setSelected(new Set([view.id]));
            onSelect(graph.nodes.find((n) => n.id === view.id)!);
          }}
          onEdgeDoubleClick={(_, edge) =>
            mutate((g) => {
              g.edges = g.edges.filter((e) => e.id !== edge.id);
            })
          }
          onConnect={(c) => {
            if (
              c.sourceHandle !== 'exec:next' ||
              c.targetHandle !== 'exec:in' ||
              c.source === c.target
            )
              return;
            mutate((g) => {
              g.edges = g.edges.filter((e) => e.source !== c.source && e.target !== c.target);
              g.edges.push(questWire(c.source, c.target));
            });
          }}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
        </GraphCanvas>
      </GraphEditorShell>
    </GraphEditingContext.Provider>
  );
}
