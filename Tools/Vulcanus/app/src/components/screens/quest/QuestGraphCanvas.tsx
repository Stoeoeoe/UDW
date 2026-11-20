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
  layoutGraph,
  insertExecutionNode,
} from '../../../lib/graphEditing';
import { CutsceneGraphNode, type GraphViewNode } from '../cutscene/CutsceneGraphNode';
import {
  defaultArguments,
  matchingGraphTemplates,
  type GraphTemplate,
} from '../../../lib/cutsceneGraphPalette';
import { graphSignature } from '../../../lib/cutsceneGraph';
import { canonicalVariableType, variableCompatible } from '../../../lib/cutsceneVariables';
import type { CutsceneGraphNode as AuthoredNode } from '../../../types/cutsceneGraph';
import type { Cutscene } from '../../../types/cutscene';
import { GraphEditingContext } from '../cutscene/CutsceneGraphContext';
import {
  newQuestObjective,
  objectivePin,
  questActions,
  questDataWire,
  questFunctions,
  questActionResources,
  questNodeLabels,
  questStepLabels,
  questWire,
  removeQuestNodes,
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
    /** Objectives of this step that have a wire: meeting one of them ends the step. */
    branched: ReadonlySet<string>;
    changeComment: (id: string, comment: string | undefined) => void;
    selectObjective: (objective: number) => void;
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
    n.kind !== 'step'
      ? questNodeLabels[n.kind]
      : !n.group && step.objectives.length === 1
        ? questStepLabels[step.objectives[0].kind]
        : questStepLabels.group;
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
                  data.selectObjective(oi);
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
            Waits for the player
            {data.branched.size > 0
              ? ' · meeting a branching objective ends the step'
              : step.objectives.length > 1
                ? ' · all objectives required'
                : ''}
          </Text>
        </VStack>
      )}
      {step &&
        step.objectives.map((o) => (
          <HStack key={'branch-' + o.id} className="cutscene-graph-execution" justify="flex-end">
            <GraphExecutionPort
              direction="source"
              id={objectivePin(o.id)}
              label={`If met, continue: ${o.text}`}
            />
          </HStack>
        ))}
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
/** The cutscene editor's view of a quest node, so both editors draw the same nodes and pins. */
function cutsceneNode(node: QuestGraphNode): AuthoredNode {
  const base = { id: node.id, position: node.position, comment: node.comment };
  if (node.kind === 'action')
    return {
      ...base,
      kind: 'action',
      step: { id: node.id, action: node.action!.method, arguments: node.action!.arguments },
    };
  return {
    ...base,
    kind: node.kind as 'branch' | 'function' | 'expression',
    method: node.method,
    arguments: node.arguments,
    expression: node.expression,
    outputs: node.outputs,
  };
}
const drawnAsCutscene = ['action', 'function', 'expression', 'branch'];
const isPureTemplate = (id: string) => id.startsWith('pure:') || id === 'expression';
/** The edge pin a React Flow handle ID stands for: `exec:next` is `next`. */
const pinOf = (handleId: string | null | undefined) =>
  (handleId ?? 'exec:next').slice('exec:'.length);

