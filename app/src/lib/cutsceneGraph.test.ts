import { describe, expect, it } from 'vitest';
import {
  cutsceneGraphSchema,
  graphFromSteps,
  setPhaseGraph,
  validateGraphPlan,
} from './cutsceneGraph';
import {
  graphTemplates,
  filterGraphTemplates,
  matchingGraphTemplates,
} from './cutsceneGraphPalette';
import { getManifestGraphFunctions, parseScriptingManifest } from './scriptingManifest';
import { exportCutscene, parseCutscene, readCutsceneActions, validateCutscene } from './cutscenes';
import manifest from './__fixtures__/unity-bindings-v2.json';
import type { Cutscene } from '../types/cutscene';
import type { CutsceneGraph } from '../types/cutsceneGraph';
import type { Map as GameMap } from '../types/schema';

const actions = readCutsceneActions(manifest);
const scene = (): Cutscene => ({
  $schema: '../schemas/cutscene.schema.json',
  formatVersion: 2,
  id: 'base:graph-test',
  mapId: 'base:map',
  allowSkip: true,
  onComplete: { characterPlacements: [], steps: [] },
  sequence: [{ id: 'wait', action: 'cutscene.wait', arguments: { seconds: 1 } }],
});
const refs = {
  maps: [{ id: 'base:map', width: 20, height: 20, entities: [], layers: [] } as unknown as GameMap],
  entityTypes: [],
  dialogueIds: [],
};

describe('graph annotations and categorized choices', () => {
  it('round-trips comments without adding execution steps and rejects wired notes', () => {
    const s = scene();
    const graph = graphFromSteps(s.sequence);
    graph.nodes.find((n) => n.kind === 'action')!.comment = 'Let the opening shot settle.';
    graph.nodes.push({
      id: 'note',
      kind: 'comment',
      comment: 'Arrival beat\nKeep both actors visible.',
      position: { x: 40, y: -200 },
    });
    setPhaseGraph(s, 'sequence', graph);
    const plan = validateGraphPlan(graph, s, actions, 'sequence');
    expect(plan.steps).toHaveLength(1);
    const restored = parseCutscene(exportCutscene(s, actions, refs));
    expect(restored.graphs?.sequence).toEqual(graph);
    for (const kind of ['execution', 'data'] as const) {
      const invalid = structuredClone(graph);
      invalid.edges.push({
        id: 'note-wire',
        source: 'note',
        sourcePin: 'next',
        target: graph.nodes.find((n) => n.kind === 'action')!.id,
        targetPin: 'in',
        kind,
      });
      expect(() => validateGraphPlan(invalid, s, actions, 'sequence')).toThrow(
        'Comment nodes cannot have connections',
      );
    }
  });
  it('filters compatible choices by optional category without adding headings', () => {
    const templates = graphTemplates(scene(), actions, 'sequence');
    const compatible = matchingGraphTemplates(templates, scene(), actions, {
      direction: 'output',
      type: 'number',
    });
    const wait = compatible.find((t) => t.id === 'cutscene.wait')!;
    expect(wait.category).toBe(actions.find((a) => a.id === 'cutscene.wait')!.category);
    expect(filterGraphTemplates(compatible, wait.category)).toContainEqual(wait);
    expect(compatible.some((t) => t.id === 'comment')).toBe(false);
    expect(filterGraphTemplates(compatible, 'no such function')).toEqual([]);
    expect(
      filterGraphTemplates(compatible, '', wait.category).every(
        (c) => c.category === wait.category,
      ),
    ).toBe(true);
  });
});
function withResults(): CutsceneGraph {
  const g = graphFromSteps(scene().sequence);
  const entry = g.nodes.find((n) => n.kind === 'entry')!;
  g.nodes.push({
    id: 'lua',
    kind: 'lua',
    position: { x: 10, y: 20 },
    expression: 'return true, 0.5',
    outputs: [
      { name: 'flag', type: 'boolean' },
      { name: 'duration', type: 'number' },
    ],
  });
  g.edges = g.edges.filter((e) => e.source !== entry.id);
  g.edges.push(
    {
      id: 'begin',
      source: entry.id,
      sourcePin: 'next',
      target: 'lua',
      targetPin: 'in',
      kind: 'execution',
    },
    {
      id: 'continue',
      source: 'lua',
      sourcePin: 'next',
      target: 'wait',
      targetPin: 'in',
      kind: 'execution',
    },
    {
      id: 'value',
      source: 'lua',
      sourcePin: 'duration',
      target: 'wait',
      targetPin: 'seconds',
      kind: 'data',
    },
  );
  return g;
}

