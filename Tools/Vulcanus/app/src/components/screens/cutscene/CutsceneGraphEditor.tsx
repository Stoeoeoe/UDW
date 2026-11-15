import { EditorHeaderActions } from '../../common/EditorDocumentFrame';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { produce } from 'immer';
import { Box, Button, ModalBody, ModalCloseButton, ModalHeader, Text } from '@chakra-ui/react';
import {
  ReactFlowProvider,
  Background,
  Controls,
  MarkerType,
  useReactFlow,
  type Connection,
  type Edge,
} from '@xyflow/react';
import { useEditorStore } from '../../../store/useEditorStore';
import {
  copyGraphSelection,
  pasteGraphSelection,
  deleteGraphSelection,
  layoutGraph,
  insertExecutionNode,
} from '../../../lib/graphEditing';
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
import { GraphCanvas } from '../../common/graph/GraphCanvas';
import { GraphEditorShell } from '../../common/graph/GraphEditorShell';
import { useGraphEditor } from '../../common/graph/useGraphEditor';
import type { GraphCommand } from '../../common/graph/GraphEditorToolbar';
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
  const [clipboard, setClipboard] = useState<CutsceneGraph>();
  const pasteOffset = useRef(48);
  const [message, setMessage] = useState('');
  const [spatial, setSpatial] = useState<{
    id: string;
    title: string;
    parameter: string;
    type: 'position' | 'path';
    nullable: boolean;
    value: CutsceneData | undefined;
    start?: [number, number];
  }>();
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
  const edit = useEditorStore((s) => s.editCutscenes);
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
  const operations = useRef<{
    run: (command: GraphCommand) => void;
    move: (nodes: { id: string; position: { x: number; y: number } }[]) => void;
    finishDrag: (nodes: GraphViewNode[], edge?: string) => void;
  }>(null!);
  const editor = useGraphEditor<GraphViewNode>({
    nodes: graph.nodes,
    edges: graph.edges,
    disabled: Boolean(spatial || settings),
    run: (command) => operations.current.run(command),
    move: (nodes) => operations.current.move(nodes),
    finishDrag: (nodes, edge) => operations.current.finishDrag(nodes, edge),
    insertable: (node) => ['action', 'lua'].includes(node.data.authored.kind),
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
    update((draft) => layoutGraph(draft, sizes));
    requestAnimationFrame(() => {
      void flow.fitView({ padding: 0.15, duration: 200 });
    });
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
      throw new Error('Read-only nodes have data pins only');
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
    [
      map,
      graph,
      scene,
      actions,
      types,
      baseActions,
      dialogues,
      project,
      resources,
      roles,
      setPicker,
    ],
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
  operations.current = {
    run: (command) => {
      if (command === 'delete') removeSelection();
      else if (command === 'copy') {
        setClipboard(copyGraphSelection(graph, selected));
        pasteOffset.current = 48;
      } else if (command === 'duplicate') pasteSelection(copyGraphSelection(graph, selected), 48);
      else if (command === 'paste') pasteSelection();
      else if (command === 'layout') autoLayout();
      else if (command === 'undo') useEditorStore.getState().undoCutscene(scene.id);
      else if (command === 'redo') useEditorStore.getState().redoCutscene(scene.id);
    },
    move: (nodes) =>
      update((draft) => {
        for (const node of nodes)
          draft.nodes.find((n) => n.id === node.id)!.position = node.position;
      }),
    finishDrag: (nodes, edge) =>
      update((draft) => {
        for (const node of nodes)
          draft.nodes.find((n) => n.id === node.id)!.position = node.position;
        if (edge && nodes.length === 1) insertExecutionNode(draft, nodes[0].id, edge);
      }),
  };
  return (
    <ResizableEditorLayout
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
              <EditorHeaderActions>
                <Button
                  size="sm"
                  variant="outline"
                  isDisabled={Boolean(spatial)}
                  onClick={() => setSettings('scene')}
                >
                  Settings
                </Button>
              </EditorHeaderActions>
              {phase === 'completion' && (
                <Button size="xs" variant="outline" onClick={() => setSettings('completion')}>
                  Final positions
                </Button>
              )}
            </>
          }
          mainContent={
            <GraphEditingContext.Provider value={editingContext}>
              <GraphEditorShell
                editor={editor}
                choices={choices}
                onInsert={insert}
                canPaste={Boolean(clipboard?.nodes.length)}
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
                <GraphCanvas
                  nodes={viewNodes}
                  edges={viewEdges}
                  nodeTypes={nodeTypes}
                  onConnect={connect}
                  {...editor.canvasProps}
                  onEdgeDoubleClick={(_, edge) =>
                    update((draft) => {
                      draft.edges = draft.edges.filter((e) => e.id !== edge.id);
                    })
                  }
                  defaultViewport={{ x: 50, y: 110, zoom: 0.8 }}
                >
                  <Background gap={24} size={1} />
                  <Controls showInteractive={false} />
                </GraphCanvas>
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
                        <CutsceneSettings scene={scene} mode={settings} characterOptions={roles} />
                      )}
                    </ModalBody>
                  </Box>
                </EditorModal>
              </GraphEditorShell>
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