export function QuestGraphCanvas(props: {
  quest: Quest;
  onChange: (updates: Partial<Quest>) => void;
  onSelect: (node: QuestGraphNode) => void;
  /** An objective of a step node was selected, by its position in the step. */
  onObjective: (nodeId: string, objective: number) => void;
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
  const graph = quest.editorGraph;
  const actions = useMemo(() => questActions(manifest), [manifest]);
  const functions = useMemo(() => questFunctions(manifest), [manifest]);
  const everyAction = useMemo(() => [...actions, ...functions], [actions, functions]);
  const scene = useMemo(() => ({ id: quest.id, variables: undefined }), [quest.id]);
  const pureTemplates = useMemo<GraphTemplate[]>(
    () => [
      ...functions.map((f) => ({
        id: f.id,
        label: f.displayName,
        category: f.category,
        node: { kind: 'function' as const, method: f.id.slice(5), arguments: defaultArguments(f) },
      })),
      {
        id: 'expression',
        label: 'Read-only Lua expression',
        category: 'Scripting',
        node: {
          kind: 'expression' as const,
          expression: 'true',
          outputs: [{ name: 'value', type: 'boolean' as const }],
        },
      },
    ],
    [functions],
  );
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
    { id: 'branch', label: 'If / Else', category: 'Flow' },
    ...pureTemplates.map((t) => ({ id: t.id, label: t.label, category: t.category })),
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
        : graph.edges.find((e) => e.kind === 'execution' && e.target === picker.from.nodeId)
            ?.source;
    const seen = new Set<string>();
    while (nodeId && !seen.has(nodeId)) {
      seen.add(nodeId);
      const node = graph.nodes.find((n) => n.id === nodeId)!;
      if (node.kind === 'exit' || node.kind === 'failure') return true;
      nodeId = graph.edges.find((e) => e.kind === 'execution' && e.target === nodeId)?.source;
    }
    return false;
  })();
  // Objective and True wires go straight to a step or Complete quest; False may also go to another Branch.
  const fromPin = picker?.from?.handleType === 'source' ? pinOf(picker.from.handleId) : 'next';
  const fromData = picker?.from?.handleId?.startsWith('data:') === true;
  // Dragging from a value pin offers the read-only nodes that fit its type; from an execution pin, never those.
  const dataChoices = (() => {
    if (!fromData) return [];
    try {
      const from = picker!.from!;
      const node = graph.nodes.find((n) => n.id === from.nodeId)!;
      const signature = graphSignature(cutsceneNode(node), scene, everyAction);
      const input = from.handleType === 'target';
      const pin = (input ? signature.inputs : signature.outputs).find(
        (p) => p.name === from.handleId!.slice(5),
      )!;
      const expression: GraphTemplate = {
        ...pureTemplates.find((t) => t.id === 'expression')!,
        node: {
          kind: 'expression',
          expression: 'true',
          outputs: [{ name: 'value', type: canonicalVariableType(pin.type) as 'boolean' }],
        },
      };
      return matchingGraphTemplates(
        [...pureTemplates.filter((t) => t.id !== 'expression'), expression],
        scene as unknown as Cutscene,
        everyAction,
        { ...pin, direction: input ? 'input' : 'output' },
      ).map((t) => ({ id: t.id, label: t.label, category: t.category, pin: t.pin }));
    } catch {
      return [];
    }
  })();
  const choices: { id: string; label: string; category: string; pin?: string }[] = fromData
    ? dataChoices
    : templates.filter(
        (c) =>
          (!followsTerminal || !c.id.startsWith('step:')) &&
          (!picker?.from || !isPureTemplate(c.id)) &&
          // After Complete quest or On failure an If / Else runs actions; between steps it picks the next step.
          (fromPin === 'next' ||
            (!fromPin.startsWith('objective:') && followsTerminal) ||
            c.id.startsWith('step:') ||
            (fromPin === 'else' && c.id === 'branch')),
      );
  const mutate = (change: (g: QuestGraph) => void) =>
    onChange({ editorGraph: produce(graph, change) });
  const changeAction: React.ContextType<typeof GraphEditingContext>['change'] = (id, change) =>
    mutate((g) => {
      const node = g.nodes.find((n) => n.id === id)!;
      const view = cutsceneNode(node);
      change(view);
      if (node.kind === 'action') node.action!.arguments = view.step!.arguments;
      else {
        if (view.arguments) node.arguments = view.arguments;
        if (view.expression !== undefined) node.expression = view.expression;
        if (view.outputs) node.outputs = view.outputs;
      }
      if (view.comment === undefined) delete node.comment;
      else node.comment = view.comment;
    });
  /** A read-only node carries no execution: it only supplies a value, wired to the pin it was dragged from. */
  const addPure = (kind: string, pin?: string) => {
    const id = `node-${crypto.randomUUID()}`;
    const next = structuredClone(graph);
    const from = picker?.from;
    const node: QuestGraphNode = {
      id,
      kind: kind === 'expression' ? 'expression' : 'function',
      position: picker?.position ?? { x: 340, y: 400 },
    };
    if (kind === 'expression') {
      const type = from?.handleId?.startsWith('data:')
        ? (graphSignature(
            cutsceneNode(next.nodes.find((n) => n.id === from.nodeId)!),
            scene,
            everyAction,
          )[from.handleType === 'target' ? 'inputs' : 'outputs'].find(
            (p) => p.name === from.handleId!.slice(5),
          )?.type ?? 'boolean')
        : 'boolean';
      node.expression = 'true';
      node.outputs = [{ name: 'value', type: canonicalVariableType(type) as 'boolean' }];
    } else {
      const action = functions.find((f) => f.id === kind)!;
      node.method = kind.slice(5);
      node.arguments = defaultArguments(action);
    }
    next.nodes.push(node);
    if (from?.handleId?.startsWith('data:') && pin) {
      const wire =
        from.handleType === 'target'
          ? questDataWire(id, pin, from.nodeId!, from.handleId.slice(5))
          : questDataWire(from.nodeId!, from.handleId.slice(5), id, pin);
      next.edges = next.edges.filter(
        (e) => !(e.kind === 'data' && e.target === wire.target && e.targetPin === wire.targetPin),
      );
      next.edges.push(wire);
    }
    onChange({ editorGraph: next });
    setSelected(new Set([id]));
    onSelect(node);
    setSelectedEdges(new Set());
    setPicker(undefined);
  };
  const add = (kind: string, pin?: string) => {
    if (isPureTemplate(kind)) return addPure(kind, pin);
    const id = `node-${crypto.randomUUID()}`;
    const next = structuredClone(graph);
    const anchor = next.nodes.find((n) => selected.has(n.id));
    const insertAfter =
      anchor && (!kind.startsWith('step:') || anchor.kind === 'step') ? anchor : undefined;
    const from = picker?.from;
    /** The wire the new node goes into, if any, and the node it follows. */
    const placement = (): { target?: QuestGraph['edges'][number]; source?: QuestGraphNode } => {
      const wires = next.edges.filter((e) => e.kind === 'execution');
      const nodeOf = (id: string | null) => next.nodes.find((n) => n.id === id);
      let target: QuestGraph['edges'][number] | undefined;
      if (from) {
        // Dragged from a pin: into the wire on that pin, else after the pin's node.
        target = wires.find((e) =>
          from.handleType === 'source'
            ? e.source === from.nodeId && e.sourcePin === pinOf(from.handleId)
            : e.target === from.nodeId,
        );
        if (!target)
          return { source: from.handleType === 'source' ? nodeOf(from.nodeId) : undefined };
      } else if (picker) {
        return {}; // Opened on the empty canvas: a free node.
      } else {
        // From the palette: into the selected wire, after the selected node, or before Complete quest.
        const exit = next.nodes.find((n) => n.kind === 'exit')!;
        target =
          wires.find((e) => selectedEdges.has(e.id)) ??
          wires.find((e) => (insertAfter ? e.source === insertAfter.id : e.target === exit.id));
        if (!target) return { source: insertAfter };
      }
      return { target, source: nodeOf(target.source) };
    };
    const { target, source } = placement();
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
    } else if (kind === 'branch') {
      node.kind = 'branch';
      node.arguments = { condition: false };
      delete node.code;
    } else if (kind !== 'lua') {
      const action = actions.find((a) => a.id === kind)!;
      node.kind = 'action';
      delete node.code;
      node.action = {
        method: action.id,
        arguments: defaultArguments(action),
      };
    }
    next.nodes.push(node);
    if (target && kind !== 'failure') {
      next.edges = next.edges.filter((e) => e.id !== target.id);
      next.edges.push(
        questWire(target.source, id, target.sourcePin),
        questWire(id, target.target, kind === 'branch' ? 'then' : 'next'),
      );
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
      next.edges.push(
        questWire(source.id, id, from?.handleType === 'source' ? pinOf(from.handleId) : 'next'),
      );
    } else if (from?.handleType === 'target') {
      next.edges.push(questWire(id, from.nodeId, kind === 'branch' ? 'then' : 'next'));
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
    onObjective(graph.nodes.find((n) => n.stepId === step.id)!.id, step.objectives.length);
  };
  const removeObjective = (index: number, objective: number) => {
    const removed = quest.steps[index].objectives[objective];
    const stepNode = graph.nodes.find((n) => n.stepId === quest.steps[index].id)!;
    onChange({
      steps: quest.steps.map((s, i) =>
        i === index ? { ...s, objectives: s.objectives.filter((_, oi) => oi !== objective) } : s,
      ),
      editorGraph: produce(graph, (g) => {
        g.edges = g.edges.filter(
          (e) => e.source !== stepNode.id || e.sourcePin !== objectivePin(removed.id),
        );
      }),
    });
    onSelect(stepNode);
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
        const { editorGraph, steps } = removeQuestNodes(quest, selected);
        onChange({
          steps,
          editorGraph: {
            ...editorGraph,
            edges: editorGraph.edges.filter((e) => !selectedEdges.has(e.id)),
          },
        });
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
    drawnAsCutscene.includes(node.kind)
      ? {
          id: node.id,
          type: 'cutscene',
          position: node.position,
          selected: selected.has(node.id),
          style: { width: node.kind === 'expression' ? 460 : 300 },
          data: {
            authored: cutsceneNode(node),
            // The inputs that take a wire instead of the value typed on the node.
            incoming: graph.edges
              .filter((e) => e.kind === 'data' && e.target === node.id)
              .map((e) => e.targetPin),
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
            branched: new Set(
              graph.edges
                .filter(
                  (e) => e.kind === 'execution' && e.source === node.id && e.sourcePin !== 'next',
                )
                .map((e) => e.sourcePin),
            ),
            changeComment: (id, value) =>
              mutate((g) => {
                const node = g.nodes.find((n) => n.id === id)!;
                if (value === undefined) delete node.comment;
                else node.comment = value;
              }),
            selectObjective: (objective) => {
              setSelected(new Set([node.id]));
              onObjective(node.id, objective);
            },
            addObjective,
            removeObjective,
          },
        },
  );
  return (
    <GraphEditingContext.Provider
      value={{
        scene,
        actions: everyAction,
        resources,
        phase: 'sequence',
        luaContext: 'quest',
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
        onInsert={(choice) => add(choice.id, (choice as { pin?: string }).pin)}
        canPaste={Boolean(clipboard?.graph.nodes.length)}
      >
        <GraphCanvas<ViewNode>
          nodes={views}
          nodeTypes={nodeTypes}
          edges={graph.edges.map((e) => {
            const channel = e.kind === 'data' ? 'data' : 'exec';
            let type = '';
            if (e.kind === 'data')
              try {
                type =
                  graphSignature(
                    cutsceneNode(graph.nodes.find((n) => n.id === e.source)!),
                    scene,
                    everyAction,
                  ).outputs.find((p) => p.name === e.sourcePin)?.type ?? '';
              } catch {
                /* Saving reports a broken wire. */
              }
            return {
              ...e,
              sourceHandle: `${channel}:${e.sourcePin}`,
              targetHandle: `${channel}:${e.targetPin}`,
              className:
                e.kind === 'data'
                  ? `data pin-${canonicalVariableType(type || 'string')}`
                  : e.id === insertionEdge
                    ? 'execution insertion-target'
                    : 'execution',
              selected: selectedEdges.has(e.id),
              markerEnd: e.kind === 'data' ? undefined : { type: MarkerType.ArrowClosed },
            };
          })}
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
            if (c.source === c.target) return;
            if (c.sourceHandle?.startsWith('data:')) {
              if (!c.targetHandle?.startsWith('data:')) return;
              const [sourcePin, targetPin] = [c.sourceHandle.slice(5), c.targetHandle.slice(5)];
              try {
                const find = (id: string) => cutsceneNode(graph.nodes.find((n) => n.id === id)!);
                const output = graphSignature(find(c.source), scene, everyAction).outputs.find(
                  (p) => p.name === sourcePin,
                );
                const input = graphSignature(find(c.target), scene, everyAction).inputs.find(
                  (p) => p.name === targetPin,
                );
                if (!output || !input || !variableCompatible(output, input)) return;
              } catch {
                return;
              }
              mutate((g) => {
                g.edges = g.edges.filter(
                  (e) => !(e.kind === 'data' && e.target === c.target && e.targetPin === targetPin),
                );
                g.edges.push(questDataWire(c.source, sourcePin, c.target, targetPin));
              });
              return;
            }
            if (!c.sourceHandle?.startsWith('exec:') || c.targetHandle !== 'exec:in') return;
            const pin = pinOf(c.sourceHandle);
            const kindOf = (id: string) => graph.nodes.find((n) => n.id === id)?.kind;
            const joins = ['step', 'exit'].includes(kindOf(c.target)!);
            const another = pin === 'else' && kindOf(c.target) === 'branch';
            const arm =
              (pin === 'then' || pin === 'else') &&
              ['lua', 'action', 'branch'].includes(kindOf(c.target)!);
            if (pin !== 'next' && !joins && !another && !arm) return;
            mutate((g) => {
              // An output has one wire. Only steps and Complete quest take several, as paths join there.
              g.edges = g.edges.filter(
                (e) =>
                  e.kind !== 'execution' ||
                  (!(e.source === c.source && e.sourcePin === pin) &&
                    (joins || e.target !== c.target)),
              );
              g.edges.push(questWire(c.source, c.target, pin));
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
