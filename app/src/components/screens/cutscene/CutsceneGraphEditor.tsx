import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { produce } from 'immer';
import {
  Box,
  Flex,
  Button,
  HStack,
  Input,
  Select,
  ModalBody,
  ModalCloseButton,
  ModalHeader,
  Text,
} from '@chakra-ui/react';
import {
  ReactFlowProvider,
  Background,
  Controls,
  MarkerType,
  useReactFlow,
  type Connection,
  type OnConnectEnd,
  type OnConnectStartParams,
  type Edge,
} from '@xyflow/react';
import { useEditorStore } from '../../../store/useEditorStore';
import {
  copyGraphSelection,
  pasteGraphSelection,
  deleteGraphSelection,
  layoutCutsceneGraph,
  insertExecutionNode,
} from '../../../lib/cutsceneGraphEditing';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import {
  EMPTY_SCRIPTING_ACTIONS,
  getManifestGraphFunctions,
  withProjectCharacters,
} from '../../../lib/scriptingManifest';
import {
  graphFromSteps,
  graphSignature,
  isPureGraphNode,
  phaseSteps,
  setPhaseGraph,
  validateGraphPlan,
} from '../../../lib/cutsceneGraph';
import {
  graphTemplates,
  filterGraphTemplates,
  matchingGraphTemplates,
  type GraphTemplate,
} from '../../../lib/cutsceneGraphPalette';
import { mapCharacterInstances, validateCutscene } from '../../../lib/cutscenes';
import { previewCutscene } from '../../../lib/cutscenePreview';
import { setVariableAction, variableCompatible } from '../../../lib/cutsceneVariables';
import type { Cutscene, CutsceneData } from '../../../types/cutscene';
import type {
  CutsceneGraph,
  CutsceneGraphNode as AuthoredNode,
  CutscenePhase,
} from '../../../types/cutsceneGraph';
import { CutsceneGraphNode, type GraphViewNode } from './CutsceneGraphNode';
import { CutsceneGraphCanvas } from './CutsceneGraphCanvas';
import { CutsceneGraphToolbar } from './CutsceneGraphToolbar';
import { GraphEditingContext } from './CutsceneGraphContext';
import { CutsceneSpatialEditor } from './CutsceneSpatialEditor';
import { CutsceneSettings } from './CutsceneSettings';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { TopTabbedEditorLayout } from '../common/TopTabbedEditorLayout';
import EditorModal from '../../common/EditorModal';
import '@xyflow/react/dist/style.css';
import './CutsceneGraph.css';

