import { z } from 'zod';
import type { Quest, QuestObjective, QuestStep } from '../types/quest';
import type { QuestGraph, QuestGraphNode } from '../types/questGraph';
import type { CutsceneData, CutsceneVariable } from '../types/cutscene';
import type { ScriptingAction, ScriptingManifest, ScriptingResources } from './scriptingManifest';
import { bindingUnavailableReason, SCRIPT_SCOPE } from './luaBindings';
import { withProjectCharacters } from './scriptingManifest';
import { cutsceneDataSchema, canonicalVariableType, validVariableValue } from './cutsceneVariables';

export const questGraphSchema = z.strictObject({
  nodes: z.array(
    z.strictObject({
      id: z.string().min(1),
      kind: z.enum(['entry', 'exit', 'failure', 'step', 'action', 'lua']),
      position: z.strictObject({ x: z.number().finite(), y: z.number().finite() }),
      stepId: z.string().optional(),
      group: z.boolean().optional(),
      comment: z.string().optional(),
      action: z
        .strictObject({
          method: z.string().min(1),
          arguments: z.record(z.string(), cutsceneDataSchema),
        })
        .optional(),
      code: z.string().optional(),
    }),
  ),
  edges: z.array(
    z.strictObject({
      id: z.string().min(1),
      source: z.string(),
      target: z.string(),
      sourcePin: z.literal('next'),
      targetPin: z.literal('in'),
      kind: z.literal('execution'),
    }),
  ),
});

export const questStepLabels: Record<QuestObjective['kind'] | 'group', string> = {
  talk: 'Talk to character',
  deliver: 'Deliver items',
  have: 'Have items',
  reach: 'Reach location',
  condition: 'Wait for condition',
  group: 'Complete objectives',
};

export function newQuestObjective(kind: QuestObjective['kind'], id: string): QuestObjective {
  const base = { id, text: questStepLabels[kind] };
  if (kind === 'talk') return { ...base, kind, character: '' };
  if (kind === 'deliver') return { ...base, kind, character: '', item: '', count: 1 };
  if (kind === 'have') return { ...base, kind, item: '', count: 1 };
  if (kind === 'reach') return { ...base, kind, map: '' };
  return { ...base, kind, condition: 'false' };
}

/** Project-authored items must be selectable before Unity next regenerates its catalog export. */
export function questActionResources(
  manifest: ScriptingManifest | null,
  content: {
    characters: readonly { id: string; name: string }[];
    items: readonly { id: string; name: string }[];
  },
): ScriptingResources {
  return {
    ...withProjectCharacters(manifest?.resources, content.characters),
    item: [
      ...new Map(
        [
          ...(manifest?.resources?.item ?? []),
          ...content.items.map((i) => ({ id: i.id, description: i.name })),
        ].map((i) => [i.id, i]),
      ).values(),
    ],
  };
}

/** Same exported signatures and parameter widgets as cutscenes, limited to the synchronous quest API. */
export function questActions(manifest: ScriptingManifest | null): ScriptingAction[] {
  return (manifest?.modules ?? []).flatMap((module) =>
    module.methods.flatMap((method) => {
      if (!method.writesState || bindingUnavailableReason(method, SCRIPT_SCOPE)) return [];
      // Spatial/session-owned actions need a cutscene; quests use immediate, ordinary Lua calls.
      if (method.parameters.some((p) => ['position', 'path'].includes(p.type))) return [];
      const path = `${module.path}.${method.name}`;
      return [
        {
          id: path,
          displayName:
            method.action?.displayName ?? method.name.replace(/([a-z])([A-Z])/g, '$1 $2'),
          category: method.action?.category ?? module.path,
          description:
            method.action?.description ??
            (typeof method.description === 'string' ? method.description : path),
          contexts: ['quest'],
          execution: 'immediate' as const,
          phases: ['sequence' as const],
          parameters: method.parameters,
          outputs: [],
        },
      ];
    }),
  );
}

export function questWire(source: string, target: string): QuestGraph['edges'][number] {
  return {
    id: `wire-${crypto.randomUUID()}`,
    source,
    target,
    sourcePin: 'next',
    targetPin: 'in',
    kind: 'execution',
  };
}

