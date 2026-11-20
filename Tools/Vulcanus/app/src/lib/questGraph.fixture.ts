import type { Quest } from '../types/quest';
import type { QuestGraph, QuestGraphNode } from '../types/questGraph';
import { objectivePin, questDataWire, questEnd, questWire } from './questGraph';

/**
 * Tests only: lays out a graph for a quest written as its compiled fields, so fixtures can stay short. Every quest
 * Vulcanus opens has its own graph.
 */
export function graphFromQuest(quest: Omit<Quest, 'editorGraph'>): QuestGraph {
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

/** Tests only: the quest with its graph laid out by {@link graphFromQuest}. */
export function withGraph(quest: Omit<Quest, 'editorGraph'>): Quest {
  return { ...quest, editorGraph: graphFromQuest(quest) };
}
