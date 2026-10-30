import { z } from 'zod';
import type { Cutscene, CutsceneAction, CutsceneStep, CutsceneVariable } from '../types/cutscene';
import type { CutsceneGraph, CutsceneGraphNode, CutscenePhase } from '../types/cutsceneGraph';
import {
  actionForCutsceneStep,
  canonicalVariableType,
  cutsceneDataSchema,
  initialVariableValue,
  variableCompatible,
  validVariableValue,
} from './cutsceneVariables';

const nonblank = z.string().regex(/\S/);
const output = z
  .object({
    name: nonblank,
    type: z.enum(['boolean', 'number', 'string', 'position', 'path', 'table', 'storyValue']),
    nullable: z.boolean().optional(),
  })
  .strict();
export const cutsceneGraphSchema = z
  .object({
    nodes: z.array(
      z
        .object({
          id: nonblank,
          kind: z.enum([
            'entry',
            'exit',
            'action',
            'function',
            'variable',
            'position',
            'expression',
            'lua',
            'branch',
            'parallel',
            'join',
            'comment',
          ]),
          method: nonblank.optional(),
          comment: z.string().optional(),
          position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
          step: z
            .object({
              id: nonblank,
              action: nonblank,
              arguments: z.record(z.string(), cutsceneDataSchema),
              argumentVariables: z.record(z.string(), nonblank).optional(),
              resultVariables: z.array(nonblank.nullable()).optional(),
            })
            .strict()
            .optional(),
          variable: nonblank.optional(),
          expression: z.string().optional(),
          arguments: z.record(z.string(), cutsceneDataSchema).optional(),
          outputs: z.array(output).optional(),
          resultVariables: z.array(nonblank.nullable()).optional(),
          pair: nonblank.optional(),
          tracks: z.number().int().min(2).optional(),
        })
        .strict(),
    ),
    edges: z.array(
      z
        .object({
          id: nonblank,
          source: nonblank,
          sourcePin: nonblank,
          target: nonblank,
          targetPin: nonblank,
          kind: z.enum(['execution', 'data']),
        })
        .strict(),
    ),
  })
  .strict();
export const graphPhases: CutscenePhase[] = ['onStart', 'sequence', 'completion'];
export const isPureGraphNode = (n: CutsceneGraphNode) =>
  ['function', 'variable', 'position', 'expression'].includes(n.kind);
export const graphNodeFields: Record<CutsceneGraphNode['kind'], string[]> = {
  entry: [],
  exit: [],
  action: ['step'],
  function: ['method', 'arguments'],
  variable: ['variable'],
  position: ['arguments'],
  expression: ['expression', 'outputs'],
  lua: ['expression', 'outputs', 'resultVariables'],
  branch: ['arguments', 'pair'],
  parallel: ['pair', 'tracks'],
  join: ['pair'],
  comment: [],
};
export const phaseSteps = (scene: Cutscene, phase: CutscenePhase) =>
  phase === 'onStart'
    ? (scene.onStart ?? [])
    : phase === 'completion'
      ? scene.onComplete.steps
      : scene.sequence;
export function setPhaseGraph(scene: Cutscene, phase: CutscenePhase, graph: CutsceneGraph) {
  (scene.graphs ??= {})[phase] = graph;
  if (phase === 'onStart') scene.onStart = [];
  else if (phase === 'completion') scene.onComplete.steps = [];
  else scene.sequence = [];
}