/** Read existing quests without renaming persistent steps/objectives or modifying scripts. */
export function graphFromQuest(quest: Quest): QuestGraph {
  if (quest.editorGraph) return quest.editorGraph;
  const nodes: QuestGraphNode[] = [{ id: 'begin', kind: 'entry', position: { x: 0, y: 120 } }];
  const edges: QuestGraph['edges'] = [];
  const append = (node: Omit<QuestGraphNode, 'position'>) => {
    edges.push(questWire(nodes[nodes.length - 1].id, node.id));
    nodes.push({ ...node, position: { x: nodes.length * 340, y: 120 } });
  };
  if (quest.onStart) append({ id: 'start-script', kind: 'lua', code: quest.onStart });
  quest.steps.forEach((step, index) => {
    append({
      id: `step-node-${index}`,
      kind: 'step',
      stepId: step.id,
      group: step.objectives.length > 1,
    });
    if (step.onComplete) append({ id: `step-script-${index}`, kind: 'lua', code: step.onComplete });
  });
  // This terminal is the boundary between the last step's actions and quest completion actions.
  append({ id: 'complete', kind: 'exit' });
  if (quest.onComplete) append({ id: 'completion-script', kind: 'lua', code: quest.onComplete });
  if (quest.onFail) {
    nodes.push({ id: 'failure', kind: 'failure', position: { x: 0, y: 540 } });
    nodes.push({
      id: 'failure-script',
      kind: 'lua',
      code: quest.onFail,
      position: { x: 340, y: 540 },
    });
    edges.push(questWire('failure', 'failure-script'));
  }
  return { nodes, edges };
}