describe('cutscene execution and typed data graph', () => {
  it('round-trips a graph-owned phase without persisting a stale list or compiler variables', () => {
    const source = scene();
    setPhaseGraph(source, 'sequence', withResults());
    expect(source.sequence).toEqual([]);
    expect(validateCutscene(source, actions, refs)).toEqual([]);
    expect(parseCutscene(exportCutscene(source, actions, refs))).toEqual(source);
    expect(source.variables).toBeUndefined();
  });
  it('rejects missing pins, type mismatches and outputs whose producer has not completed', () => {
    const g = withResults();
    g.edges.find((e) => e.id === 'value')!.sourcePin = 'flag';
    expect(() => validateGraphPlan(g, scene(), actions, 'sequence')).toThrow(/incompatible/);
    g.edges.find((e) => e.id === 'value')!.sourcePin = 'duration';
    const entry = g.nodes.find((n) => n.kind === 'entry')!;
    g.edges.find((e) => e.id === 'begin')!.target = 'wait';
    g.edges.find((e) => e.source === 'wait' && e.kind === 'execution')!.target = 'lua';
    g.edges.find((e) => e.id === 'continue')!.target = g.nodes.find((n) => n.kind === 'exit')!.id;
    expect(entry).toBeDefined();
    expect(() => validateGraphPlan(g, scene(), actions, 'sequence')).toThrow(/before its consumer/);
  });
  it('rejects a disconnected action, cycles and duplicate identities before export', () => {
    const g = withResults();
    g.nodes.push({
      id: 'orphan',
      kind: 'action',
      step: { id: 'orphan', action: 'cutscene.wait', arguments: { seconds: 0 } },
      position: { x: 0, y: 0 },
    });
    expect(() => validateGraphPlan(g, scene(), actions, 'sequence')).toThrow(/disconnected/);
    g.nodes.push(g.nodes[0]);
    expect(() => validateGraphPlan(g, scene(), actions, 'sequence')).toThrow(/Duplicate/);
    expect(cutsceneGraphSchema.safeParse({ nodes: [], edges: [], unexpected: true }).success).toBe(
      false,
    );
  });
  it('projects paired parallel regions and prevents cross-track output reads', () => {
    const source = scene();
    source.sequence = [
      {
        id: 'parallel',
        action: 'control.parallel',
        arguments: {},
        tracks: [
          [{ id: 'left', action: 'cutscene.wait', arguments: { seconds: 0.1 } }],
          [{ id: 'right', action: 'cutscene.wait', arguments: { seconds: 0.2 } }],
        ],
      },
    ];
    const g = graphFromSteps(source.sequence);
    expect(validateGraphPlan(g, source, actions, 'sequence').steps).toEqual(source.sequence);
    const left = g.nodes.find((n) => n.id === 'left')!;
    left.kind = 'lua';
    delete left.step;
    left.expression = 'return 1';
    left.outputs = [{ name: 'time', type: 'number' }];
    g.edges.push({
      id: 'cross-track',
      kind: 'data',
      source: 'left',
      sourcePin: 'time',
      target: 'right',
      targetPin: 'seconds',
    });
    expect(() => validateGraphPlan(g, source, actions, 'sequence')).toThrow(/parallel/);
  });
});