/** Projects existing structured content without changing it until the first graph edit. */
export function graphFromSteps(steps: readonly CutsceneStep[]): CutsceneGraph {
  const nodes: CutsceneGraphNode[] = [];
  const edges: CutsceneGraph['edges'] = [];
  const add = (source: string, sourcePin: string, target: string, targetPin = 'in') =>
    edges.push({
      id: `${source}:${sourcePin}:${target}:${targetPin}`,
      source,
      sourcePin,
      target,
      targetPin,
      kind: 'execution',
    });
  const entry = {
    id: `entry-${crypto.randomUUID()}`,
    kind: 'entry' as const,
    position: { x: 0, y: 180 },
  };
  nodes.push(entry);
  let serial = 0;
  function list(
    items: readonly CutsceneStep[],
    previous: string,
    pin: string,
    y: number,
  ): { id: string; pin: string } {
    for (const original of items) {
      const step = structuredClone(original);
      const x = ++serial * 360;
      if (step.action === 'control.parallel' || step.action === 'control.if') {
        const parallel = step.action === 'control.parallel';
        const join = `join-${step.id}`;
        nodes.push({
          id: step.id,
          kind: parallel ? 'parallel' : 'branch',
          position: { x, y },
          pair: join,
          ...(parallel ? { tracks: step.tracks!.length } : { arguments: { condition: false } }),
        });
        add(previous, pin, step.id);
        if (!parallel) {
          const id = `condition-${step.id}`;
          nodes.push({
            id,
            kind: 'expression',
            expression: `not not (${String(step.arguments.condition)}\n)`,
            outputs: [{ name: 'value', type: 'boolean' }],
            position: { x: x - 100, y: y - 270 },
          });
          edges.push({
            id: `${id}:condition`,
            source: id,
            sourcePin: 'value',
            target: step.id,
            targetPin: 'condition',
            kind: 'data',
          });
        }
        const tracks = parallel ? step.tracks! : [step.then!, step.else!];
        const terminals = tracks.map((track, index) =>
          list(
            track,
            step.id,
            parallel ? `track-${index}` : index === 0 ? 'then' : 'else',
            y + (index - (tracks.length - 1) / 2) * 350,
          ),
        );
        nodes.push({ id: join, kind: 'join', pair: step.id, position: { x: ++serial * 360, y } });
        terminals.forEach((end, index) => add(end.id, end.pin, join, `track-${index}`));
        previous = join;
        pin = 'next';
      } else {
        nodes.push({ id: step.id, kind: 'action', step, position: { x, y } });
        add(previous, pin, step.id);
        previous = step.id;
        pin = 'next';
      }
    }
    return { id: previous, pin };
  }
  const end = list(steps, entry.id, 'next', 180);
  const exit = {
    id: `exit-${crypto.randomUUID()}`,
    kind: 'exit' as const,
    position: { x: ++serial * 360, y: 180 },
  };
  nodes.push(exit);
  add(end.id, end.pin, exit.id);
  return { nodes, edges };
}

export function graphSignature(
  node: CutsceneGraphNode,
  scene: Pick<Cutscene, 'variables'>,
  actions: CutsceneAction[],
): {
  inputs: CutsceneAction['parameters'];
  outputs: NonNullable<CutsceneAction['outputs']>;
  action?: CutsceneAction;
} {
  if (node.kind === 'function') {
    const action = actions.find((a) => a.id === `pure:${node.method}`);
    if (!action) throw new Error(`${node.id}: missing read-only function ${node.method}`);
    return { inputs: action.parameters, outputs: action.outputs ?? [], action };
  }
  if (node.kind === 'action') {
    if (!node.step || node.step.id !== node.id)
      throw new Error(`${node.id}: action step must have the same ID as its node`);
    const action = actionForCutsceneStep(scene, node.step, actions);
    if (!action) throw new Error(`${node.id}: unsupported action ${node.step.action}`);
    return { inputs: action.parameters, outputs: action.outputs ?? [], action };
  }
  if (node.kind === 'variable') {
    const variable = scene.variables?.find((v) => v.name === node.variable);
    if (!variable) throw new Error(`${node.id}: missing variable ${node.variable}`);
    return {
      inputs: [],
      outputs: [{ name: 'value', type: variable.type, nullable: variable.nullable }],
    };
  }
  if (node.kind === 'position')
    return {
      inputs: [
        { name: 'x', type: 'number' },
        { name: 'y', type: 'number' },
      ],
      outputs: [{ name: 'position', type: 'position' }],
    };
  if (node.kind === 'expression' || node.kind === 'lua') {
    if (
      !node.outputs?.length ||
      new Set(node.outputs.map((o) => o.name)).size !== node.outputs.length ||
      (node.kind === 'expression' && node.outputs.length !== 1)
    )
      throw new Error(`${node.id}: declare distinct typed outputs (one for a pure expression)`);
    return { inputs: [], outputs: node.outputs };
  }
  return {
    inputs: node.kind === 'branch' ? [{ name: 'condition', type: 'boolean' }] : [],
    outputs: [],
  };
}

