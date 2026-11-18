import { describe, expect, it } from 'vitest';
import {
  compileQuestGraph,
  graphFromQuest,
  objectivePin,
  questDataWire,
  questFunctions,
  questActions,
  questWire,
  removeQuestNode,
} from './questGraph';
import { validateQuest } from './quests';
import type { Quest } from '../types/quest';
import type { ScriptingManifest } from './scriptingManifest';

const manifest: ScriptingManifest = {
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
          returnType: 'boolean',
        },
      ],
    },
    {
      path: 'Characters',
      methods: [
        {
          name: 'Walk',
          parameters: [],
          writesState: true,
          action: {
            id: 'walk',
            displayName: 'Walk',
            category: 'Characters',
            description: '',
            contexts: ['cutscene'],
            execution: 'awaitable',
            phases: ['sequence'],
          },
        },
      ],
    },
  ],
};
function quest(): Quest {
  return {
    formatVersion: 1,
    id: 'base:delivery',
    title: 'Fabia Delivery',
    description: 'Help Fabia.',
    onStart: 'Wallet.AddMoney(1)',
    onComplete: 'Wallet.AddMoney(5)',
    onFail: 'Wallet.RemoveMoney(1)',
    steps: [
      {
        id: 'delivery',
        journal: 'Deliver the figs.',
        onComplete: 'Wallet.AddMoney(2)',
        objectives: [
          {
            id: 'figs',
            kind: 'deliver',
            character: 'base:fabia',
            item: 'base:fig',
            count: 5,
            text: 'Five figs',
          },
        ],
      },
    ],
  };
}
describe('quest graph compilation', () => {
  it('preserves persistent step/objective IDs and every lifecycle script on first graph edit', () => {
    const source = quest();
    source.editorGraph = graphFromQuest(source);
    const compiled = compileQuestGraph(source, null);
    expect(compiled.steps[0].id).toBe('delivery');
    expect(compiled.steps[0].objectives).toEqual(source.steps[0].objectives);
    expect(compiled.onStart).toBe('do\nWallet.AddMoney(1)\nend');
    expect(compiled.steps[0].onComplete).toBe('do\nWallet.AddMoney(2)\nend');
    expect(compiled.onComplete).toBe('do\nWallet.AddMoney(5)\nend');
    expect(compiled.onFail).toBe('do\nWallet.RemoveMoney(1)\nend');
    expect(compileQuestGraph(compiled, null)).toEqual(compiled);
    expect(source.steps[0].onComplete).toBe('Wallet.AddMoney(2)');
  });
  it('compiles visible reward nodes after Complete quest into the quest completion hook', () => {
    const source = quest();
    delete source.onComplete;
    const graph = graphFromQuest(source);
    source.editorGraph = graph;
    graph.nodes.push({
      id: 'reward',
      kind: 'action',
      position: { x: 1000, y: 120 },
      action: { method: 'Inventory.Give', arguments: { itemId: 'base:fig', count: 5 } },
    });
    graph.edges.push(questWire('complete', 'reward'));
    expect(compileQuestGraph(source, manifest).onComplete).toBe('Inventory.Give("base:fig", 5)');
    expect(questActions(manifest).map((a) => a.id)).toEqual(['Inventory.Give']);
    graph.nodes.find((n) => n.id === 'reward')!.action!.arguments.itemId = 'base:missing';
    expect(() => compileQuestGraph(source, manifest)).toThrow('unknown item');
  });
  it('rejects disconnected nodes, branches, cycles and steps after quest completion', () => {
    const source = quest();
    source.editorGraph = graphFromQuest(source);
    source.editorGraph.nodes.push({
      id: 'orphan',
      kind: 'lua',
      position: { x: 0, y: 0 },
      code: '',
    });
    expect(() => compileQuestGraph(source, null)).toThrow('disconnected');
    source.editorGraph.edges.push(questWire('begin', 'orphan'));
    expect(() => compileQuestGraph(source, null)).toThrow('one wire');
    source.editorGraph = graphFromQuest(quest());
    source.editorGraph.edges.push(questWire('completion-script', 'begin'));
    expect(() => compileQuestGraph(source, null)).toThrow('incoming wires');
    source.editorGraph = graphFromQuest(quest());
    const step = source.editorGraph.nodes.find((n) => n.kind === 'step')!;
    step.kind = 'lua';
    step.code = '';
    source.editorGraph.nodes.push({
      id: 'late',
      kind: 'step',
      stepId: 'delivery',
      position: { x: 0, y: 0 },
    });
    source.editorGraph.edges.push(questWire('completion-script', 'late'));
    expect(() => compileQuestGraph(source, null)).toThrow('between Begin');
  });
  it('reconnects a removed action and removes its code from the compiled export', () => {
    const source = quest();
    source.editorGraph = removeQuestNode(graphFromQuest(source), 'step-script-0');
    expect(compileQuestGraph(source, null).steps[0].onComplete).toBeUndefined();
    expect(validateQuest(source)).toEqual([]);
  });
  it('orders steps by execution wires rather than canvas position or storage order', () => {
    const source = quest();
    source.steps.push({
      id: 'return',
      journal: 'Return to Fabia.',
      objectives: [{ id: 'talk', text: 'Talk to Fabia', kind: 'talk', character: 'base:fabia' }],
    });
    source.editorGraph = graphFromQuest(source);
    source.steps.reverse();
    source.editorGraph.nodes.reverse();
    expect(compileQuestGraph(source, null).steps.map((s) => s.id)).toEqual(['delivery', 'return']);
  });
  it('isolates raw script locals and escapes Lua strings without JSON unicode escapes', () => {
    const source = quest();
    delete source.onComplete;
    source.editorGraph = graphFromQuest(source);
    source.editorGraph.nodes.push({
      id: 'reward',
      kind: 'action',
      position: { x: 0, y: 0 },
      action: { method: 'Inventory.Give', arguments: { itemId: 'quote"\n\u0001', count: 1 } },
    });
    source.editorGraph.edges.push(questWire('complete', 'reward'));
    const noResources = { ...manifest, resources: {} };
    expect(compileQuestGraph(source, noResources).onComplete).toBe(
      'Inventory.Give("quote\\"\\010\\001", 1)',
    );
  });

  describe('branching', () => {
    const condition = (id: string, next?: string) => ({
      id,
      text: id,
      kind: 'condition' as const,
      condition: 'true',
      next,
    });
    function branching(): Quest {
      return {
        formatVersion: 1,
        id: 'base:choice',
        title: 'Choice',
        description: 'Choose.',
        steps: [
          {
            id: 'choose',
            journal: 'Help or refuse.',
            objectives: [condition('aid', 'helped'), condition('refuse', 'refused')],
          },
          { id: 'helped', journal: 'You helped.', objectives: [condition('x')], next: 'end' },
          { id: 'refused', journal: 'You refused.', objectives: [condition('y')] },
        ],
      };
    }

    it('opens a branching quest as a graph and compiles it back unchanged', () => {
      const source = branching();
      const graph = graphFromQuest(source);
      expect(graph.edges.filter((e) => e.sourcePin.startsWith('objective:'))).toHaveLength(2);
      const compiled = compileQuestGraph({ ...source, editorGraph: graph }, null);
      expect(compiled.steps).toEqual(
        source.steps.map((step) => ({
          ...step,
          onComplete: undefined,
          objectives: step.objectives.map((o) => ({ ...o, next: o.next })),
        })),
      );
      expect(validateQuest(compiled)).toEqual([]);
    });

    it('lists the main path first, then branches, and names a next only where it leaves the list order', () => {
      const source = branching();
      source.steps[2].next = 'end'; // Both paths end the quest: Complete quest is a join.
      source.editorGraph = graphFromQuest(source);
      source.steps.reverse();
      const compiled = compileQuestGraph(source, null);
      expect(compiled.steps.map((s) => s.id)).toEqual(['choose', 'helped', 'refused']);
      expect(compiled.steps.map((s) => s.next)).toEqual([undefined, 'end', undefined]);
    });

    it('needs no wire from Objectives complete when every objective branches', () => {
      const source = branching();
      source.editorGraph = graphFromQuest(source);
      source.editorGraph.edges = source.editorGraph.edges.filter(
        (e) => !(e.source === 'step-node-0' && e.sourcePin === 'next'),
      );
      expect(() => compileQuestGraph(source, null)).not.toThrow();
      source.steps[0].objectives.push(condition('wait'));
      expect(() => compileQuestGraph(source, null)).toThrow('Objectives complete');
    });

    it('rejects loops, scripts on a branch and wires from missing objectives', () => {
      const source = branching();
      source.editorGraph = graphFromQuest(source);
      source.editorGraph.edges.push(questWire('step-node-1', 'step-node-0'));
      source.editorGraph.edges = source.editorGraph.edges.filter(
        (e) => !(e.source === 'step-node-1' && e.target === 'complete'),
      );
      expect(() => compileQuestGraph(source, null)).toThrow('loop back');

      const scripted = branching();
      scripted.editorGraph = graphFromQuest(scripted);
      scripted.editorGraph.nodes.push({
        id: 'between',
        kind: 'lua',
        code: '',
        position: { x: 0, y: 0 },
      });
      const branch = scripted.editorGraph.edges.find((e) => e.sourcePin === objectivePin('aid'))!;
      scripted.editorGraph.edges.push(questWire('between', branch.target));
      branch.target = 'between';
      expect(() => compileQuestGraph(scripted, null)).toThrow('step or Complete quest');

      const missing = branching();
      missing.editorGraph = graphFromQuest(missing);
      missing.editorGraph.edges.push(questWire('step-node-0', 'complete', objectivePin('nope')));
      expect(() => compileQuestGraph(missing, null)).toThrow('does not exist');
    });

    it('compiles Branch nodes to ordered conditions and opens them back as Branch nodes', () => {
      const source = branching();
      source.steps[0].objectives = [condition('wait')];
      source.steps[0].nextIf = [
        { condition: "GameState.Story.Has('a')", next: 'helped' },
        { condition: "GameState.Story.Has('b')", next: 'end' },
      ];
      source.steps[0].next = 'refused';
      const graph = graphFromQuest(source);
      expect(graph.nodes.filter((n) => n.kind === 'branch')).toHaveLength(2);
      const compiled = compileQuestGraph({ ...source, editorGraph: graph }, null);
      expect(compiled.steps[0].nextIf).toEqual(source.steps[0].nextIf);
      // The fallback is listed right after the step, so only the step that then must end names its next.
      expect(compiled.steps.map((s) => s.id)).toEqual(['choose', 'refused', 'helped']);
      expect(compiled.steps.map((s) => s.next)).toEqual([undefined, 'end', undefined]);
      expect(validateQuest(compiled)).toEqual([]);
    });

    it('rejects a Branch with an open output, scripts after it or a True wire into another Branch', () => {
      const source = branching();
      source.steps[0].nextIf = [{ condition: 'true', next: 'helped' }];
      const graph = graphFromQuest(source);
      const open = { ...source, editorGraph: structuredClone(graph) };
      open.editorGraph.edges = open.editorGraph.edges.filter((e) => e.sourcePin !== 'else');
      expect(() => compileQuestGraph(open, null)).toThrow('True and False');
      const chained = { ...source, editorGraph: structuredClone(graph) };
      chained.editorGraph.nodes.push({
        id: 'second',
        kind: 'branch',
        code: 'true',
        position: { x: 0, y: 0 },
      });
      chained.editorGraph.edges.find((e) => e.sourcePin === 'then')!.target = 'second';
      expect(() => compileQuestGraph(chained, null)).toThrow('True continues');
    });

    describe('value wires', () => {
      const bindings: ScriptingManifest = {
        schemaVersion: 2,
        resources: {},
        modules: [
          {
            path: 'GameState.Story',
            methods: [
              {
                name: 'Has',
                parameters: [{ name: 'flag', type: 'string' }],
                returnType: 'boolean',
              },
              { name: 'Set', writesState: true, parameters: [{ name: 'flag', type: 'string' }] },
              {
                name: 'Count',
                parameters: [],
                returnType: 'number',
              },
            ],
          },
        ],
      };
      function withCondition(): Quest {
        const source = branching();
        source.steps[0].objectives = [condition('wait')];
        source.steps[0].nextIf = [{ condition: 'true', next: 'helped' }];
        source.steps[0].next = 'refused';
        source.editorGraph = graphFromQuest(source);
        const graph = source.editorGraph;
        // Replace the expression node by a function node.
        graph.nodes = graph.nodes.filter((n) => n.kind !== 'expression');
        graph.edges = graph.edges.filter((e) => e.kind !== 'data');
        graph.nodes.push({
          id: 'has',
          kind: 'function',
          method: 'GameState.Story.Has',
          arguments: { flag: 'met_baker' },
          position: { x: 0, y: 0 },
        });
        graph.edges.push(questDataWire('has', 'result', 'step-branch-0-0', 'condition'));
        return source;
      }

      it('offers only read-only calls that return one value', () => {
        expect(questFunctions(bindings).map((f) => f.id)).toEqual([
          'pure:GameState.Story.Has',
          'pure:GameState.Story.Count',
        ]);
      });

      it('names actions and functions alike, as Module: method', () => {
        expect(questFunctions(bindings).map((f) => f.displayName)).toEqual([
          'Game state story: has',
          'Game state story: count',
        ]);
        expect(questActions(manifest).map((a) => a.displayName)).toEqual(['Inventory: give']);
      });

      it('compiles a function node wired into a Branch as its condition', () => {
        const compiled = compileQuestGraph(withCondition(), bindings);
        expect(compiled.steps[0].nextIf).toEqual([
          { condition: 'GameState.Story.Has("met_baker")', next: 'helped' },
        ]);
        expect(validateQuest(compiled, undefined, bindings)).toEqual([]);
      });

      it('lets a wired function feed another function and uses the Branch literal when unwired', () => {
        const source = withCondition();
        const graph = source.editorGraph!;
        graph.nodes.push({
          id: 'text',
          kind: 'expression',
          expression: '"met_" .. "baker"',
          outputs: [{ name: 'value', type: 'string' }],
          position: { x: 0, y: 0 },
        });
        graph.nodes.find((n) => n.id === 'has')!.arguments = {};
        graph.edges.push(questDataWire('text', 'value', 'has', 'flag'));
        expect(compileQuestGraph(source, bindings).steps[0].nextIf![0].condition).toBe(
          'GameState.Story.Has("met_" .. "baker")',
        );
        graph.edges = graph.edges.filter((e) => e.kind !== 'data');
        graph.nodes = graph.nodes.filter((n) => n.id !== 'has' && n.id !== 'text');
        graph.nodes.find((n) => n.kind === 'branch')!.arguments = { condition: true };
        expect(compileQuestGraph(source, bindings).steps[0].nextIf![0].condition).toBe('true');
      });

      it('rejects mismatched types, a second wire into one input and unused read-only nodes', () => {
        const mismatched = withCondition();
        mismatched.editorGraph!.edges.find((e) => e.kind === 'data')!.sourcePin = 'result';
        mismatched.editorGraph!.nodes.push({
          id: 'count',
          kind: 'function',
          method: 'GameState.Story.Count',
          position: { x: 0, y: 0 },
        });
        mismatched.editorGraph!.edges = [
          ...mismatched.editorGraph!.edges.filter((e) => e.kind !== 'data'),
          questDataWire('count', 'result', 'step-branch-0-0', 'condition'),
        ];
        expect(() => compileQuestGraph(mismatched, bindings)).toThrow('matching value types');

        const twice = withCondition();
        twice.editorGraph!.nodes.push({
          id: 'other',
          kind: 'expression',
          expression: 'true',
          outputs: [{ name: 'value', type: 'boolean' }],
          position: { x: 0, y: 0 },
        });
        twice.editorGraph!.edges.push(
          questDataWire('other', 'value', 'step-branch-0-0', 'condition'),
        );
        expect(() => compileQuestGraph(twice, bindings)).toThrow('one wire');

        const unused = withCondition();
        unused.editorGraph!.nodes.push({
          id: 'loose',
          kind: 'expression',
          expression: 'true',
          outputs: [{ name: 'value', type: 'boolean' }],
          position: { x: 0, y: 0 },
        });
        expect(() => compileQuestGraph(unused, bindings)).toThrow('disconnected');
      });

      it('runs different actions after completion depending on a condition', () => {
        const source = quest();
        delete source.onComplete;
        source.editorGraph = graphFromQuest(source);
        const graph = source.editorGraph;
        const give = (id: string, count: number) =>
          graph.nodes.push({
            id,
            kind: 'action',
            position: { x: 0, y: 0 },
            action: { method: 'Inventory.Give', arguments: { itemId: 'base:fig', count } },
          });
        give('small', 5);
        give('big', 50);
        graph.nodes.push(
          { id: 'rich', kind: 'branch', arguments: { condition: false }, position: { x: 0, y: 0 } },
          {
            id: 'favour',
            kind: 'expression',
            expression: 'Divinity.Favour("base:ceres") > 500',
            outputs: [{ name: 'value', type: 'boolean' }],
            position: { x: 0, y: 0 },
          },
        );
        graph.edges.push(
          questWire('complete', 'rich'),
          questWire('rich', 'big', 'then'),
          questWire('rich', 'small', 'else'),
          questDataWire('favour', 'value', 'rich', 'condition'),
        );
        const compiled = compileQuestGraph(source, manifest);
        expect(compiled.onComplete).toBe(
          'if Divinity.Favour("base:ceres") > 500 then\n' +
            'Inventory.Give("base:fig", 50)\nelse\nInventory.Give("base:fig", 5)\nend',
        );
        expect(compiled.steps.length).toBe(source.steps.length);
        // An arm may stay empty, and an If / Else can sit inside another.
        graph.edges = graph.edges.filter((e) => e.target !== 'small');
        graph.nodes = graph.nodes.filter((n) => n.id !== 'small');
        expect(compileQuestGraph(source, manifest).onComplete).toContain(
          'then\nInventory.Give("base:fig", 50)\nelse\n\nend',
        );
        // Steps may not follow completion, and between steps the arms must lead to steps.
        graph.nodes.push({
          id: 'late',
          kind: 'step',
          stepId: 'delivery',
          position: { x: 0, y: 0 },
        });
        graph.edges.push(questWire('rich', 'late', 'else'));
        expect(() => compileQuestGraph(source, manifest)).toThrow('between Begin');
      });

      it('rejects actions on the arms of an If / Else that picks between steps', () => {
        const source = withCondition();
        const graph = source.editorGraph!;
        graph.nodes.push({
          id: 'give',
          kind: 'action',
          position: { x: 0, y: 0 },
          action: { method: 'Inventory.Give', arguments: { itemId: 'base:fig', count: 1 } },
        });
        const yes = graph.edges.find((e) => e.sourcePin === 'then')!;
        graph.edges.push(questWire('give', yes.target));
        yes.target = 'give';
        expect(() => compileQuestGraph(source, bindings)).toThrow(
          'put actions in an If / Else after Complete quest',
        );
      });

      it('rejects execution wires on read-only nodes and unknown functions', () => {
        const source = withCondition();
        source.editorGraph!.edges.push(questWire('has', 'complete'));
        expect(() => compileQuestGraph(source, bindings)).toThrow('value pins only');
        const unknown = withCondition();
        unknown.editorGraph!.nodes.find((n) => n.id === 'has')!.method = 'Nope.Missing';
        expect(() => compileQuestGraph(unknown, bindings)).toThrow('unknown or unavailable');
      });
    });

    it('rejects a step called end', () => {
      const source = branching();
      source.steps[2].id = 'end';
      expect(validateQuest(source).join()).toContain('end');
    });

    it('removing a step passes its incoming wires on to where it led', () => {
      const source = branching();
      const graph = removeQuestNode(graphFromQuest(source), 'step-node-1');
      const wire = graph.edges.find((e) => e.sourcePin === objectivePin('aid'))!;
      expect(wire.target).toBe('complete');
    });
  });
});