describe('graph setup contracts', () => {
  it('preserves literal Make Position values for map binding validation', () => {
    const source = scene();
    source.onStart = [
      {
        id: 'place',
        action: 'characters.place',
        arguments: { character: 'player', position: { x: 0, y: 0 } },
      },
    ];
    const graph = graphFromSteps(source.onStart);
    graph.nodes.push({
      id: 'position',
      kind: 'position',
      position: { x: 0, y: 0 },
      arguments: { x: 16, y: 32 },
    });
    graph.edges.push({
      id: 'point',
      kind: 'data',
      source: 'position',
      sourcePin: 'position',
      target: 'place',
      targetPin: 'position',
    });
    const plan = validateGraphPlan(graph, source, actions, 'onStart');
    expect(plan.steps[0].arguments.position).toEqual({ x: 16, y: 32 });
    expect(plan.steps[0].argumentVariables).toBeUndefined();
    graph.nodes.find((n) => n.id === 'position')!.arguments!.x = -1;
    expect(() => validateGraphPlan(graph, source, actions, 'onStart')).toThrow(
      /nonnegative integer/,
    );
  });
  it('rejects a parallel variable write against a getter in another track', () => {
    const source = scene();
    source.variables = [{ name: 'delay', type: 'number', initialValue: 1 }];
    source.sequence = [
      {
        id: 'parallel',
        action: 'control.parallel',
        arguments: {},
        tracks: [
          [{ id: 'set', action: 'cutscene.setVariable', arguments: { name: 'delay', value: 2 } }],
          source.sequence,
        ],
      },
    ];
    const graph = graphFromSteps(source.sequence);
    graph.nodes.push({ id: 'get', kind: 'variable', variable: 'delay', position: { x: 0, y: 0 } });
    graph.edges.push({
      id: 'read',
      kind: 'data',
      source: 'get',
      sourcePin: 'value',
      target: 'wait',
      targetPin: 'seconds',
    });
    expect(() => validateGraphPlan(graph, source, actions, 'sequence')).toThrow(
      /conflict on cutscene variables/,
    );
  });
});

describe('pin-drag function discovery', () => {
  const metadata = parseScriptingManifest({
    schemaVersion: 2,
    modules: [
      {
        path: 'Read',
        methods: [
          {
            name: 'Pair',
            parameters: [],
            returnType: 'tuple',
            writesState: false,
            outputs: [
              { name: 'first', type: 'number' },
              { name: 'second', type: 'number' },
            ],
          },
          {
            name: 'Flag',
            parameters: [{ name: 'number', type: 'number' }],
            returnType: 'boolean',
            writesState: false,
          },
          { name: 'Mutate', parameters: [], returnType: 'number', writesState: true },
        ],
      },
    ],
  });
  const functions = getManifestGraphFunctions(metadata);
  it('offers existing read-only functions and connects the first compatible output', () => {
    const templates = graphTemplates(scene(), [...actions, ...functions], 'sequence');
    const choices = matchingGraphTemplates(templates, scene(), [...actions, ...functions], {
      direction: 'input',
      type: 'number',
    });
    expect(choices.find((c) => c.id === 'pure:Read.Pair')?.pin).toBe('first');
    expect(choices.some((c) => c.id === 'pure:Read.Flag')).toBe(false);
    expect(functions.some((f) => f.id.includes('Mutate'))).toBe(false);
  });
  it('filters compatible consumers when dragging from an output and respects nullability', () => {
    const templates = graphTemplates(scene(), [...actions, ...functions], 'sequence');
    expect(
      matchingGraphTemplates(templates, scene(), [...actions, ...functions], {
        direction: 'output',
        type: 'number',
      }).find((c) => c.id === 'pure:Read.Flag')?.pin,
    ).toBe('number');
    expect(
      matchingGraphTemplates(templates, scene(), [...actions, ...functions], {
        direction: 'output',
        type: 'number',
        nullable: true,
      }).find((c) => c.id === 'cutscene.wait'),
    ).toBeUndefined();
  });
});