// Lua strings use decimal escapes for controls: JSON's \u escapes are not Lua escapes.
function literal(value: CutsceneData): string {
  if (value === null) return 'nil';
  if (typeof value === 'string')
    return (
      '"' +
      // eslint-disable-next-line no-control-regex -- Lua literals require decimal escapes for control characters.
      value.replace(/[\\"\x00-\x1f\x7f]/g, (c) =>
        c === '\\'
          ? '\\\\'
          : c === '"'
            ? '\\"'
            : '\\' + c.charCodeAt(0).toString().padStart(3, '0'),
      ) +
      '"'
    );
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return `{${value.map(literal).join(', ')}}`;
  return `{${Object.entries(value)
    .map(([key, entry]) => `[${literal(key)}] = ${literal(entry)}`)
    .join(', ')}}`;
}

/** Compile one linear execution chain, never execute it. Disconnected/cyclic/branched drafts cannot save. */
export function compileQuestGraph(
  quest: Quest,
  manifest: ScriptingManifest | null,
  resources: ScriptingResources = manifest?.resources ?? {},
): Quest {
  const graph = quest.editorGraph;
  if (!graph) return quest;
  questGraphSchema.parse(graph);
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const fail = (message: string): never => {
    throw new Error(`Quest graph: ${message}`);
  };
  if (nodes.size !== graph.nodes.length) fail('duplicate node ID.');
  if (new Set(graph.edges.map((e) => e.id)).size !== graph.edges.length) fail('duplicate wire ID.');
  for (const edge of graph.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) fail('wire refers to a missing node.');
    if (graph.edges.filter((e) => e.source === edge.source).length > 1)
      fail('branching is not supported yet.');
    if (graph.edges.filter((e) => e.target === edge.target).length > 1)
      fail('a node can only have one incoming wire.');
  }
  const begins = graph.nodes.filter((n) => n.kind === 'entry');
  const exits = graph.nodes.filter((n) => n.kind === 'exit');
  const failures = graph.nodes.filter((n) => n.kind === 'failure');
  if (begins.length !== 1 || exits.length !== 1 || failures.length > 1)
    fail('requires one Begin and one Complete quest.');
  for (const root of [...begins, ...failures])
    if (graph.edges.some((e) => e.target === root.id))
      fail('Begin and On failure cannot have incoming wires.');
  const actions = questActions(manifest);
  const code = (node: QuestGraphNode): string => {
    if (node.kind === 'lua') return `do\n${node.code ?? ''}\nend`;
    const action = actions.find((a) => a.id === node.action?.method);
    if (!action || !node.action)
      return fail(`unknown or unavailable action on ${node.id}. Load the bindings manifest.`);
    const args = node.action.arguments;
    if (Object.keys(args).some((name) => !action.parameters.some((p) => p.name === name)))
      fail(`${node.id}: unknown argument.`);
    const values = action.parameters.map((p) => {
      const value = args[p.name] ?? (p.nullable && args[p.name] === null ? null : p.defaultValue);
      if (
        value === undefined ||
        !validVariableValue(
          { type: canonicalVariableType(p.type) as CutsceneVariable['type'], nullable: p.nullable },
          value,
        )
      )
        return fail(`${node.id}.${p.name}: requires ${p.type}${p.nullable ? ' or nil' : ''}.`);
      if (
        value !== null &&
        p.resourceType &&
        resources[p.resourceType] &&
        !resources[p.resourceType].some((r) => r.id === value)
      )
        fail(`${node.id}.${p.name}: unknown ${p.resourceType} ${String(value)}.`);
      return literal(value as CutsceneData);
    });
    return `${action.id}(${values.join(', ')})`;
  };
  const visited = new Set<string>();
  const steps: QuestStep[] = [];
  const scripts: string[][] = [[]];
  const completion: string[] = [];
  const failure: string[] = [];
  let completed = false;
  const walk = (root: QuestGraphNode, failed: boolean) => {
    let node: QuestGraphNode | undefined = root;
    while (node) {
      if (visited.has(node.id)) fail('cycle or shared execution path.');
      visited.add(node.id);
      if (node.kind === 'step') {
        if (completed || failed) fail('quest steps must be between Begin and Complete quest.');
        const step = quest.steps.find((s) => s.id === node!.stepId);
        if (!step || steps.some((s) => s.id === step.id))
          fail(`missing or repeated step ${node.stepId}.`);
        steps.push({ ...step!, onComplete: undefined });
        scripts.push([]);
      } else if (node.kind === 'exit') {
        if (failed) fail('On failure may only connect to actions or scripts.');
        completed = true;
      } else if (node.kind === 'lua' || node.kind === 'action') {
        (failed ? failure : completed ? completion : scripts[scripts.length - 1]).push(code(node));
      } else if (node !== root) fail('execution cannot enter another root.');
      const edge = graph.edges.find((e) => e.source === node!.id);
      node = edge ? nodes.get(edge.target) : undefined;
    }
  };
  walk(begins[0], false);
  if (!completed) fail('connect Begin to Complete quest.');
  if (failures.length) walk(failures[0], true);
  if (visited.size !== nodes.size) fail('connect or remove disconnected nodes.');
  if (!steps.length || steps.length !== quest.steps.length)
    fail('each quest step must appear once in the flow.');
  const join = (parts: string[]) => (parts.length ? parts.join('\n') : undefined);
  return {
    ...quest,
    steps: steps.map((step, i) => ({ ...step, onComplete: join(scripts[i + 1]) })),
    onStart: join(scripts[0]),
    onComplete: join(completion),
    onFail: join(failure),
  };
}

/** Allow incomplete wiring while editing; save still requires a successful compilation. */
export function editQuestGraph(
  quest: Quest,
  graph: QuestGraph,
  manifest: ScriptingManifest | null,
  resources?: ScriptingResources,
): Quest {
  const draft = { ...quest, editorGraph: graph };
  try {
    return compileQuestGraph(draft, manifest, resources);
  } catch {
    return draft;
  }
}

export function removeQuestNode(graph: QuestGraph, id: string): QuestGraph {
  const incoming = graph.edges.find((e) => e.target === id);
  const outgoing = graph.edges.find((e) => e.source === id);
  return {
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: [
      ...graph.edges.filter((e) => e.source !== id && e.target !== id),
      ...(incoming && outgoing ? [questWire(incoming.source, outgoing.target)] : []),
    ],
  };
}