/** Produces a typed validation plan, not the runtime source. Dynamic inputs become compiler symbols. */
export function validateGraphPlan(
  graph: CutsceneGraph,
  scene: Cutscene,
  actions: CutsceneAction[],
  phase: CutscenePhase,
) {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  if (
    nodes.size !== graph.nodes.length ||
    new Set(graph.edges.map((e) => e.id)).size !== graph.edges.length
  )
    throw new Error('Duplicate graph node or connection ID');
  const entries = graph.nodes.filter((n) => n.kind === 'entry');
  if (entries.length !== 1 || graph.nodes.filter((n) => n.kind === 'exit').length !== 1)
    throw new Error('A phase needs exactly one entry and exit');
  const signatures = new Map(graph.nodes.map((n) => [n.id, graphSignature(n, scene, actions)]));
  for (const n of graph.nodes) {
    if (
      Object.keys(n).some(
        (key) => !['id', 'kind', 'position', 'comment', ...graphNodeFields[n.kind]].includes(key),
      )
    )
      throw new Error(`${n.id}: fields do not match its node kind`);
    if (n.kind === 'comment' && typeof n.comment !== 'string')
      throw new Error(`${n.id}: a comment node requires comment text`);
    const signature = signatures.get(n.id)!;
    for (const [parameter, name] of Object.entries(n.step?.argumentVariables ?? {})) {
      const input = signature.inputs.find(p => p.name === parameter);
      const variable = scene.variables?.find(v => v.name === name);
      if (!input || !variable || !variableCompatible(variable, input)) throw new Error(`${n.id}: missing or incompatible input variable ${name}`);
    }
    if (Object.keys(n.arguments ?? {}).some((key) => !signature.inputs.some((p) => p.name === key)))
      throw new Error(`${n.id}: unknown argument`);
    const destinations = n.step?.resultVariables ?? n.resultVariables;
    if (destinations) {
      if (!signature.outputs.length || destinations.length !== signature.outputs.length)
        throw new Error(`${n.id}: result assignments must match outputs`);
      const names = destinations.filter((name): name is string => name !== null);
      if (new Set(names).size !== names.length)
        throw new Error(`${n.id}: duplicate result destination`);
      destinations.forEach((name, i) => {
        if (
          name &&
          !scene.variables?.some(
            (v) => v.name === name && variableCompatible(signature.outputs[i], v),
          )
        )
          throw new Error(`${n.id}: missing or incompatible result variable ${name}`);
      });
    }
  }
  const variables: CutsceneVariable[] = [...(scene.variables ?? [])];
  const incoming = new Map<string, (typeof graph.edges)[number]>();
  const outgoing = new Map<string, (typeof graph.edges)[number]>();
  const executionInputs = new Set<string>();
  for (const e of graph.edges) {
    const source = nodes.get(e.source),
      target = nodes.get(e.target);
    if (!source || !target || source === target)
      throw new Error(`${e.id}: missing node or self connection`);
    const key = `${e.target}/${e.targetPin}`;
    if (source.kind === 'comment' || target.kind === 'comment')
      throw new Error('Comment nodes cannot have connections');
    if (e.kind === 'data') {
      if (target.step?.argumentVariables?.[e.targetPin]) throw new Error(`${e.id}: an input cannot have both a variable binding and data wire`);
      if (incoming.has(key)) throw new Error(`${e.id}: input already connected`);
      incoming.set(key, e);
      const output = signatures.get(e.source)!.outputs.find((p) => p.name === e.sourcePin);
      const input = signatures.get(e.target)!.inputs.find((p) => p.name === e.targetPin);
      if (
        !input ||
        !output ||
        !variableCompatible(
          {
            type: canonicalVariableType(output.type) as CutsceneVariable['type'],
            nullable: output.nullable,
          },
          input,
        )
      )
        throw new Error(`${e.id}: incompatible or missing data pins`);
    } else {
      if (executionInputs.has(key)) throw new Error(`${e.id}: execution input already connected`);
      executionInputs.add(key);
      if (target.kind === 'join') {
        const owner = nodes.get(target.pair!);
        if (
          !owner ||
          !['branch', 'parallel'].includes(owner.kind) ||
          owner.pair !== target.id ||
          !Array.from(
            { length: owner.kind === 'branch' ? 2 : (owner.tracks ?? 0) },
            (_, i) => `track-${i}`,
          ).includes(e.targetPin)
        )
          throw new Error(`${e.id}: invalid join input`);
      }
      const pins =
        source.kind === 'parallel'
          ? Array.from({ length: source.tracks ?? 0 }, (_, i) => `track-${i}`)
          : source.kind === 'branch'
            ? ['then', 'else']
            : ['next'];
      if (
        isPureGraphNode(source) ||
        isPureGraphNode(target) ||
        source.kind === 'exit' ||
        target.kind === 'entry' ||
        !pins.includes(e.sourcePin) ||
        (target.kind !== 'join' && e.targetPin !== 'in')
      )
        throw new Error(`${e.id}: invalid execution pins`);
      const from = `${e.source}/${e.sourcePin}`;
      if (outgoing.has(from)) throw new Error(`${e.id}: execution output already connected`);
      outgoing.set(from, e);
    }
  }
  for (const n of graph.nodes.filter((n) => n.kind === 'join')) {
    const owner = nodes.get(n.pair!);
    if (!owner || owner.pair !== n.id || !['branch', 'parallel'].includes(owner.kind))
      throw new Error(`${n.id}: unmatched join`);
    for (let i = 0; i < (owner.kind === 'branch' ? 2 : (owner.tracks ?? 0)); i++)
      if (!executionInputs.has(`${n.id}/track-${i}`))
        throw new Error(`${n.id}: connect track ${i + 1}`);
  }
  const visited = new Set<string>();
  const pureStack = new Set<string>();
  function dependency(id: string, known: Set<string>) {
    const n = nodes.get(id)!;
    if (!isPureGraphNode(n)) {
      if (!known.has(id))
        throw new Error(`${id}: output is not guaranteed to have completed before its consumer`);
      return;
    }
    if (pureStack.has(id)) throw new Error(`${id}: pure data cycle`);
    pureStack.add(id);
    for (const p of signatures.get(id)!.inputs) {
      const e = incoming.get(`${id}/${p.name}`);
      if (e?.kind === 'data') dependency(e.source, known);
      else {
        const literal =
          n.arguments?.[p.name] === undefined && p.optional
            ? p.defaultValue
            : n.arguments?.[p.name];
        if (
          !validVariableValue(
            {
              type: canonicalVariableType(p.type) as CutsceneVariable['type'],
              nullable: p.nullable,
            },
            literal,
          )
        )
          throw new Error(`${id}: ${p.name} needs a ${p.type}`);
        if (
          n.kind === 'function' &&
          p.type === 'string' &&
          !p.optional &&
          typeof literal === 'string' &&
          !literal.trim()
        )
          throw new Error(`${id}: enter ${p.name}`);
        if (
          p.type === 'integer' &&
          (typeof literal !== 'number' ||
            !Number.isInteger(literal) ||
            literal < -2147483648 ||
            literal > 2147483647)
        )
          throw new Error(`${id}: ${p.name} requires a 32-bit integer`);
        if (
          n.kind === 'position' &&
          (typeof literal !== 'number' || !Number.isInteger(literal) || literal < 0)
        )
          throw new Error(`${id}: position coordinates must be nonnegative integer map pixels`);
      }
    }
    pureStack.delete(id);
  }
  const next = (id: string, pin = 'next') => {
    const e = outgoing.get(`${id}/${pin}`);
    if (!e) throw new Error(`${id}: connect ${pin}`);
    return e.target;
  };
  function checkParallelVariables(tracks: CutsceneStep[][]) {
    const accesses = tracks.map((track) => {
      const reads = new Set<string>(),
        writes = new Set<string>();
      let unknownRead = false;
      const read = (id: string, seen = new Set<string>()) => {
        if (seen.has(id)) return;
        seen.add(id);
        const node = nodes.get(id)!;
        if (node.kind === 'variable') reads.add(node.variable!);
        if (node.kind === 'expression' && node.expression?.includes('Cutscene.Variables'))
          unknownRead = true;
        for (const e of graph.edges.filter((e) => e.kind === 'data' && e.target === id))
          if (isPureGraphNode(nodes.get(e.source)!)) read(e.source, seen);
      };
      for (const step of track) {
        const node = nodes.get(step.id)!;
        read(step.id);
        Object.values(node.step?.argumentVariables ?? {}).forEach((name) => reads.add(name));
        (node.step?.resultVariables ?? node.resultVariables ?? []).forEach((name) => {
          if (name) writes.add(name);
        });
        if (node.step?.action === 'cutscene.setVariable')
          writes.add(String(node.step.arguments.name));
      }
      return { reads, writes, unknownRead };
    });
    for (let a = 0; a < accesses.length; a++)
      for (let b = a + 1; b < accesses.length; b++)
        if (
          [...accesses[a].writes].some(
            (name) =>
              accesses[b].reads.has(name) ||
              accesses[b].writes.has(name) ||
              accesses[b].unknownRead,
          ) ||
          [...accesses[b].writes].some(
            (name) => accesses[a].reads.has(name) || accesses[a].unknownRead,
          )
        )
          throw new Error(`Parallel tracks ${a + 1} and ${b + 1} conflict on cutscene variables`);
  }
  function inputs(n: CutsceneGraphNode, known: Set<string>, step: CutsceneStep) {
    for (const p of signatures.get(n.id)!.inputs) {
      const e = incoming.get(`${n.id}/${p.name}`);
      if (!e || e.kind !== 'data') continue;
      dependency(e.source, known);
      const source = nodes.get(e.source)!;
      if (
        source.kind === 'position' &&
        !graph.edges.some((edge) => edge.kind === 'data' && edge.target === source.id)
      ) {
        step.arguments[p.name] = { x: source.arguments!.x, y: source.arguments!.y };
        if (step.argumentVariables) delete step.argumentVariables[p.name];
        continue;
      }
      const output = signatures.get(e.source)!.outputs.find((p) => p.name === e.sourcePin)!;
      let name = `__graph_${phase}_input_${variables.length}`;
      while (variables.some((v) => v.name === name)) name += '_';
      const type = canonicalVariableType(output.type) as CutsceneVariable['type'];
      variables.push({
        name,
        type,
        nullable: output.nullable,
        initialValue: type === 'path' ? [{ x: 0, y: 0 }] : initialVariableValue(type),
      });
      delete step.arguments[p.name];
      (step.argumentVariables ??= {})[p.name] = name;
    }
  }
  function walk(
    id: string,
    stop: string | undefined,
    known: Set<string>,
    parallelTrack = false,
  ): CutsceneStep[] {
    const result: CutsceneStep[] = [];
    while (id !== stop) {
      const n = nodes.get(id);
      if (!n || visited.has(id) || isPureGraphNode(n) || n.kind === 'join')
        throw new Error(`${id}: cyclic, shared, or unmatched execution path`);
      visited.add(id);
      if (n.kind === 'exit') {
        if (stop) throw new Error(`${id}: track exits without its join`);
        return result;
      }
      if (n.kind === 'entry') {
        id = next(id);
        continue;
      }
      if (n.kind === 'parallel' || n.kind === 'branch') {
        if (phase !== 'sequence' || stop)
          throw new Error(`${id}: control blocks belong at the top level of Sequence`);
        const join = nodes.get(n.pair!);
        if (!join || join.kind !== 'join' || join.pair !== id)
          throw new Error(`${id}: missing paired join`);
        const count = n.kind === 'parallel' ? n.tracks! : 2;
        if (!Number.isInteger(count) || count < 2)
          throw new Error(`${id}: at least two tracks required`);
        const branches = Array.from({ length: count }, (_, i) => {
          const branchKnown = new Set(known);
          const steps = walk(
            next(id, n.kind === 'parallel' ? `track-${i}` : i === 0 ? 'then' : 'else'),
            join.id,
            branchKnown,
            n.kind === 'parallel',
          );
          return { steps, known: branchKnown };
        });
        if (n.kind === 'parallel') {
          checkParallelVariables(branches.map((b) => b.steps));
          result.push({
            id,
            action: 'control.parallel',
            arguments: {},
            tracks: branches.map((b) => b.steps),
          });
        } else {
          const condition: CutsceneStep = {
            id,
            action: 'control.if',
            arguments: { condition: 'true' },
            then: branches[0].steps,
            else: branches[1].steps,
          };
          inputs(n, known, { id, action: '', arguments: {} }); // Validate condition dependencies; compiler emits the expression.
          if (!incoming.has(`${id}/condition`) && typeof n.arguments?.condition !== 'boolean')
            throw new Error(`${id}: condition needs a boolean`);
          result.push(condition);
        }
        for (const k of branches[0].known)
          if (n.kind === 'parallel' || branches.every((b) => b.known.has(k))) known.add(k);
        if (n.kind === 'parallel') branches.forEach((b) => b.known.forEach((k) => known.add(k)));
        if (visited.has(join.id)) throw new Error(`${join.id}: join already used`);
        visited.add(join.id);
        id = next(join.id);
        continue;
      }
      const step =
        n.kind === 'lua'
          ? { id, action: 'cutscene.runLua', arguments: { code: n.expression ?? '' } }
          : structuredClone(n.step!);
      if (n.kind === 'lua' && parallelTrack)
        throw new Error(`${id}: Run Lua must stay outside parallel tracks`);
      inputs(n, known, step);
      result.push(step);
      known.add(id);
      id = next(id);
    }
    return result;
  }
  const steps = walk(entries[0].id, undefined, new Set());
  for (const n of graph.nodes) {
    if (n.kind !== 'comment' && !isPureGraphNode(n) && !visited.has(n.id))
      throw new Error(`${n.id}: node is disconnected from execution`);
    if (isPureGraphNode(n)) dependency(n.id, new Set(graph.nodes.map((n) => n.id)));
  }
  return { steps, variables };
}
