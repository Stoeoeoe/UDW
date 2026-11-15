import { describe, expect, it } from 'vitest';
import {
  compileQuestGraph,
  graphFromQuest,
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
    expect(() => compileQuestGraph(source, null)).toThrow('branching');
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
});
