import dagre from '@dagrejs/dagre';
import type { CutsceneGraph } from '../types/cutsceneGraph';

/** Move an ordinary executable into a wire, closing its previous linear gap. */
export function insertExecutionNode(graph: CutsceneGraph, nodeId: string, edgeId: string): boolean {
  const node = graph.nodes.find((n) => n.id === nodeId);
  const edge = graph.edges.find((e) => e.id === edgeId);
  if (
    !node ||
    !['action', 'lua'].includes(node.kind) ||
    !edge ||
    edge.kind !== 'execution' ||
    edge.source === nodeId ||
    edge.target === nodeId
  )
    return false;
  const incoming = graph.edges.filter((e) => e.kind === 'execution' && e.target === nodeId);
  const outgoing = graph.edges.filter((e) => e.kind === 'execution' && e.source === nodeId);
  if (incoming.length > 1 || outgoing.length > 1) return false;
  graph.edges = graph.edges.filter(
    (e) => e.id !== edgeId && !incoming.includes(e) && !outgoing.includes(e),
  );
  if (incoming.length && outgoing.length)
    graph.edges.push({
      ...incoming[0],
      target: outgoing[0].target,
      targetPin: outgoing[0].targetPin,
    });
  graph.edges.push(
    { ...edge, target: nodeId, targetPin: 'in' },
    {
      id: `wire-${crypto.randomUUID()}`,
      source: nodeId,
      sourcePin: 'next',
      target: edge.target,
      targetPin: edge.targetPin,
      kind: 'execution',
    },
  );
  return true;
}

/** Copy internal wires only. Structural controls travel with their matching join. */
export function copyGraphSelection(graph: CutsceneGraph, selected: Set<string>): CutsceneGraph {
  const ids = new Set(selected);
  for (const node of graph.nodes) if (ids.has(node.id) && node.pair) ids.add(node.pair);
  const nodes = graph.nodes.filter((n) => ids.has(n.id) && n.kind !== 'entry' && n.kind !== 'exit');
  const included = new Set(nodes.map((n) => n.id));
  return structuredClone({
    nodes,
    edges: graph.edges.filter((e) => included.has(e.source) && included.has(e.target)),
  });
}

export function pasteGraphSelection(
  graph: CutsceneGraph,
  copied: CutsceneGraph,
  offset = 48,
): string[] {
  const ids = new Map(copied.nodes.map((n) => [n.id, `node-${crypto.randomUUID()}`]));
  const nodes = structuredClone(copied.nodes);
  for (const node of nodes) {
    node.id = ids.get(node.id)!;
    if (node.step) node.step.id = node.id;
    if (node.pair) node.pair = ids.get(node.pair)!;
    node.position.x += offset;
    node.position.y += offset;
  }
  graph.nodes.push(...nodes);
  graph.edges.push(
    ...copied.edges.map((e) => ({
      ...e,
      id: `wire-${crypto.randomUUID()}`,
      source: ids.get(e.source)!,
      target: ids.get(e.target)!,
    })),
  );
  return nodes.map((n) => n.id);
}

export function deleteGraphSelection(
  graph: CutsceneGraph,
  selected: Set<string>,
  edges: Set<string>,
): void {
  const remove = new Set(copyGraphSelection(graph, selected).nodes.map((n) => n.id));
  graph.nodes = graph.nodes.filter((n) => !remove.has(n.id));
  graph.edges = graph.edges.filter(
    (e) => !edges.has(e.id) && !remove.has(e.source) && !remove.has(e.target),
  );
}

/** Layout all execution and data dependencies; positions are the only authored values changed. */
export function layoutCutsceneGraph(
  graph: CutsceneGraph,
  sizes: Map<string, { width: number; height: number }>,
): void {
  const layout = new dagre.graphlib.Graph({ multigraph: true });
  layout.setGraph({ rankdir: 'LR', nodesep: 70, ranksep: 110, marginx: 50, marginy: 60 });
  layout.setDefaultEdgeLabel(() => ({}));
  for (const node of graph.nodes)
    layout.setNode(node.id, sizes.get(node.id) ?? { width: 300, height: 260 });
  for (const edge of graph.edges)
    layout.setEdge(
      edge.source,
      edge.target,
      { weight: edge.kind === 'execution' ? 4 : 1 },
      edge.id,
    );
  dagre.layout(layout);
  for (const node of graph.nodes) {
    const placed = layout.node(node.id);
    node.position = { x: placed.x - placed.width / 2, y: placed.y - placed.height / 2 };
  }
}
