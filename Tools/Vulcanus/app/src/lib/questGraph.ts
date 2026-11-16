import { z } from 'zod';
import type { Quest, QuestObjective, QuestStep } from '../types/quest';
import type { QuestGraph, QuestGraphNode } from '../types/questGraph';
import type { CutsceneData, CutsceneVariable } from '../types/cutscene';
import type { ScriptingAction, ScriptingManifest, ScriptingResources } from './scriptingManifest';
import { bindingUnavailableReason, CONDITION_SCOPE, SCRIPT_SCOPE } from './luaBindings';
import { withProjectCharacters } from './scriptingManifest';
import {
  cutsceneDataSchema,
  canonicalVariableType,
  validVariableValue,
  variableCompatible,
} from './cutsceneVariables';

export const questGraphSchema = z.strictObject({
  nodes: z.array(
    z.strictObject({
      id: z.string().min(1),
      kind: z.enum([
        'entry',
        'exit',
        'failure',
        'step',
        'action',
        'lua',
        'branch',
        'function',
        'expression',
      ]),
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
      method: z.string().min(1).optional(),
      arguments: z.record(z.string(), cutsceneDataSchema).optional(),
      expression: z.string().optional(),
      outputs: z
        .array(
          z.strictObject({
            name: z.string().min(1),
            type: z.enum(['string', 'number', 'boolean', 'position', 'table', 'storyValue']),
            nullable: z.boolean().optional(),
          }),
        )
        .optional(),
    }),
  ),
  edges: z.array(
    z.union([
      z.strictObject({
        id: z.string().min(1),
        source: z.string(),
        target: z.string(),
        sourcePin: z.string().regex(/^(next|then|else|objective:.+)$/),
        targetPin: z.literal('in'),
        kind: z.literal('execution'),
      }),
      // A value wire: from a read-only node's output to an input of an action, function or Branch.
      z.strictObject({
        id: z.string().min(1),
        source: z.string(),
        target: z.string(),
        sourcePin: z.string().min(1),
        targetPin: z.string().min(1),
        kind: z.literal('data'),
      }),
    ]),
  ),
});

/** The `next` that completes the quest; steps cannot be called this. */
export const questEnd = 'end';

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

/** The output pin of an objective whose wire is that objective's `next`. */
export const objectivePin = (objectiveId: string) => `objective:${objectiveId}`;

/** Read-only calls that return one value: the same isolated API quest conditions use. */
export function questFunctions(manifest: ScriptingManifest | null): ScriptingAction[] {
  return (manifest?.modules ?? []).flatMap((module) =>
    module.methods.flatMap((method) => {
      if (
        method.writesState ||
        (method.action && method.callable !== true) ||
        bindingUnavailableReason(method, CONDITION_SCOPE)
      )
        return [];
      const outputs =
        method.outputs ??
        (method.returnType && method.returnType !== 'nil'
          ? [{ name: 'result', type: method.returnType, nullable: method.returnNullable }]
          : []);
      if (outputs.length !== 1) return [];
      const path = `${module.path}.${method.name}`;
      return [
        {
          id: `pure:${path}`,
          displayName: path,
          category: method.action?.category ?? module.path,
          description: 'Read-only Lua function',
          contexts: ['quest'],
          execution: 'immediate' as const,
          phases: ['sequence' as const],
          parameters: method.parameters,
          outputs,
        },
      ];
    }),
  );
}

/** A wire carrying a value from a read-only node's output to an input. */
export function questDataWire(
  source: string,
  sourcePin: string,
  target: string,
  targetPin: string,
): QuestGraph['edges'][number] {
  return {
    id: `wire-${crypto.randomUUID()}`,
    source,
    sourcePin,
    target,
    targetPin,
    kind: 'data',
  };
}

export function questWire(
  source: string,
  target: string,
  sourcePin = 'next',
): QuestGraph['edges'][number] {
  return {
    id: `wire-${crypto.randomUUID()}`,
    source,
    target,
    sourcePin,
    targetPin: 'in',
    kind: 'execution',
  };
}

