import { describe, expect, it } from 'vitest';
import { DialogueDocument } from '../../../types/schema';
import {
  addChoiceOptionToDialogue,
  assignChoiceOptionTarget,
  removeNodeFromDialogue,
  renameNodeInDialogue,
} from './dialogueMutations';

function createDialogue(overrides: Partial<DialogueDocument> = {}): DialogueDocument {
  return {
    version: 1,
    id: 'intro',
    name: 'Intro',
    oneShot: false,
    startNodeId: 'line_1',
    tags: [],
    createdAt: '2026-04-23T00:00:00.000Z',
    updatedAt: '2026-04-23T00:00:00.000Z',
    nodes: [],
    ...overrides,
  };
}

describe('dialogueMutations', () => {
  it('renames a node and updates local references', () => {
    const dialogue = createDialogue({
      startNodeId: 'line_1',
      nodes: [
        { id: 'line_1', type: 'line', text: 'Hello', msgKey: 'dlg.intro.01', next: 'choice_1' },
        {
          id: 'choice_1',
          type: 'choice',
          options: [
            {
              id: 'a',
              text: 'Continue',
              msgKey: 'dlg.intro.c1',
              targetNodeId: 'line_1',
            },
          ],
        },
        { id: 'action_1', type: 'action', lua: 'return true', next: 'line_1' },
        { id: 'jump_1', type: 'jump', targetNodeId: 'line_1' },
      ],
    });

    const updated = renameNodeInDialogue(dialogue, 'line_1', 'line_start');

    expect(updated.startNodeId).toBe('line_start');
    expect(updated.nodes[0].id).toBe('line_start');
    expect(updated.nodes[1].type === 'choice' && updated.nodes[1].options[0].targetNodeId).toBe(
      'line_start',
    );
    expect(updated.nodes[2].type === 'action' && updated.nodes[2].next).toBe('line_start');
    expect(updated.nodes[3].type === 'jump' && updated.nodes[3].targetNodeId).toBe('line_start');
  });

  it('removes a choice node together with its branch nodes', () => {
    const dialogue = createDialogue({
      startNodeId: 'choice_1',
      nodes: [
        {
          id: 'choice_1',
          type: 'choice',
          options: [
            { id: 'a', text: 'A', msgKey: 'dlg.intro.c1', targetNodeId: 'line_1' },
            { id: 'b', text: 'B', msgKey: 'dlg.intro.c2', targetNodeId: 'line_2' },
          ],
        },
        {
          id: 'line_1',
          type: 'line',
          text: 'Branch A',
          msgKey: 'dlg.intro.01',
          editor: { parentChoiceNodeId: 'choice_1', parentOptionId: 'a', branchOrder: 0 },
        },
        {
          id: 'line_2',
          type: 'line',
          text: 'Branch B',
          msgKey: 'dlg.intro.02',
          editor: { parentChoiceNodeId: 'choice_1', parentOptionId: 'b', branchOrder: 1 },
        },
        { id: 'end_1', type: 'end' },
      ],
    });

    const updated = removeNodeFromDialogue(dialogue, 'choice_1');

    expect(updated.nodes.map((node) => node.id)).toEqual(['end_1']);
    expect(updated.startNodeId).toBe('end_1');
  });

  it('adds a choice option and can assign its target branch metadata', () => {
    const dialogue = createDialogue({
      nodes: [
        {
          id: 'choice_1',
          type: 'choice',
          options: [{ id: 'a', text: 'A', msgKey: 'dlg.intro.c1', targetNodeId: '' }],
        },
        { id: 'line_1', type: 'line', text: 'After', msgKey: 'dlg.intro.01' },
      ],
    });

    const withOption = addChoiceOptionToDialogue(dialogue, 'choice_1');
    const choiceNode = withOption.nodes[0];
    expect(choiceNode.type === 'choice' && choiceNode.options).toHaveLength(2);

    const secondOption = choiceNode.type === 'choice' ? choiceNode.options[1] : null;
    expect(secondOption?.msgKey).toBe('dlg.intro.02c2');

    const assigned = assignChoiceOptionTarget(
      withOption,
      'choice_1',
      secondOption!.id,
      'line_1',
      1,
    );
    const lineNode = assigned.nodes.find((node) => node.id === 'line_1');

    expect(lineNode?.editor).toMatchObject({
      branchId: `choice_1:${secondOption!.id}`,
      parentChoiceNodeId: 'choice_1',
      parentOptionId: secondOption!.id,
      branchOrder: 1,
    });
  });
});