const nodeTypes = { cutscene: CutsceneGraphNode };
function GraphWorkspace({ scene, notice }: { scene: Cutscene; notice?: React.ReactNode }) {
  const [phase, setPhase] = useState<CutscenePhase>('sequence');
  const [settings, setSettings] = useState<'scene' | 'completion'>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedEdges, setSelectedEdges] = useState<Set<string>>(new Set());
  const [insertionEdge, setInsertionEdge] = useState<string>();
  const insertionTarget = useRef<string>();
  const insertionWires = useRef<{ id: string; points: { x: number; y: number }[] }[]>([]);
  const draggingNodes = useRef(false);
  const [clipboard, setClipboard] = useState<CutsceneGraph>();
  const pasteOffset = useRef(48);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [pickerCategory, setPickerCategory] = useState('');
  const [picker, setPicker] = useState<{
    x: number;
    y: number;
    position: { x: number; y: number };
    from?: OnConnectStartParams;
  }>();
  const [spatial, setSpatial] = useState<{
    id: string;
    title: string;
    parameter: string;
    type: 'position' | 'path';
    nullable: boolean;
    value: CutsceneData | undefined;
    start?: [number, number];
  }>();
  const root = useRef<HTMLDivElement>(null);
  const connecting = useRef<OnConnectStartParams>();
  const droppingPin = useRef(false);
  const flow = useReactFlow<GraphViewNode>();
  const baseActions = useScriptingManifestStore(
    (s) => s.actionsByContext.cutscene ?? EMPTY_SCRIPTING_ACTIONS,
  );
  const manifest = useScriptingManifestStore((s) => s.manifest);
  const functions = useMemo(
    () => (manifest ? getManifestGraphFunctions(manifest) : []),
    [manifest],
  );
  const actions = useMemo(
    () => [...baseActions, ...functions, setVariableAction({ variables: scene.variables })],
    [baseActions, functions, scene.variables],
  );
  const maps = useEditorStore((s) => s.maps),
    currentMap = useEditorStore((s) => s.currentMap);
  const types = useEditorStore((s) => s.entityTypes),
    characters = useEditorStore((s) => s.characters);
  const dialogues = useEditorStore((s) => s.dialogues),
    project = useEditorStore((s) => s.project);
  const labels = useEditorStore((s) => s.cutsceneLabels),
    edit = useEditorStore((s) => s.editCutscenes);
  const canUndo = useEditorStore((s) => Boolean(s.cutscenePast[scene.id]?.length));
  const canRedo = useEditorStore((s) => Boolean(s.cutsceneFuture[scene.id]?.length));
  const map = currentMap?.id === scene.mapId ? currentMap : maps.find((m) => m.id === scene.mapId);
  const resources = useMemo(
    () => withProjectCharacters(manifest?.resources, characters),
    [manifest, characters],
  );
  const list = useMemo(() => phaseSteps(scene, phase), [scene, phase]);
  const graph = useMemo(
    () => scene.graphs?.[phase] ?? graphFromSteps(list),
    [scene.graphs, phase, list],
  );
  const refs = useMemo(
    () => ({
      maps: currentMap ? [...maps.filter((m) => m.id !== currentMap.id), currentMap] : maps,
      entityTypes: types,
      dialogueIds: [...dialogues.keys()],
      resources,
      tileSize: project?.tileSize ?? 16,
      storyValues: project?.storyValues,
      graphFunctions: functions,
    }),
    [maps, currentMap, types, dialogues, resources, project, functions],
  );
  // Lua parsing and graph validation run after edits settle, never on pointer movement.
  const [issues, setIssues] = useState<ReturnType<typeof validateCutscene>>([]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setIssues(validateCutscene(scene, baseActions, refs)),
      180,
    );
    return () => window.clearTimeout(timer);
  }, [scene, baseActions, refs]);
  const update = useCallback(
    (change: (draft: CutsceneGraph) => void) => {
      if (spatial) {
        setMessage('Finish or cancel the map edit before changing the graph.');
        return;
      }
      // Keep untouched node identities so one field edit does not rebuild every node/editor.
      const next = produce(graph, change);
      edit((scenes) => {
        const draft = scenes.find((s) => s.id === scene.id)!;
        setPhaseGraph(draft, phase, next);
      });
    },
    [graph, spatial, edit, scene.id, phase],
  );
  const changeNode = useCallback(
    (id: string, change: (node: AuthoredNode) => void) =>
      update((draft) => {
        const node = draft.nodes.find((n) => n.id === id)!;
        const outputs = new Map(node.outputs?.map((output) => [output, output.name]));
        change(node);
        // Editing a declared result's label retains its wires; explicitly removing it disconnects them.
        for (const [output, previousName] of outputs) {
          if (!node.outputs!.includes(output))
            draft.edges = draft.edges.filter(
              (e) => !(e.kind === 'data' && e.source === id && e.sourcePin === previousName),
            );
          else if (output.name !== previousName)
            for (const e of draft.edges)
              if (e.kind === 'data' && e.source === id && e.sourcePin === previousName)
                e.sourcePin = output.name;
        }
      }),
    [update],
  );
  const removeSelection = () => {
    update((draft) => deleteGraphSelection(draft, selected, selectedEdges));
    setSelected(new Set());
    setSelectedEdges(new Set());
  };
  const pasteSelection = (copied = clipboard, offset = pasteOffset.current) => {
    if (!copied?.nodes.length) return;
    update((draft) => setSelected(new Set(pasteGraphSelection(draft, copied, offset))));
    setSelectedEdges(new Set());
    pasteOffset.current += 48;
  };
  const autoLayout = () => {
    const sizes = new Map(
      flow.getNodes().map((n) => [
        n.id,
        {
          // A newly mounted/resized Lua node can still have an older measurement.
          width: Math.max(
            n.measured?.width ?? 0,
            typeof n.style?.width === 'number' ? n.style.width : 300,
          ),
          height: n.measured?.height ?? 260,
        },
      ]),
    );
    update((draft) => layoutCutsceneGraph(draft, sizes));
    requestAnimationFrame(() => {
      void flow.fitView({ padding: 0.15, duration: 200 });
    });
  };
  const nearbyExecutionEdge = (
    event: { clientX: number; clientY: number },
    node: GraphViewNode,
  ) => {
    if (!['action', 'lua'].includes(node.data.authored.kind)) return;
    const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    let nearest: string | undefined;
    let distance = 28 / flow.getZoom();
    for (const edge of insertionWires.current) {
      for (const sample of edge.points) {
        const next = Math.hypot(sample.x - point.x, sample.y - point.y);
        if (next < distance) {
          distance = next;
          nearest = edge.id;
        }
      }
    }
    return nearest;
  };
  const finishDrag = (nodes: GraphViewNode[], edge?: string) => {
    draggingNodes.current = false;
    update((draft) => {
      for (const moved of nodes)
        draft.nodes.find((n) => n.id === moved.id)!.position = moved.position;
      if (edge && nodes.length === 1) insertExecutionNode(draft, nodes[0].id, edge);
    });
    insertionWires.current = [];
    insertionTarget.current = undefined;
    setInsertionEdge(undefined);
  };
  const templates = useMemo(
    () => (picker ? graphTemplates(scene, actions, phase) : []),
    [picker, scene, actions, phase],
  );
  // Code/position edits must not invalidate every Lua editor's actor completions.
  const declaredRoles = useMemo(() => {
    const result: string[] = [];
    for (const n of Object.values(scene.graphs ?? {}).flatMap((g) => g?.nodes ?? []))
      if (n.kind === 'action' && n.step) {
        const signature = baseActions.find((a) => a.id === n.step!.action);
        for (const p of signature?.parameters ?? [])
          if (
            p.semanticType === 'characterDeclaration' &&
            typeof n.step.arguments[p.name] === 'string'
          )
            result.push(String(n.step.arguments[p.name]));
      }
    return JSON.stringify(result);
  }, [scene.graphs, baseActions]);
  const roles = useMemo(
    () => [
      { id: 'player', label: 'Player' },
      ...(map
        ? mapCharacterInstances(map, types).map((a) => ({ id: a.id, label: a.label || a.id }))
        : []),
      ...(JSON.parse(declaredRoles) as string[]).map((id) => ({ id, label: id })),
    ],
    [map, types, declaredRoles],
  );
  const nodeCache = useMemo(
    () => new WeakMap<AuthoredNode, { incoming: string; tracks: number; view: GraphViewNode }>(),
    [actions, scene.variables, roles, map, dialogues],
  );
  const authoredNodes: GraphViewNode[] = useMemo(() => {
    const incoming = new Map<string, string[]>();
    for (const edge of graph.edges)
      if (edge.kind === 'data') {
        const pins = incoming.get(edge.target) ?? [];
        pins.push(edge.targetPin);
        incoming.set(edge.target, pins);
      }
    const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
    return graph.nodes.map((n) => {
      const pins = incoming.get(n.id) ?? [];
      const key = JSON.stringify(pins);
      const tracks = nodesById.get(n.pair ?? '')?.tracks ?? 2;
      const cached = nodeCache.get(n);
      if (cached && cached.incoming === key && cached.tracks === tracks) return cached.view;
      const options: Record<string, { id: string; label: string }[]> = {};
      let hasLua = n.kind === 'lua' || n.kind === 'expression';
      try {
        for (const p of graphSignature(n, scene, actions).inputs) {
          if (p.picker === 'lua') hasLua = true;
          if (p.semanticType === 'characterRef') options[p.name] = roles;
          if (p.semanticType === 'anchorRef')
            options[p.name] = (map?.spatialPrimitives?.anchors ?? []).map((a) => ({
              id: a.id,
              label: a.name || a.id,
            }));
          if (p.semanticType === 'dialogueRef')
            options[p.name] = [...dialogues.values()].map((d) => ({
              id: d.id,
              label: d.name || d.id,
            }));
          if (n.step?.action === 'cutscene.setVariable' && p.name === 'name')
            options[p.name] = (scene.variables ?? []).map((v) => ({ id: v.name, label: v.name }));
        }
      } catch {
        /* Invalid authored nodes render their diagnostic instead of fabricated ports. */
      }
      const view: GraphViewNode = {
        id: n.id,
        type: 'cutscene',
        position: n.position,
        style: { width: hasLua ? 460 : 300 },
        data: {
          authored: n,
          incoming: pins,
          tracks,
          options,
        },
      };
      nodeCache.set(n, { incoming: key, tracks, view });
      return view;
    });
  }, [graph, scene.variables, actions, roles, map, dialogues, nodeCache]);
  const viewNodes = useMemo(
    () =>
      authoredNodes.map((node) => ({
        ...node,
        selected: selected.has(node.id),
      })),
    [authoredNodes, selected],
  );
  const authoredEdges: Edge[] = useMemo(
    () =>
      graph.edges.map((e) => {
        let type = '';
        try {
          type =
            graphSignature(
              graph.nodes.find((n) => n.id === e.source)!,
              scene,
              actions,
            ).outputs.find((p) => p.name === e.sourcePin)?.type ?? '';
        } catch {
          /* Validation reports broken authored connections. */
        }
        return {
          id: e.id,
          source: e.source,
          sourceHandle: `${e.kind === 'data' ? 'data' : 'exec'}:${e.sourcePin}`,
          target: e.target,
          targetHandle: `${e.kind === 'data' ? 'data' : 'exec'}:${e.targetPin}`,
          className: `${e.kind} pin-${type}`,
          markerEnd:
            e.kind === 'execution'
              ? { type: MarkerType.ArrowClosed, width: 13, height: 13 }
              : undefined,
        };
      }),
    [graph, scene, actions],
  );
  const viewEdges = useMemo(
    () =>
      authoredEdges.map((edge) => ({
        ...edge,
        selected: selectedEdges.has(edge.id),
        className: `${edge.className}${insertionEdge === edge.id ? ' insertion-target' : ''}`,
      })),
    [authoredEdges, selectedEdges, insertionEdge],
  );
  const makeConnection = (
    connection: Connection,
    draft: CutsceneGraph,
    kind: 'data' | 'execution',
  ) => {
    const source = draft.nodes.find((n) => n.id === connection.source)!;
    const target = draft.nodes.find((n) => n.id === connection.target)!;
    if (source === target) throw new Error('A node cannot connect to itself');
    if (source.kind === 'comment' || target.kind === 'comment')
      throw new Error('Comment nodes cannot have connections');
    const output = graphSignature(source, scene, actions).outputs.find(
      (p) => p.name === connection.sourceHandle,
    );
    const input = graphSignature(target, scene, actions).inputs.find(
      (p) => p.name === connection.targetHandle,
    );
    const data = kind === 'data';
    if (data && (!output || !input || !variableCompatible(output, input)))
      throw new Error('Connect matching data types');
    if (data && target.step?.argumentVariables)
      delete target.step.argumentVariables[connection.targetHandle!];
    if (!data && (isPureGraphNode(source) || isPureGraphNode(target)))
      throw new Error('Pure nodes have data pins only');
    draft.edges = draft.edges.filter((e) =>
      data
        ? !(e.kind === 'data' && e.target === target.id && e.targetPin === connection.targetHandle)
        : !(
            e.kind === 'execution' &&
            ((e.source === source.id && e.sourcePin === connection.sourceHandle) ||
              (e.target === target.id && e.targetPin === connection.targetHandle))
          ),
    );
    draft.edges.push({
      id: `wire-${crypto.randomUUID()}`,
      kind: data ? 'data' : 'execution',
      source: source.id,
      sourcePin: connection.sourceHandle!,
      target: target.id,
      targetPin: connection.targetHandle!,
    });
  };
  const connect = (connection: Connection) => {
    try {
      const channel = connection.sourceHandle?.startsWith('data:') ? 'data' : 'exec';
      if (!connection.targetHandle?.startsWith(`${channel}:`))
        throw new Error(
          'Execution pins connect only to execution pins; data pins need matching types',
        );
      update((draft) =>
        makeConnection(
          {
            ...connection,
            sourceHandle: connection.sourceHandle!.slice(5),
            targetHandle: connection.targetHandle!.slice(5),
          },
          draft,
          channel === 'data' ? 'data' : 'execution',
        ),
      );
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const showPicker = (clientX: number, clientY: number, from?: OnConnectStartParams) => {
    const rect = root.current!.getBoundingClientRect();
    setQuery('');
    setPickerCategory('');
    setPicker({
      x: Math.max(0, Math.min(rect.width - 320, clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height - 410, clientY - rect.top)),
      position: flow.screenToFlowPosition({ x: clientX, y: clientY }),
      from,
    });
  };
  const onConnectEnd: OnConnectEnd = (event, state) => {
    if (state.isValid || state.toNode || !connecting.current) return;
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    droppingPin.current = true;
    showPicker(point.clientX, point.clientY, connecting.current);
    connecting.current = undefined;
    // The same mouse release can also produce a pane click; it must not dismiss the new menu.
    setTimeout(() => {
      droppingPin.current = false;
    }, 0);
  };
  const choices = useMemo<(GraphTemplate & { pin?: string })[]>(() => {
    if (!picker) return [];
    if (!picker.from) return templates;
    try {
      const from = graph.nodes.find((n) => n.id === picker.from!.nodeId)!;
      const signature = graphSignature(from, scene, actions);
      const pin = (picker.from.handleType === 'target' ? signature.inputs : signature.outputs).find(
        (p) => p.name === picker.from!.handleId?.slice(5),
      );
      return picker.from.handleId?.startsWith('data:') && pin
        ? matchingGraphTemplates(templates, scene, actions, {
            ...pin,
            direction: picker.from.handleType === 'target' ? 'input' : 'output',
          })
        : picker.from.handleId?.startsWith('exec:')
          ? templates
              .filter((t) => ['action', 'lua'].includes(t.node.kind))
              .map((t) => ({ ...t, pin: picker.from!.handleType === 'target' ? 'next' : 'in' }))
          : [];
    } catch {
      return [];
    }
  }, [picker, templates, graph, scene, actions]);
  const categories = useMemo(() => [...new Set(choices.map((c) => c.category))].sort(), [choices]);
  const visibleChoices = useMemo(
    () => filterGraphTemplates(choices, query, pickerCategory),
    [choices, query, pickerCategory],
  );
  const insert = (template: GraphTemplate & { pin?: string }) => {
    const id = `node-${crypto.randomUUID()}`,
      position = picker!.position;
    try {
      update((draft) => {
        const n: AuthoredNode = { ...structuredClone(template.node), id, position };
        if (n.step) n.step.id = id;
        draft.nodes.push(n);
        if (n.kind === 'parallel' || n.kind === 'branch') {
          const join: AuthoredNode = {
            id: `join-${crypto.randomUUID()}`,
            kind: 'join',
            pair: id,
            position: { x: position.x + 550, y: position.y },
          };
          n.pair = join.id;
          draft.nodes.push(join);
          for (let i = 0; i < 2; i++)
            draft.edges.push({
              id: `wire-${crypto.randomUUID()}`,
              kind: 'execution',
              source: id,
              sourcePin: n.kind === 'parallel' ? `track-${i}` : i === 0 ? 'then' : 'else',
              target: join.id,
              targetPin: `track-${i}`,
            });
        }
        if (picker!.from && template.pin) {
          const from = picker!.from;
          makeConnection(
            from.handleType === 'target'
              ? {
                  source: id,
                  sourceHandle: template.pin,
                  target: from.nodeId!,
                  targetHandle: from.handleId!.slice(5),
                }
              : {
                  source: from.nodeId!,
                  sourceHandle: from.handleId!.slice(5),
                  target: id,
                  targetHandle: template.pin,
                },
            draft,
            from.handleId!.startsWith('data:') ? 'data' : 'execution',
          );
        }
      });
      setSelected(new Set([id]));
      setPicker(undefined);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const openSpatial = useCallback(
    (id: string, parameter: string, type: 'position' | 'path') => {
      if (!map) {
        setMessage('Select the required cutscene map in Scene settings first.');
        return;
      }
      const n = graph.nodes.find((n) => n.id === id)!;
      let start: [number, number] | undefined;
      try {
        const projected = structuredClone(scene);
        delete projected.graphs;
        for (const key of ['onStart', 'sequence', 'completion'] as const)
          if (scene.graphs?.[key]) {
            const plan = validateGraphPlan(scene.graphs[key]!, scene, actions, key);
            if (key === 'sequence') projected.sequence = plan.steps;
            else if (key === 'onStart') projected.onStart = plan.steps;
            else projected.onComplete.steps = plan.steps;
          }
        // Only show a known authored starting position; incomplete graphs remain editable without inventing one.
        {
          const preview = previewCutscene(
            projected,
            map,
            types,
            baseActions,
            { kind: 'step', id },
            [...dialogues.keys()],
            project!.tileSize,
            resources,
          );
          start = preview.segments.find((s) => s.stepId === id)?.from;
        }
      } catch {
        /* The graph can be incomplete while the author edits a spatial parameter. */
      }
      const signature = graphSignature(n, scene, actions);
      const actorParameter = signature.inputs.find(
        (p) => p.semanticType === 'characterRef' && p.name === 'character',
      );
      const actor =
        actorParameter &&
        (graph.edges.some(
          (e) => e.kind === 'data' && e.target === id && e.targetPin === actorParameter.name,
        ) || n.step?.argumentVariables?.[actorParameter.name]
          ? 'Runtime target'
          : (roles.find((r) => r.id === n.step?.arguments[actorParameter.name])?.label ??
            String(n.step?.arguments[actorParameter.name] ?? 'Choose character')));
      setSpatial({
        id,
        title: `${signature.action?.displayName ?? 'Position'} · ${actor || parameter}`,
        parameter,
        type,
        nullable: signature.inputs.find((p) => p.name === parameter)!.nullable === true,
        value: structuredClone((n.step?.arguments ?? n.arguments ?? {})[parameter]),
        start,
      });
      setPicker(undefined);
    },
    [map, graph, scene, actions, types, baseActions, dialogues, project, resources, roles],
  );
  const characterReferences = useMemo(
    () => roles.map((actor) => ({ id: actor.id, name: actor.label })),
    [roles],
  );
  const argumentReferences = useMemo(
    () => ({
      anchors: (map?.spatialPrimitives?.anchors ?? []).map((anchor) => ({
        id: anchor.id,
        name: anchor.name || anchor.id,
      })),
      dialogues: [...dialogues.values()].map((dialogue) => ({
        id: dialogue.id,
        name: dialogue.name,
      })),
    }),
    [map, dialogues],
  );
  // Nodes need declarations, not the changing graph. Event callbacks read the latest operations.
  const nodeScene = useMemo(
    () => ({ id: scene.id, variables: scene.variables }),
    [scene.id, scene.variables],
  );
  const nodeOperations = useRef({ changeNode, openSpatial });
  nodeOperations.current = { changeNode, openSpatial };
  const editingContext = useMemo(
    () => ({
      scene: nodeScene,
      actions,
      resources,
      phase: phase === 'onStart' ? ('setup' as const) : phase,
      change: (id: string, change: (node: AuthoredNode) => void) =>
        nodeOperations.current.changeNode(id, change),
      spatial: (id: string, parameter: string, type: 'position' | 'path') =>
        nodeOperations.current.openSpatial(id, parameter, type),
      characterReferences,
      argumentReferences,
    }),
    [nodeScene, actions, resources, phase, characterReferences, argumentReferences],
  );
  return (
    <ResizableEditorLayout
      header={{ title: labels[scene.id] || scene.id }}
      viewportBackground={false}
      content={
        <TopTabbedEditorLayout
          title=""
          tabs={(['onStart', 'sequence', 'completion'] as const).map((key) => ({
            id: key,
            label:
              key === 'onStart'
                ? 'Before start'
                : key === 'completion'
                  ? 'On completion'
                  : 'Sequence',
            badge: scene.graphs?.[key]
              ? scene.graphs[key]!.nodes.filter((n) =>
                  ['action', 'lua', 'branch', 'parallel'].includes(n.kind),
                ).length
              : phaseSteps(scene, key).length,
          }))}
          activeTab={phase}
          onTabChange={(next) => {
            if (spatial) {
              setMessage('Finish or cancel the map edit first.');
              return;
            }
            setPhase(next);
            setSelected(new Set());
            setSelectedEdges(new Set());
            setPicker(undefined);
          }}
          headerActions={
            <>
              <Button
                size="xs"
                variant="outline"
                isDisabled={Boolean(spatial)}
                onClick={() => setSettings('scene')}
              >
                Scene settings
              </Button>
              {phase === 'completion' && (
                <Button size="xs" variant="outline" onClick={() => setSettings('completion')}>
                  Final positions
                </Button>
              )}
            </>
          }
          mainContent={
            <GraphEditingContext.Provider value={editingContext}>
              <Flex direction="column" h="full">
                <CutsceneGraphToolbar
                  disabled={Boolean(spatial)}
                  selection={
                    graph.nodes.some(
                      (n) => selected.has(n.id) && !['entry', 'exit'].includes(n.kind),
                    ) || selectedEdges.size > 0
                  }
                  canPaste={Boolean(clipboard?.nodes.length)}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  run={(command) => {
                    if (command === 'delete') removeSelection();
                    else if (command === 'duplicate')
                      pasteSelection(copyGraphSelection(graph, selected), 48);
                    else if (command === 'paste') pasteSelection();
                    else if (command === 'layout') autoLayout();
                    else if (command === 'fit') void flow.fitView({ padding: 0.15, duration: 200 });
                    else if (command === 'undo') useEditorStore.getState().undoCutscene(scene.id);
                    else if (command === 'redo') useEditorStore.getState().redoCutscene(scene.id);
                    else {
                      const rect = root.current!.getBoundingClientRect();
                      showPicker(rect.left + rect.width / 2, rect.top + 70);
                    }
                  }}
                />
                <Box
                  ref={root}
                  tabIndex={0}
                  className="cutscene-graph-canvas"
                  flex={1}
                  onKeyDown={(e) => {
                    if (spatial || settings) return;
                    if (e.key === 'Escape') {
                      setPicker(undefined);
                      setSelected(new Set());
                      setSelectedEdges(new Set());
                      root.current?.focus();
                      return;
                    }
                    const target = e.target as HTMLElement;
                    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
                    const key = e.key.toLowerCase();
                    const mod = e.ctrlKey || e.metaKey;
                    if (e.altKey) return;
                    if (mod && key === 'a') {
                      setSelected(new Set(graph.nodes.map((n) => n.id)));
                      setSelectedEdges(new Set(graph.edges.map((edge) => edge.id)));
                    } else if (mod && key === 'c') {
                      setClipboard(copyGraphSelection(graph, selected));
                      pasteOffset.current = 48;
                    } else if (mod && key === 'v') pasteSelection();
                    else if (mod && key === 'd')
                      pasteSelection(copyGraphSelection(graph, selected), 48);
                    else if (mod && (key === 'z' || key === 'y')) {
                      const state = useEditorStore.getState();
                      if (e.shiftKey || key === 'y') state.redoCutscene(scene.id);
                      else state.undoCutscene(scene.id);
                    } else if (!mod && (key === 'delete' || key === 'backspace')) removeSelection();
                    else if (!mod && key === 'f')
                      void flow.fitView({ padding: 0.15, duration: 200 });
                    else if (!mod && e.shiftKey && key === 'l') autoLayout();
                    else return;
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onPointerDownCapture={(e) => {
                    if (
                      !(e.target as HTMLElement).closest(
                        'input, textarea, select, button, [contenteditable="true"]',
                      )
                    )
                      root.current?.focus({ preventScroll: true });
                  }}
                >
                  {notice}
                  {(message || issues.length > 0) && (
                    <Box
                      position="absolute"
                      top={2}
                      left={2}
                      right={2}
                      zIndex={10}
                      bg="editorPanelBg"
                      borderWidth="1px"
                      borderColor="editorSequenceBorder"
                      p={2}
                    >
                      <Text
                        fontSize="xs"
                        color={issues.length ? 'editorDangerText' : 'editorMutedText'}
                      >
                        {message || issues[0].message}
                        {issues.length > 1 ? ` (${issues.length} issues)` : ''}
                      </Text>
                    </Box>
                  )}
                  <CutsceneGraphCanvas
                    nodes={viewNodes}
                    edges={viewEdges}
                    nodeTypes={nodeTypes}
                    onConnect={connect}
                    onConnectStart={(_, params) => {
                      connecting.current = params;
                    }}
                    onConnectEnd={onConnectEnd}
                    onNodeDragStart={(_, node, nodes) => {
                      draggingNodes.current = true;
                      // Other wires stay fixed during a single-node drag. Snapshot their graph
                      // geometry before highlighting can replace their SVG elements.
                      insertionWires.current =
                        nodes.length === 1 && ['action', 'lua'].includes(node.data.authored.kind)
                          ? graph.edges.flatMap((edge) => {
                              if (
                                edge.kind !== 'execution' ||
                                edge.source === node.id ||
                                edge.target === node.id
                              )
                                return [];
                              const element = Array.from(
                                root.current!.querySelectorAll<SVGGElement>('.react-flow__edge'),
                              ).find((el) => el.dataset.id === edge.id);
                              const path =
                                element?.querySelector<SVGPathElement>('.react-flow__edge-path');
                              if (!path) return [];
                              const points = [];
                              const total = path.getTotalLength();
                              for (let length = 0; length <= total; length += 10) {
                                const point = path.getPointAtLength(length);
                                points.push({ x: point.x, y: point.y });
                              }
                              return [{ id: edge.id, points }];
                            })
                          : [];
                    }}
                    onNodeDrag={(event, node, nodes) => {
                      insertionTarget.current =
                        nodes.length === 1 ? nearbyExecutionEdge(event, node) : undefined;
                      setInsertionEdge(insertionTarget.current);
                    }}
                    onNodeDragStop={(_, __, nodes) => finishDrag(nodes, insertionTarget.current)}
                    onPaneClick={() => {
                      if (droppingPin.current) return;
                      setPicker(undefined);
                    }}
                    onPaneContextMenu={(e) => {
                      e.preventDefault();
                      showPicker(e.clientX, e.clientY);
                    }}
                    onNodesChange={(changes) => {
                      const finished = changes.filter(
                        (c) => c.type === 'position' && c.position && c.dragging === false,
                      );
                      if (finished.length) {
                        if (draggingNodes.current) return;
                        update((draft) => {
                          for (const c of finished)
                            if (c.type === 'position' && c.position)
                              draft.nodes.find((n) => n.id === c.id)!.position = c.position;
                        });
                        return;
                      }
                      if (changes.some((c) => c.type === 'select'))
                        setSelected((previous) => {
                          const next = new Set(previous);
                          for (const c of changes)
                            if (c.type === 'select') {
                              if (c.selected) next.add(c.id);
                              else next.delete(c.id);
                            }
                          return next;
                        });
                    }}
                    onEdgesChange={(changes) => {
                      if (changes.some((c) => c.type === 'select'))
                        setSelectedEdges((previous) => {
                          const next = new Set(previous);
                          for (const c of changes)
                            if (c.type === 'select') {
                              if (c.selected) next.add(c.id);
                              else next.delete(c.id);
                            }
                          return next;
                        });
                    }}
                    onEdgeDoubleClick={(_, edge) =>
                      update((draft) => {
                        draft.edges = draft.edges.filter((e) => e.id !== edge.id);
                      })
                    }
                    defaultViewport={{ x: 50, y: 110, zoom: 0.8 }}
                    minZoom={0.2}
                    maxZoom={1.8}
                    deleteKeyCode={null}
                    nodesDraggable={!spatial}
                    nodesConnectable={!spatial}
                    edgesReconnectable={false}
                  >
                    <Background gap={24} size={1} />
                    <Controls showInteractive={false} />
                  </CutsceneGraphCanvas>
                  {picker && (
                    <Box
                      className="cutscene-graph-picker"
                      style={{ left: picker.x, top: picker.y }}
                    >
                      <HStack mb={2}>
                        <Input
                          autoFocus
                          size="sm"
                          placeholder={
                            picker.from ? 'Search compatible functions…' : 'Search nodes…'
                          }
                          aria-label="Search graph nodes"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                        <Button size="xs" onClick={() => setPicker(undefined)}>
                          ×
                        </Button>
                      </HStack>
                      <Select
                        size="xs"
                        mb={2}
                        aria-label="Node category"
                        value={pickerCategory}
                        onChange={(e) => setPickerCategory(e.target.value)}
                      >
                        <option value="">All categories</option>
                        {categories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </Select>
                      {picker.from && (
                        <Text fontSize="10px" color="editorMutedText" mb={2}>
                          Compatible nodes · connects the first matching pin
                        </Text>
                      )}
                      <Box className="cutscene-graph-picker-results">
                        {visibleChoices.map((choice) => (
                          <Button
                            key={choice.id}
                            size="xs"
                            variant="ghost"
                            w="full"
                            justifyContent="start"
                            fontWeight="normal"
                            onClick={() => insert(choice)}
                          >
                            {choice.label}
                            {choice.pin ? ` → ${choice.pin}` : ''}
                          </Button>
                        ))}
                        {!visibleChoices.length && (
                          <Text fontSize="xs" p={2}>
                            No compatible functions or values.
                          </Text>
                        )}
                      </Box>
                    </Box>
                  )}
                  {spatial && map && (
                    <CutsceneSpatialEditor
                      map={map}
                      tileSize={project!.tileSize}
                      title={spatial.title}
                      value={spatial.value}
                      path={spatial.type === 'path'}
                      nullable={spatial.nullable}
                      start={spatial.start}
                      onCancel={() => setSpatial(undefined)}
                      onDone={(value) => {
                        const next = structuredClone(graph);
                        const n = next.nodes.find((n) => n.id === spatial.id);
                        if (!n) {
                          setSpatial(undefined);
                          setMessage(
                            'The edited node was removed by undo. The map draft was not applied.',
                          );
                          return;
                        }
                        (n.step?.arguments ?? (n.arguments ??= {}))[spatial.parameter] = value;
                        edit((scenes) => {
                          setPhaseGraph(scenes.find((s) => s.id === scene.id)!, phase, next);
                        });
                        setSpatial(undefined);
                      }}
                    />
                  )}
                  <EditorModal
                    isOpen={Boolean(settings)}
                    onClose={() => setSettings(undefined)}
                    size="2xl"
                  >
                    <Box bg="editorPanelBg" borderRadius="lg" maxH="85vh" overflow="auto">
                      <ModalHeader>
                        {settings === 'completion' ? 'Final positions' : 'Scene settings'}
                      </ModalHeader>
                      <ModalCloseButton />
                      <ModalBody pb={5}>
                        {settings && (
                          <CutsceneSettings
                            scene={scene}
                            mode={settings}
                            characterOptions={roles}
                          />
                        )}
                      </ModalBody>
                    </Box>
                  </EditorModal>
                </Box>
              </Flex>
            </GraphEditingContext.Provider>
          }
        />
      }
    />
  );
}
export const CutsceneGraphEditor = (props: { scene: Cutscene; notice?: React.ReactNode }) => (
  <ReactFlowProvider>
    <GraphWorkspace {...props} />
  </ReactFlowProvider>
);
