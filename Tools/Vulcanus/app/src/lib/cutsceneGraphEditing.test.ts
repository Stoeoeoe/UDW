import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import {
  copyGraphSelection,
  pasteGraphSelection,
  deleteGraphSelection,
  layoutCutsceneGraph,
  insertExecutionNode,
} from './cutsceneGraphEditing';
import type { CutsceneGraph } from '../types/cutsceneGraph';

const graph = (): CutsceneGraph => ({
  nodes: [
    { id: 'start', kind: 'entry', position: { x: 0, y: 0 } },
    { id: 'split', kind: 'parallel', pair: 'join', position: { x: 0, y: 0 } },
    {
      id: 'wait',
      kind: 'action',
      step: { id: 'wait', action: 'cutscene.wait', arguments: { seconds: 1 } },
      position: { x: 0, y: 0 },
    },
    { id: 'join', kind: 'join', pair: 'split', position: { x: 0, y: 0 } },
    { id: 'end', kind: 'exit', position: { x: 0, y: 0 } },
  ],
  edges: [
    {
      id: 'a',
      source: 'start',
      sourcePin: 'next',
      target: 'split',
      targetPin: 'in',
      kind: 'execution',
    },
    {
      id: 'b',
      source: 'split',
      sourcePin: 'track-0',
      target: 'wait',
      targetPin: 'in',
      kind: 'execution',
    },
    {
      id: 'c',
      source: 'wait',
      sourcePin: 'next',
      target: 'join',
      targetPin: 'track-0',
      kind: 'execution',
    },
    {
      id: 'd',
      source: 'join',
      sourcePin: 'next',
      target: 'end',
      targetPin: 'in',
      kind: 'execution',
    },
  ],
});

it('keeps canvas notes where authored during layout and preserves annotations on copy', () => {
  const source = graph();
  source.nodes.push({
    id: 'note',
    kind: 'comment',
    comment: 'Walk together',
    position: { x: 70, y: -300 },
  });
  source.nodes.find((n) => n.id === 'wait')!.comment = 'Reaction hold';
  layoutCutsceneGraph(source, new Map());
  expect(source.nodes.find((n) => n.id === 'note')!.position).toEqual({ x: 70, y: -300 });
  const copied = copyGraphSelection(source, new Set(['note', 'wait']));
  const ids = pasteGraphSelection(source, copied);
  expect(source.nodes.filter((n) => ids.includes(n.id)).map((n) => n.comment)).toEqual([
    'Reaction hold',
    'Walk together',
  ]);
});

describe('cutscene graph editing', () => {
  it('inserts an isolated action between both ends of an execution wire', () => {
    const source = graph();
    source.edges = source.edges.filter((e) => !['b', 'c'].includes(e.id));
    expect(insertExecutionNode(source, 'wait', 'd')).toBe(true);
    expect(source.edges.find((e) => e.id === 'd')).toMatchObject({
      source: 'join',
      target: 'wait',
      targetPin: 'in',
    });
    expect(source.edges.find((e) => e.source === 'wait')).toMatchObject({
      sourcePin: 'next',
      target: 'end',
      targetPin: 'in',
    });
  });

  it('closes the previous gap when moving a connected action and preserves data wires', () => {
    const source = graph();
    source.edges.push({
      id: 'value',
      source: 'start',
      sourcePin: 'value',
      target: 'wait',
      targetPin: 'seconds',
      kind: 'data',
    });
    expect(insertExecutionNode(source, 'wait', 'd')).toBe(true);
    expect(source.edges.find((e) => e.source === 'split')).toMatchObject({
      target: 'join',
      targetPin: 'track-0',
    });
    expect(source.edges.find((e) => e.id === 'value')).toBeDefined();
    const before = structuredClone(source);
    expect(insertExecutionNode(source, 'join', 'd')).toBe(false);
    expect(insertExecutionNode(source, 'wait', 'value')).toBe(false);
    expect(source).toEqual(before);
  });
  it('duplicates paired controls and internal wires with fresh node, step and edge IDs', () => {
    const source = graph();
    const copied = copyGraphSelection(source, new Set(['start', 'split', 'wait']));
    expect(copied.nodes.map((n) => n.id)).toEqual(['split', 'wait', 'join']);
    const ids = pasteGraphSelection(source, copied);
    expect(new Set(source.nodes.map((n) => n.id)).size).toBe(8);
    const pasted = source.nodes.filter((n) => ids.includes(n.id));
    expect(pasted.find((n) => n.kind === 'action')!.step!.id).toBe(
      pasted.find((n) => n.kind === 'action')!.id,
    );
    expect(pasted.find((n) => n.kind === 'parallel')!.pair).toBe(
      pasted.find((n) => n.kind === 'join')!.id,
    );
    expect(
      source.edges.slice(4).every((e) => ids.includes(e.source) && ids.includes(e.target)),
    ).toBe(true);
    expect(copied.nodes[0].position.x).toBe(0);
  });

  it('protects entry/exit, removes paired joins and selected edges', () => {
    const source = graph();
    deleteGraphSelection(source, new Set(['start', 'end', 'split']), new Set(['b']));
    expect(source.nodes.map((n) => n.id)).toEqual(['start', 'wait', 'end']);
    expect(source.edges).toEqual([]);
  });
  it('deletes a paired selection inside an immutable edit without cloning draft proxies', () => {
    const source = graph();
    const result = produce(source, (draft) =>
      deleteGraphSelection(draft, new Set(['split']), new Set()),
    );
    expect(result.nodes.map((n) => n.id)).toEqual(['start', 'wait', 'end']);
    expect(source.nodes).toHaveLength(5);
  });

  it('lays out measured nodes left to right without changing graph semantics', () => {
    const source = graph();
    const edges = structuredClone(source.edges);
    layoutCutsceneGraph(
      source,
      new Map(source.nodes.map((n) => [n.id, { width: 300, height: n.id === 'wait' ? 600 : 100 }])),
    );
    expect(source.nodes.map((n) => n.position.x)).toEqual(
      [...source.nodes.map((n) => n.position.x)].sort((a, b) => a - b),
    );
    expect(source.edges).toEqual(edges);
    const first = structuredClone(source);
    layoutCutsceneGraph(
      source,
      new Map(source.nodes.map((n) => [n.id, { width: 300, height: n.id === 'wait' ? 600 : 100 }])),
    );
    expect(source).toEqual(first);
  });
  it('leaves room for a wider Lua node between ordinary nodes', () => {
    const source = graph();
    const sizes = new Map(
      source.nodes.map((n) => [n.id, { width: n.id === 'wait' ? 460 : 300, height: 260 }]),
    );
    layoutCutsceneGraph(source, sizes);
    for (const edge of source.edges) {
      const left = source.nodes.find((n) => n.id === edge.source)!;
      const right = source.nodes.find((n) => n.id === edge.target)!;
      expect(right.position.x - left.position.x - sizes.get(left.id)!.width).toBeGreaterThanOrEqual(
        110,
      );
    }
  });
});