/** Read existing quests without renaming persistent steps/objectives or modifying scripts. */
export function graphFromQuest(quest: Quest): QuestGraph {
  if (quest.editorGraph) return quest.editorGraph;
  const nodes: QuestGraphNode[] = [{ id: 'begin', kind: 'entry', position: { x: 0, y: 120 } }];
  const edges: QuestGraph['edges'] = [];
  const place = (node: Omit<QuestGraphNode, 'position'>) =>
    nodes.push({ ...node, position: { x: nodes.length * 340, y: 120 } });
  let start = 'begin';
  if (quest.onStart) {
    place({ id: 'start-script', kind: 'lua', code: quest.onStart });
    edges.push(questWire('begin', 'start-script'));
    start = 'start-script';
  }
  // A step's own wire leaves from its last script, if it has any.
  const stepNodes = new Map<string, { node: string; last: string }>();
  quest.steps.forEach((step, index) => {
    const node = `step-node-${index}`;
    place({ id: node, kind: 'step', stepId: step.id, group: step.objectives.length > 1 });
    let last = node;
    if (step.onComplete) {
      last = `step-script-${index}`;
      place({ id: last, kind: 'lua', code: step.onComplete });
      edges.push(questWire(node, last));
    }
    stepNodes.set(step.id, { node, last });
  });
  // This terminal is the boundary between the last step's actions and quest completion actions.
  place({ id: 'complete', kind: 'exit' });
  const target = (id: string) => (id === questEnd ? 'complete' : stepNodes.get(id)?.node);
  quest.steps.forEach((step, index) => {
    const { node, last } = stepNodes.get(step.id)!;
    const next = target(step.next ?? quest.steps[index + 1]?.id ?? questEnd);
    // Each condition is a Branch node; False leads to the next one, and finally to where the step goes otherwise.
    let from = { id: last, pin: 'next' };
    const x = nodes.find((n) => n.id === node)!.position.x;
    step.nextIf?.forEach((branch, i) => {
      const id = `step-branch-${index}-${i}`;
      const condition = `step-condition-${index}-${i}`;
      nodes.push(
        {
          id,
          kind: 'branch',
          arguments: { condition: false },
          position: { x: x + 340 * (i + 1), y: 360 },
        },
        {
          id: condition,
          kind: 'expression',
          expression: branch.condition,
          outputs: [{ name: 'value', type: 'boolean' }],
          position: { x: x + 340 * (i + 1), y: 640 },
        },
      );
      edges.push(questDataWire(condition, 'value', id, 'condition'));
      edges.push(questWire(from.id, id, from.pin));
      const yes = target(branch.next);
      if (yes) edges.push(questWire(id, yes, 'then'));
      from = { id, pin: 'else' };
    });
    if (next) edges.push(questWire(from.id, next, from.pin));
    for (const objective of step.objectives) {
      const branch = objective.next && target(objective.next);
      if (branch) edges.push(questWire(node, branch, objectivePin(objective.id)));
    }
  });
  const first = quest.steps[0] ? stepNodes.get(quest.steps[0].id)!.node : 'complete';
  edges.push(questWire(start, first));
  if (quest.onComplete) {
    place({ id: 'completion-script', kind: 'lua', code: quest.onComplete });
    edges.push(questWire('complete', 'completion-script'));
  }
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
  const execEdges = graph.edges.filter((e) => e.kind === 'execution');
  const dataEdges = graph.edges.filter((e) => e.kind === 'data');
  const pureKinds = ['function', 'expression'];
  for (const edge of execEdges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) return fail('wire refers to a missing node.');
    if (pureKinds.includes(source.kind) || pureKinds.includes(target.kind))
      fail('read-only nodes have value pins only.');
    if (
      execEdges.some(
        (e) => e !== edge && e.source === edge.source && e.sourcePin === edge.sourcePin,
      )
    )
      fail('an output can only have one wire.');
    // Steps and Complete quest join several paths; a script or action belongs to exactly one.
    if (
      !['step', 'exit'].includes(target.kind) &&
      execEdges.filter((e) => e.target === edge.target).length > 1
    )
      fail('a node can only have one incoming wire.');
    if (source.kind === 'branch' && edge.sourcePin === 'next')
      fail('a Branch continues through its True and False outputs.');
    if (edge.sourcePin === 'then' || edge.sourcePin === 'else') {
      if (source.kind !== 'branch') fail('only a Branch has True and False outputs.');
    } else if (edge.sourcePin !== 'next') {
      const objectives = quest.steps.find((s) => s.id === source.stepId)?.objectives ?? [];
      if (source.kind !== 'step' || !objectives.some((o) => objectivePin(o.id) === edge.sourcePin))
        fail('a wire leaves an objective that does not exist.');
      if (!['step', 'exit'].includes(target.kind))
        fail('an objective can only continue to a step or Complete quest.');
    }
  }
  const begins = graph.nodes.filter((n) => n.kind === 'entry');
  const exits = graph.nodes.filter((n) => n.kind === 'exit');
  const failures = graph.nodes.filter((n) => n.kind === 'failure');
  if (begins.length !== 1 || exits.length !== 1 || failures.length > 1)
    fail('requires one Begin and one Complete quest.');
  for (const root of [...begins, ...failures])
    if (execEdges.some((e) => e.target === root.id))
      fail('Begin and On failure cannot have incoming wires.');
  const actions = questActions(manifest);
  const functions = questFunctions(manifest);
  const signatureOf = (node: QuestGraphNode) => {
    const none = {
      inputs: [] as ScriptingAction['parameters'],
      outputs: [] as NonNullable<ScriptingAction['outputs']>,
    };
    if (node.kind === 'function') {
      const found = functions.find((f) => f.id === `pure:${node.method}`);
      if (!found)
        return fail(`unknown or unavailable function ${node.method}. Load the bindings manifest.`);
      return { inputs: found.parameters, outputs: found.outputs ?? [] };
    }
    if (node.kind === 'expression') return { ...none, outputs: node.outputs ?? [] };
    if (node.kind === 'branch')
      return {
        ...none,
        inputs: [{ name: 'condition', type: 'boolean' }] as ScriptingAction['parameters'],
      };
    if (node.kind === 'action') {
      const found = actions.find((a) => a.id === node.action?.method);
      return found ? { ...none, inputs: found.parameters } : none;
    }
    return none;
  };
  for (const edge of dataEdges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) return fail('wire refers to a missing node.');
    if (!pureKinds.includes(source.kind)) fail('only read-only nodes have value outputs.');
    const output = signatureOf(source).outputs.find((p) => p.name === edge.sourcePin);
    const input = signatureOf(target).inputs.find((p) => p.name === edge.targetPin);
    if (!output || !input || !variableCompatible(output, input))
      fail('connect matching value types.');
    if (
      dataEdges.some(
        (e) => e !== edge && e.target === edge.target && e.targetPin === edge.targetPin,
      )
    )
      fail('an input can only have one wire.');
  }
  const pureSeen = new Set<string>();
  const building = new Set<string>();
  /** The value of each parameter: the wired read-only node's expression, else the node's own literal. */
  const argumentValues = (
    node: QuestGraphNode,
    parameters: ScriptingAction['parameters'],
    given: Record<string, CutsceneData>,
  ) => {
    if (Object.keys(given).some((name) => !parameters.some((p) => p.name === name)))
      fail(`${node.id}: unknown argument.`);
    return parameters.map((p) => {
      const wire = dataEdges.find((e) => e.target === node.id && e.targetPin === p.name);
      if (wire) return expressionOf(nodes.get(wire.source)!);
      const value = given[p.name] ?? (p.nullable && given[p.name] === null ? null : p.defaultValue);
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
  };
  /** A read-only node as one Lua expression; nothing runs here. */
  const expressionOf = (node: QuestGraphNode): string => {
    if (building.has(node.id)) fail('read-only nodes cannot depend on themselves.');
    building.add(node.id);
    pureSeen.add(node.id);
    let result: string;
    if (node.kind === 'expression') {
      if (!node.expression?.trim()) fail(`${node.id}: write the expression.`);
      result = node.expression!.trim();
    } else {
      const signature = signatureOf(node);
      result = `${node.method}(${argumentValues(node, signature.inputs, node.arguments ?? {}).join(', ')})`;
    }
    building.delete(node.id);
    return result;
  };
  const conditionOf = (node: QuestGraphNode) => {
    const wire = dataEdges.find((e) => e.target === node.id && e.targetPin === 'condition');
    return wire
      ? expressionOf(nodes.get(wire.source)!)
      : String(node.arguments?.condition === true);
  };
  const code = (node: QuestGraphNode): string => {
    if (node.kind === 'lua') return `do\n${node.code ?? ''}\nend`;
    const action = actions.find((a) => a.id === node.action?.method);
    if (!action || !node.action)
      return fail(`unknown or unavailable action on ${node.id}. Load the bindings manifest.`);
    return `${action.id}(${argumentValues(node, action.parameters, node.action.arguments).join(', ')})`;
  };
  const scriptsSeen = new Set<string>();
  /** The scripts on a wire's way to the next step or Complete quest, and what it ends at. */
  const follow = (from: QuestGraphNode, pin: string) => {
    const scripts: string[] = [];
    let edge = execEdges.find((e) => e.source === from.id && e.sourcePin === pin);
    while (edge) {
      const node = nodes.get(edge.target)!;
      if (node.kind === 'step' || node.kind === 'exit' || node.kind === 'branch')
        return { scripts, target: node };
      if (node.kind !== 'lua' && node.kind !== 'action')
        return fail('execution cannot enter another root.');
      if (scriptsSeen.has(node.id)) fail('cycle or shared execution path.');
      scriptsSeen.add(node.id);
      scripts.push(code(node));
      edge = execEdges.find((e) => e.source === node.id && e.sourcePin === 'next');
    }
    return { scripts, target: undefined };
  };
  interface Flow {
    step: QuestStep;
    scripts: string[];
    next?: QuestGraphNode;
    branches: Map<string, QuestGraphNode>;
    conditions: { condition: string; target: QuestGraphNode }[];
  }
  const branchesSeen = new Set<string>();
  /** A step's Branch nodes, True outputs first: the conditions in order, then where False finally leads. */
  const resolveBranches = (first: QuestGraphNode) => {
    const conditions: Flow['conditions'] = [];
    let node = first;
    while (node.kind === 'branch') {
      if (branchesSeen.has(node.id)) fail('a Branch can only follow one step.');
      branchesSeen.add(node.id);
      const wire = (pin: string) =>
        execEdges.find((e) => e.source === node.id && e.sourcePin === pin);
      const yes = wire('then');
      const no = wire('else');
      if (!yes || !no) fail('connect both the True and False outputs of every Branch.');
      const between =
        'between steps, True continues to a step or Complete quest and False also to another If / Else; ' +
        'put actions in an If / Else after Complete quest.';
      if (!['step', 'exit'].includes(nodes.get(yes!.target)!.kind)) fail(between);
      if (!['step', 'exit', 'branch'].includes(nodes.get(no!.target)!.kind)) fail(between);
      conditions.push({ condition: conditionOf(node), target: nodes.get(yes!.target)! });
      node = nodes.get(no!.target)!;
    }
    return { conditions, fallback: node };
  };
  const flows: Flow[] = [];
  const state = new Map<string, 'open' | 'done'>();
  let completes = false;
  /** Depth first, so the list reads along the main path with branches after it. */
  const enter = (node: QuestGraphNode) => {
    if (node.kind === 'exit') {
      completes = true;
      return;
    }
    if (state.get(node.id) === 'open') fail('the steps loop back on themselves.');
    if (state.has(node.id)) return;
    state.set(node.id, 'open');
    const step = quest.steps.find((s) => s.id === node.stepId);
    if (!step || flows.some((f) => f.step.id === step.id))
      fail(`missing or repeated step ${node.stepId}.`);
    const followed = follow(node, 'next');
    const resolved =
      followed.target?.kind === 'branch' ? resolveBranches(followed.target) : undefined;
    const next = {
      scripts: followed.scripts,
      target: resolved ? resolved.fallback : followed.target,
    };
    const branches = new Map<string, QuestGraphNode>();
    for (const objective of step!.objectives) {
      const wire = execEdges.find(
        (e) => e.source === node.id && e.sourcePin === objectivePin(objective.id),
      );
      if (wire) branches.set(objective.id, nodes.get(wire.target)!);
    }
    // Without a wire the step still completes through Lua or the following step, but only if objectives can't take it.
    if (!next.target && branches.size < step!.objectives.length)
      fail(`connect the "Objectives complete" output of step ${step!.id}.`);
    const conditions = resolved?.conditions ?? [];
    flows.push({ step: step!, scripts: next.scripts, next: next.target, branches, conditions });
    if (next.target) enter(next.target);
    for (const { target } of conditions) enter(target);
    for (const target of branches.values()) enter(target);
    state.set(node.id, 'done');
  };
  const start = follow(begins[0], 'next');
  if (start.target?.kind === 'branch') fail('a Branch follows a step.');
  if (start.target) enter(start.target);
  if (!completes) fail('connect Begin to Complete quest.');
  /**
   * The scripts after Complete quest or On failure. An If / Else here is a Lua `if` around its two chains, either
   * of which may stay empty, so a quest can run different actions depending on how it ended.
   */
  const chain = (from: QuestGraphNode, pin: string, forbidden: string): string[] => {
    const scripts: string[] = [];
    let edge = execEdges.find((e) => e.source === from.id && e.sourcePin === pin);
    while (edge) {
      const node = nodes.get(edge.target)!;
      if (node.kind === 'branch') {
        if (branchesSeen.has(node.id)) fail('a Branch can only follow one step.');
        branchesSeen.add(node.id);
        const arm = (name: string) => chain(node, name, forbidden).join('\n');
        scripts.push(`if ${conditionOf(node)} then\n${arm('then')}\nelse\n${arm('else')}\nend`);
        return scripts;
      }
      if (node.kind !== 'lua' && node.kind !== 'action') return fail(forbidden);
      if (scriptsSeen.has(node.id)) fail('cycle or shared execution path.');
      scriptsSeen.add(node.id);
      scripts.push(code(node));
      edge = execEdges.find((e) => e.source === node.id && e.sourcePin === 'next');
    }
    return scripts;
  };
  const completion = {
    scripts: chain(exits[0], 'next', 'quest steps must be between Begin and Complete quest.'),
  };
  const failure = {
    scripts: failures.length
      ? chain(failures[0], 'next', 'On failure may only connect to actions or scripts.')
      : [],
  };
  const reached = new Set([
    begins[0].id,
    exits[0].id,
    ...failures.map((n) => n.id),
    ...state.keys(),
    ...scriptsSeen,
    ...branchesSeen,
    ...pureSeen,
  ]);
  if (reached.size !== nodes.size) fail('connect or remove disconnected nodes.');
  if (!flows.length || flows.length !== quest.steps.length)
    fail('each quest step must appear once in the flow.');
  const join = (parts: string[]) => (parts.length ? parts.join('\n') : undefined);
  const targetId = (node: QuestGraphNode) => (node.kind === 'exit' ? questEnd : node.stepId!);
  return {
    ...quest,
    steps: flows.map(({ step, scripts, next, branches, conditions }, i) => {
      const target = next && targetId(next);
      return {
        ...step,
        onComplete: join(scripts),
        nextIf: conditions.length
          ? conditions.map((c) => ({ condition: c.condition, next: targetId(c.target) }))
          : undefined,
        // Only a step that doesn't simply continue to the following one in the list says where it goes.
        next: target && target !== (flows[i + 1]?.step.id ?? questEnd) ? target : undefined,
        objectives: step.objectives.map((o) => ({
          ...o,
          next: branches.has(o.id) ? targetId(branches.get(o.id)!) : undefined,
        })),
      };
    }),
    onStart: join(start.scripts),
    onComplete: join(completion.scripts),
    onFail: join(failure.scripts),
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

/** Remove a node; every wire that led into it continues to where its own "next" led. */
export function removeQuestNode(graph: QuestGraph, id: string): QuestGraph {
  const onward = graph.edges.find(
    (e) => e.kind === 'execution' && e.source === id && e.sourcePin === 'next',
  );
  return {
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: [
      ...graph.edges.filter((e) => e.source !== id && e.target !== id),
      ...(onward
        ? graph.edges
            .filter((e) => e.kind === 'execution' && e.target === id)
            .map((e) => questWire(e.source, onward.target, e.sourcePin))
        : []),
    ],
  };
}
