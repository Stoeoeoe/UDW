import {
  DialogueChoiceOption,
  DialogueDocument,
  DialogueNode,
  DialogueNodeEditorMeta,
  DialogueNodeType,
} from '../../../types/schema';
import {
  assignBranchMetaToNode,
  createNodeByType,
  ensureValidStartNodeId,
  inferBranchForInsert,
  nextOptionId,
  relinkLinearFlow,
  removeNodesWithCleanup,
  reorderNodeBlocks,
  suggestMsgKey,
} from './dialogueUtils';

export function renameNodeInDialogue(
  dialogue: DialogueDocument,
  oldId: string,
  newId: string,
): DialogueDocument {
  const trimmed = newId.trim();
  if (!trimmed || trimmed === oldId) return dialogue;
  if (dialogue.nodes.some((node) => node.id === trimmed)) return dialogue;

  const nodes = dialogue.nodes.map((node) => {
    const updated = node.id === oldId ? { ...node, id: trimmed } : node;

    if ((updated.type === 'line' || updated.type === 'action') && updated.next === oldId) {
      return { ...updated, next: trimmed };
    }

    if (updated.type === 'choice') {
      return {
        ...updated,
        options: updated.options.map((option) =>
          option.targetNodeId === oldId ? { ...option, targetNodeId: trimmed } : option,
        ),
        editor:
          updated.editor?.parentChoiceNodeId === oldId
            ? { ...updated.editor, parentChoiceNodeId: trimmed }
            : updated.editor,
      };
    }

    if (updated.type === 'jump' && updated.targetNodeId === oldId && !updated.targetDialogueId) {
      return { ...updated, targetNodeId: trimmed };
    }

    if (updated.editor?.parentChoiceNodeId === oldId) {
      return { ...updated, editor: { ...updated.editor, parentChoiceNodeId: trimmed } };
    }

    return updated;
  });

  const startNodeId =
    dialogue.startNodeId === oldId
      ? ensureValidStartNodeId(nodes, trimmed)
      : ensureValidStartNodeId(nodes, dialogue.startNodeId);

  return {
    ...dialogue,
    startNodeId,
    nodes,
  };
}

export function insertNodeAtIndex(
  dialogue: DialogueDocument,
  nodeType: DialogueNodeType,
  index: number,
): { dialogue: DialogueDocument; insertedNodeId: string } {
  const branchMeta = inferBranchForInsert(dialogue.nodes, index);
  const created = createNodeByType(nodeType, dialogue, branchMeta);
  const nextNodes = [...dialogue.nodes];
  nextNodes.splice(index, 0, created);
  const relinked = relinkLinearFlow(nextNodes);

  return {
    insertedNodeId: created.id,
    dialogue: {
      ...dialogue,
      startNodeId: ensureValidStartNodeId(relinked, dialogue.startNodeId || created.id),
      nodes: relinked,
    },
  };
}

export function appendTopLevelNode(
  dialogue: DialogueDocument,
  nodeType: DialogueNodeType,
): { dialogue: DialogueDocument; insertedNodeId: string } {
  const created = createNodeByType(nodeType, dialogue, undefined);
  const nextNodes = [...dialogue.nodes, created];
  const relinked = relinkLinearFlow(nextNodes);

  return {
    insertedNodeId: created.id,
    dialogue: {
      ...dialogue,
      startNodeId: dialogue.startNodeId || created.id,
      nodes: relinked,
    },
  };
}

export function appendNodeToChoiceBranch(
  dialogue: DialogueDocument,
  nodeType: DialogueNodeType,
  choiceNodeId: string,
  optionId: string,
  branchOrder: number,
): { dialogue: DialogueDocument; insertedNodeId: string } {
  const branchId = `${choiceNodeId}:${optionId}`;
  const branchNodes = dialogue.nodes.filter(
    (node) =>
      node.editor?.parentChoiceNodeId === choiceNodeId && node.editor?.parentOptionId === optionId,
  );
  const branchMeta: DialogueNodeEditorMeta = {
    branchId,
    parentChoiceNodeId: choiceNodeId,
    parentOptionId: optionId,
    branchOrder,
  };
  const created = createNodeByType(nodeType, dialogue, branchMeta);

  let insertAt: number;
  if (branchNodes.length > 0) {
    const lastBranchNode = branchNodes[branchNodes.length - 1];
    insertAt = dialogue.nodes.findIndex((node) => node.id === lastBranchNode.id) + 1;
  } else {
    insertAt = dialogue.nodes.findIndex((node) => node.id === choiceNodeId) + 1;
  }

  const nextNodes = [...dialogue.nodes];
  nextNodes.splice(insertAt, 0, created);

  return {
    insertedNodeId: created.id,
    dialogue: {
      ...dialogue,
      nodes: nextNodes,
    },
  };
}

export function updateNodeById(
  dialogue: DialogueDocument,
  nodeId: string,
  updater: (node: DialogueNode) => DialogueNode,
): DialogueDocument {
  return {
    ...dialogue,
    nodes: dialogue.nodes.map((node) => (node.id === nodeId ? updater(node) : node)),
  };
}

function collectNodeRemovalIds(dialogue: DialogueDocument, nodeId: string): Set<string> {
  const removeIds = new Set<string>([nodeId]);
  const node = dialogue.nodes.find((entry) => entry.id === nodeId);

  if (node?.type === 'choice') {
    for (const entry of dialogue.nodes) {
      if (entry.editor?.parentChoiceNodeId === node.id) {
        removeIds.add(entry.id);
      }
    }
  }

  return removeIds;
}

export function removeNodeFromDialogue(
  dialogue: DialogueDocument,
  nodeId: string,
): DialogueDocument {
  const cleaned = removeNodesWithCleanup(dialogue, collectNodeRemovalIds(dialogue, nodeId));
  const relinked = relinkLinearFlow(cleaned.nodes);

  return {
    ...cleaned,
    startNodeId: ensureValidStartNodeId(relinked, cleaned.startNodeId),
    nodes: relinked,
  };
}

export function updateChoiceOptionInDialogue(
  dialogue: DialogueDocument,
  choiceNodeId: string,
  optionId: string,
  updater: (option: DialogueChoiceOption) => DialogueChoiceOption,
): DialogueDocument {
  return {
    ...dialogue,
    nodes: dialogue.nodes.map((node) => {
      if (node.id !== choiceNodeId || node.type !== 'choice') return node;
      return {
        ...node,
        options: node.options.map((option) => (option.id === optionId ? updater(option) : option)),
      };
    }),
  };
}

export function moveChoiceOptionInDialogue(
  dialogue: DialogueDocument,
  choiceNodeId: string,
  from: number,
  direction: -1 | 1,
): DialogueDocument {
  const to = from + direction;

  return {
    ...dialogue,
    nodes: dialogue.nodes.map((node) => {
      if (node.id !== choiceNodeId || node.type !== 'choice') return node;
      if (to < 0 || to >= node.options.length) return node;

      const options = [...node.options];
      const [picked] = options.splice(from, 1);
      options.splice(to, 0, picked);
      return { ...node, options };
    }),
  };
}

export function removeChoiceOptionFromDialogue(
  dialogue: DialogueDocument,
  choiceNodeId: string,
  optionId: string,
): DialogueDocument {
  return {
    ...dialogue,
    nodes: dialogue.nodes.map((node) => {
      if (node.id !== choiceNodeId || node.type !== 'choice') return node;
      if (node.options.length <= 1) return node;

      return {
        ...node,
        options: node.options.filter((option) => option.id !== optionId),
      };
    }),
  };
}

export function addChoiceOptionToDialogue(
  dialogue: DialogueDocument,
  choiceNodeId: string,
): DialogueDocument {
  return {
    ...dialogue,
    nodes: dialogue.nodes.map((node) => {
      if (node.id !== choiceNodeId || node.type !== 'choice') return node;
      const id = nextOptionId(node.options);
      return {
        ...node,
        options: [
          ...node.options,
          {
            id,
            text: `Option ${node.options.length + 1}`,
            msgKey: suggestMsgKey(dialogue.id, dialogue.nodes, `c${node.options.length + 1}`),
            condition: null,
            targetNodeId: '',
          },
        ],
      };
    }),
  };
}

export function assignChoiceOptionTarget(
  dialogue: DialogueDocument,
  choiceNodeId: string,
  optionId: string,
  targetNodeId: string,
  branchOrder: number,
): DialogueDocument {
  const updated = updateChoiceOptionInDialogue(dialogue, choiceNodeId, optionId, (option) => ({
    ...option,
    targetNodeId,
  }));

  return {
    ...updated,
    nodes: assignBranchMetaToNode(updated.nodes, targetNodeId, {
      branchId: `${choiceNodeId}:${optionId}`,
      parentChoiceNodeId: choiceNodeId,
      parentOptionId: optionId,
      branchOrder,
    }),
  };
}

export function reorderDialogueNodes(
  dialogue: DialogueDocument,
  activeId: string,
  overId: string,
): DialogueDocument {
  const reordered = reorderNodeBlocks(dialogue.nodes, activeId, overId);
  const relinked = relinkLinearFlow(reordered);

  return {
    ...dialogue,
    startNodeId: ensureValidStartNodeId(relinked, dialogue.startNodeId),
    nodes: relinked,
  };
}
