import {
  DialogueChoiceNode,
  DialogueChoiceOption,
  DialogueDocument,
  DialogueI18nExport,
  DialogueType,
  DialogueNode,
  DialogueNodeEditorMeta,
  DialogueNodeType,
  Project,
  ScriptContextType,
} from '../../../types/schema';

export type DialogueTab = 'timeline' | 'settings';

export type MetadataDraft = {
  name: string;
  oneShot: boolean;
  dialogueTypeId: string;
};

export type ActionLuaValidation = {
  ok: boolean;
  error?: string;
};

export const BRANCH_COLORS = ['#7c5cff', '#34d399', '#60a5fa', '#f59e0b', '#ef4444', '#a78bfa'];

export function nowIso(): string {
  return new Date().toISOString();
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function nextDialogueId(dialogues: Iterable<Pick<DialogueDocument, 'id'>>): string {
  let max = 0;
  for (const entry of dialogues) {
    const match = /^dlg_(\d+)$/.exec(entry.id);
    if (!match) continue;
    max = Math.max(max, Number(match[1]));
  }
  return `dlg_${max + 1}`;
}

export function nextNodeId(nodes: DialogueNode[]): string {
  const existing = new Set(nodes.map((n) => n.id));
  let i = 1;
  while (existing.has(`step_${i}`)) i++;
  return `step_${i}`;
}

export function nextOptionId(options: DialogueChoiceOption[]): string {
  const max = options.reduce((acc, option) => {
    const match = /^o(\d+)$/.exec(option.id);
    if (!match) return acc;
    return Math.max(acc, Number(match[1]));
  }, 0);
  return `o${max + 1}`;
}

export function suggestMsgKey(dialogueId: string, nodes: DialogueNode[], suffix = ''): string {
  const escaped = dialogueId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^dlg\\.${escaped}\\.(\\d+)`);

  let max = 0;
  for (const node of nodes) {
    if (node.type === 'line') {
      const match = pattern.exec(node.msgKey || '');
      if (match) max = Math.max(max, Number(match[1]));
    }
    if (node.type === 'choice') {
      for (const option of node.options) {
        const match = pattern.exec(option.msgKey || '');
        if (match) max = Math.max(max, Number(match[1]));
      }
    }
  }

  const seq = String(max + 1).padStart(2, '0');
  return `dlg.${dialogueId}.${seq}${suffix}`;
}

export function parseTags(tagsText: string): string[] {
  return tagsText
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function branchColor(branchOrder?: number): string {
  if (branchOrder === undefined || branchOrder < 0) return '#7c5cff';
  return BRANCH_COLORS[branchOrder % BRANCH_COLORS.length];
}

export function isBranchNode(node: DialogueNode): boolean {
  return Boolean(node.editor?.parentChoiceNodeId);
}

export function isNavigable(node: DialogueNode): boolean {
  return node.type !== 'comment';
}

export function getFirstNavigableNodeId(nodes: DialogueNode[]): string | null {
  return nodes.find((node) => isNavigable(node))?.id ?? null;
}

export function ensureValidStartNodeId(
  nodes: DialogueNode[],
  candidateStartNodeId?: string | null,
): string {
  const nodeSet = new Set(nodes.map((node) => node.id));
  if (candidateStartNodeId && nodeSet.has(candidateStartNodeId)) {
    const startNode = nodes.find((node) => node.id === candidateStartNodeId);
    if (startNode && isNavigable(startNode)) {
      return candidateStartNodeId;
    }
  }

  return getFirstNavigableNodeId(nodes) ?? candidateStartNodeId ?? 'step_1';
}

export function createEmptyDialogue(
  id: string,
  name: string,
  oneShot: boolean,
  dialogueTypeId: string,
): DialogueDocument {
  const firstNodeId = 'step_1';
  return {
    version: 1,
    id,
    name,
    oneShot,
    dialogueTypeId: dialogueTypeId.trim() || undefined,
    startNodeId: firstNodeId,
    tags: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    nodes: [
      {
        id: firstNodeId,
        type: 'line',
        text: '',
        msgKey: `dlg.${id}.01`,
        next: null,
      },
    ],
  };
}

export function normalizeNode(node: unknown, fallbackId: string): DialogueNode | null {
  if (!node || typeof node !== 'object') return null;
  const value = node as Record<string, unknown>;
  const type = value.type;
  if (typeof type !== 'string') return null;

  const id = typeof value.id === 'string' ? value.id : fallbackId;
  const editor =
    value.editor && typeof value.editor === 'object'
      ? {
          branchId:
            typeof (value.editor as Record<string, unknown>).branchId === 'string'
              ? ((value.editor as Record<string, unknown>).branchId as string)
              : undefined,
          parentChoiceNodeId:
            typeof (value.editor as Record<string, unknown>).parentChoiceNodeId === 'string'
              ? ((value.editor as Record<string, unknown>).parentChoiceNodeId as string)
              : undefined,
          parentOptionId:
            typeof (value.editor as Record<string, unknown>).parentOptionId === 'string'
              ? ((value.editor as Record<string, unknown>).parentOptionId as string)
              : undefined,
          branchOrder:
            typeof (value.editor as Record<string, unknown>).branchOrder === 'number'
              ? ((value.editor as Record<string, unknown>).branchOrder as number)
              : undefined,
        }
      : undefined;

  if (type === 'line') {
    return {
      id,
      type,
      speaker: typeof value.speaker === 'string' ? value.speaker : undefined,
      emotion: typeof value.emotion === 'string' ? value.emotion : undefined,
      text: typeof value.text === 'string' ? value.text : '',
      msgKey: typeof value.msgKey === 'string' ? value.msgKey : '',
      next: typeof value.next === 'string' ? value.next : null,
      editor,
    };
  }

  if (type === 'choice') {
    const optionsRaw = Array.isArray(value.options) ? value.options : [];
    const options: DialogueChoiceOption[] = optionsRaw.map((option, index) => {
      const item = (option ?? {}) as Record<string, unknown>;
      return {
        id: typeof item.id === 'string' ? item.id : `o${index + 1}`,
        text: typeof item.text === 'string' ? item.text : '',
        msgKey: typeof item.msgKey === 'string' ? item.msgKey : '',
        condition: typeof item.condition === 'string' ? item.condition : null,
        targetNodeId: typeof item.targetNodeId === 'string' ? item.targetNodeId : '',
      };
    });

    return {
      id,
      type,
      options,
      editor,
    };
  }

  if (type === 'action') {
    return {
      id,
      type,
      lua: typeof value.lua === 'string' ? value.lua : '',
      next: typeof value.next === 'string' ? value.next : null,
      editor,
    };
  }

  if (type === 'jump') {
    return {
      id,
      type,
      targetDialogueId: typeof value.targetDialogueId === 'string' ? value.targetDialogueId : null,
      targetNodeId: typeof value.targetNodeId === 'string' ? value.targetNodeId : '',
      editor,
    };
  }

  if (type === 'comment') {
    return {
      id,
      type,
      text: typeof value.text === 'string' ? value.text : '',
      editor,
    };
  }

  if (type === 'end') {
    return {
      id,
      type,
      editor,
    };
  }

  return null;
}

export function migrateFromStepTransitionModel(
  raw: Record<string, unknown>,
  dialogueId: string,
): DialogueDocument {
  const steps = Array.isArray(raw.steps) ? (raw.steps as Array<Record<string, unknown>>) : [];
  const transitions = Array.isArray(raw.transitions)
    ? (raw.transitions as Array<Record<string, unknown>>)
    : [];

  const nodes: DialogueNode[] = [];
  for (const step of steps) {
    const stepId = typeof step.id === 'string' ? step.id : nextNodeId(nodes);
    if (step.type === 'action') {
      nodes.push({
        id: stepId,
        type: 'action',
        lua: typeof step.lua === 'string' ? step.lua : '',
        next: null,
      });
      continue;
    }

    nodes.push({
      id: stepId,
      type: 'line',
      text: typeof step.text === 'string' ? step.text : '',
      msgKey: suggestMsgKey(dialogueId, nodes),
      next: null,
    });
  }

  for (const node of nodes) {
    const fromTransitions = transitions.filter((transition) => transition.fromStepId === node.id);
    const choiceTransitions = fromTransitions.filter(
      (transition) => typeof transition.optionText === 'string' && transition.optionText.trim(),
    );
    const autoTransition = fromTransitions.find(
      (transition) => !(typeof transition.optionText === 'string' && transition.optionText.trim()),
    );

    if (choiceTransitions.length > 0) {
      const choiceId = `choice_${node.id}`;
      const choiceNode: DialogueChoiceNode = {
        id: choiceId,
        type: 'choice',
        options: choiceTransitions.map((transition, index) => ({
          id: typeof transition.id === 'string' ? transition.id : `o${index + 1}`,
          text: String(transition.optionText),
          msgKey: suggestMsgKey(dialogueId, nodes, `c${index + 1}`),
          condition:
            typeof transition.conditionLua === 'string'
              ? (transition.conditionLua as string)
              : null,
          targetNodeId:
            typeof transition.toStepId === 'string' ? (transition.toStepId as string) : '',
        })),
      };

      nodes.push(choiceNode);

      if (node.type === 'line' || node.type === 'action') {
        node.next = choiceId;
      }
      continue;
    }

    if ((node.type === 'line' || node.type === 'action') && autoTransition) {
      node.next =
        typeof autoTransition.toStepId === 'string' ? (autoTransition.toStepId as string) : null;
    }
  }

  const startNodeId =
    typeof raw.entryStepId === 'string' ? (raw.entryStepId as string) : (nodes[0]?.id ?? 'n1');

  return {
    version: 1,
    id: typeof raw.id === 'string' ? (raw.id as string) : dialogueId,
    name: typeof raw.name === 'string' ? (raw.name as string) : 'Dialogue',
    oneShot: false,
    dialogueTypeId: undefined,
    startNodeId,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    createdAt: typeof raw.createdAt === 'string' ? (raw.createdAt as string) : nowIso(),
    updatedAt: typeof raw.updatedAt === 'string' ? (raw.updatedAt as string) : nowIso(),
    nodes,
  };
}

export function normalizeDialogueDocument(raw: unknown, fallbackId: string): DialogueDocument {
  if (!raw || typeof raw !== 'object') {
    return createEmptyDialogue(fallbackId, 'New Dialogue', false, '');
  }

  const value = raw as Record<string, unknown>;

  if (Array.isArray(value.nodes)) {
    const nodes = (value.nodes as unknown[])
      .map((node, index) => normalizeNode(node, `n${index + 1}`))
      .filter((node): node is DialogueNode => node !== null);

    const safeNodes =
      nodes.length > 0 ? nodes : createEmptyDialogue(fallbackId, 'New Dialogue', false, '').nodes;
    const nodeSet = new Set(safeNodes.map((node) => node.id));

    const requestedStartNodeId =
      typeof value.startNodeId === 'string'
        ? (value.startNodeId as string)
        : typeof value.entryStepId === 'string'
          ? (value.entryStepId as string)
          : safeNodes[0].id;
    const startNodeId = ensureValidStartNodeId(safeNodes, requestedStartNodeId);

    return {
      version: typeof value.version === 'number' ? (value.version as number) : 1,
      id: typeof value.id === 'string' ? (value.id as string) : fallbackId,
      name: typeof value.name === 'string' ? (value.name as string) : 'Dialogue',
      folderPath: typeof value.folderPath === 'string' ? (value.folderPath as string) : undefined,
      oneShot: typeof value.oneShot === 'boolean' ? (value.oneShot as boolean) : false,
      dialogueTypeId:
        typeof value.dialogueTypeId === 'string' && value.dialogueTypeId.trim()
          ? (value.dialogueTypeId as string)
          : undefined,
      startNodeId,
      tags: Array.isArray(value.tags) ? (value.tags as string[]) : [],
      createdAt: typeof value.createdAt === 'string' ? (value.createdAt as string) : nowIso(),
      updatedAt: typeof value.updatedAt === 'string' ? (value.updatedAt as string) : nowIso(),
      nodes: safeNodes,
    };
  }

  return migrateFromStepTransitionModel(value, fallbackId);
}

export function buildI18nExport(dialogue: DialogueDocument): DialogueI18nExport {
  const messages: DialogueI18nExport['messages'] = [];

  for (const node of dialogue.nodes) {
    if (node.type === 'line' && node.msgKey.trim()) {
      messages.push({
        msgKey: node.msgKey.trim(),
        text: node.text,
        nodeId: node.id,
        sourceType: 'line',
      });
    }

    if (node.type === 'choice') {
      for (const option of node.options) {
        if (!option.msgKey.trim()) continue;
        messages.push({
          msgKey: option.msgKey.trim(),
          text: option.text,
          nodeId: node.id,
          optionId: option.id,
          sourceType: 'choiceOption',
        });
      }
    }
  }

  return {
    dialogueId: dialogue.id,
    dialogueName: dialogue.name,
    generatedAt: nowIso(),
    messages,
  };
}

export function toRuntimeDialogue(dialogue: DialogueDocument): DialogueDocument {
  const nodes = dialogue.nodes;
  const nodeIdSet = new Set(nodes.map((node) => node.id));

  const sanitizedNodes = nodes.map((node) => {
    if (node.type === 'line') {
      return {
        ...node,
        editor: undefined,
        next: node.next && nodeIdSet.has(node.next) ? node.next : null,
      };
    }

    if (node.type === 'action') {
      return {
        ...node,
        editor: undefined,
        next: node.next && nodeIdSet.has(node.next) ? node.next : null,
      };
    }

    if (node.type === 'choice') {
      return {
        ...node,
        editor: undefined,
        options: node.options.map((option) => ({
          ...option,
          condition: option.condition?.trim() ? option.condition : null,
          targetNodeId: nodeIdSet.has(option.targetNodeId) ? option.targetNodeId : '',
        })),
      };
    }

    if (node.type === 'jump') {
      const targetDialogueId = node.targetDialogueId?.trim() ? node.targetDialogueId : null;
      return {
        ...node,
        editor: undefined,
        targetDialogueId,
        targetNodeId:
          !targetDialogueId && !nodeIdSet.has(node.targetNodeId) ? '' : node.targetNodeId,
      };
    }

    return {
      ...node,
      editor: undefined,
    };
  });

  const startNodeId = ensureValidStartNodeId(sanitizedNodes, dialogue.startNodeId);

  return {
    ...dialogue,
    startNodeId,
    nodes: sanitizedNodes,
  };
}

export function getDuplicateMsgKeys(dialogue: DialogueDocument): Set<string> {
  const counts = new Map<string, number>();

  for (const node of dialogue.nodes) {
    if (node.type === 'line') {
      const key = node.msgKey.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    if (node.type === 'choice') {
      for (const option of node.options) {
        const key = option.msgKey.trim();
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([key]) => key),
  );
}

export function getBrokenReferenceNodeIds(
  dialogue: DialogueDocument,
  allDialogues: Map<string, DialogueDocument>,
): Set<string> {
  const ids = new Set<string>();
  const nodeIds = new Set(dialogue.nodes.map((node) => node.id));

  if (!nodeIds.has(dialogue.startNodeId)) {
    ids.add(dialogue.startNodeId);
  }

  for (const node of dialogue.nodes) {
    if (node.type === 'line' || node.type === 'action') {
      if (node.next && !nodeIds.has(node.next)) {
        ids.add(node.id);
      }
      continue;
    }

    if (node.type === 'choice') {
      for (const option of node.options) {
        if (!option.targetNodeId || !nodeIds.has(option.targetNodeId)) {
          ids.add(node.id);
        }
      }
      continue;
    }

    if (node.type === 'jump') {
      const targetDialogueId = node.targetDialogueId || dialogue.id;
      const targetDialogue = allDialogues.get(targetDialogueId);
      if (!targetDialogue) {
        ids.add(node.id);
        continue;
      }

      const targetIds = new Set(targetDialogue.nodes.map((item) => item.id));
      if (!node.targetNodeId || !targetIds.has(node.targetNodeId)) {
        ids.add(node.id);
      }
    }
  }

  return ids;
}

export function relinkLinearFlow(nodes: DialogueNode[]): DialogueNode[] {
  const scopeToNodeIds = new Map<string, string[]>();

  for (const node of nodes) {
    if (!isNavigable(node)) continue;
    const scope = node.editor?.branchId ? `branch:${node.editor.branchId}` : 'top';
    const list = scopeToNodeIds.get(scope) ?? [];
    list.push(node.id);
    scopeToNodeIds.set(scope, list);
  }

  const nextByNodeId = new Map<string, string | null>();
  for (const nodeIds of scopeToNodeIds.values()) {
    for (let index = 0; index < nodeIds.length; index += 1) {
      nextByNodeId.set(nodeIds[index], nodeIds[index + 1] ?? null);
    }
  }

  return nodes.map((node) => {
    if (node.type === 'line' || node.type === 'action') {
      return {
        ...node,
        next: nextByNodeId.get(node.id) ?? null,
      };
    }

    return node;
  });
}

export function assignBranchMetaToNode(
  nodes: DialogueNode[],
  targetNodeId: string,
  meta: DialogueNodeEditorMeta,
): DialogueNode[] {
  return nodes.map((node) => {
    if (node.id !== targetNodeId) return node;
    return {
      ...node,
      editor: {
        ...(node.editor ?? {}),
        branchId: meta.branchId,
        parentChoiceNodeId: meta.parentChoiceNodeId,
        parentOptionId: meta.parentOptionId,
        branchOrder: meta.branchOrder,
      },
    };
  });
}

export function inferBranchForInsert(
  nodes: DialogueNode[],
  index: number,
): DialogueNodeEditorMeta | undefined {
  const prev = nodes[index - 1];
  const next = nodes[index];

  if (prev?.editor?.branchId && next?.editor?.branchId === prev.editor.branchId) {
    return prev.editor;
  }

  if (prev?.editor?.branchId && !next) {
    return prev.editor;
  }

  if (next?.editor?.branchId && !prev) {
    return next.editor;
  }

  return undefined;
}

export function createNodeByType(
  type: DialogueNodeType,
  dialogue: DialogueDocument,
  branchMeta?: DialogueNodeEditorMeta,
): DialogueNode {
  const id = nextNodeId(dialogue.nodes);

  if (type === 'line') {
    return {
      id,
      type,
      text: '',
      msgKey: suggestMsgKey(dialogue.id, dialogue.nodes),
      next: null,
      editor: branchMeta,
    };
  }

  if (type === 'choice') {
    return {
      id,
      type,
      options: [
        {
          id: 'o1',
          text: 'Option 1',
          msgKey: suggestMsgKey(dialogue.id, dialogue.nodes, 'a'),
          condition: null,
          targetNodeId: '',
        },
        {
          id: 'o2',
          text: 'Option 2',
          msgKey: suggestMsgKey(dialogue.id, dialogue.nodes, 'b'),
          condition: null,
          targetNodeId: '',
        },
      ],
      editor: branchMeta,
    };
  }

  if (type === 'action') {
    return {
      id,
      type,
      lua: '',
      next: null,
      editor: branchMeta,
    };
  }

  if (type === 'jump') {
    return {
      id,
      type,
      targetDialogueId: null,
      targetNodeId: '',
      editor: branchMeta,
    };
  }

  if (type === 'comment') {
    return {
      id,
      type,
      text: '',
      editor: branchMeta,
    };
  }

  return {
    id,
    type: 'end',
    editor: branchMeta,
  };
}

export function removeNodesWithCleanup(
  dialogue: DialogueDocument,
  nodeIds: Set<string>,
): DialogueDocument {
  let nodes = dialogue.nodes.filter((node) => !nodeIds.has(node.id));

  nodes = nodes.map((node) => {
    if (node.type === 'line' || node.type === 'action') {
      return {
        ...node,
        next: node.next && !nodeIds.has(node.next) ? node.next : null,
      };
    }

    if (node.type === 'choice') {
      return {
        ...node,
        options: node.options.map((option) => ({
          ...option,
          targetNodeId:
            option.targetNodeId && !nodeIds.has(option.targetNodeId) ? option.targetNodeId : '',
        })),
      };
    }

    if (node.type === 'jump') {
      return {
        ...node,
        targetNodeId: node.targetNodeId && !nodeIds.has(node.targetNodeId) ? node.targetNodeId : '',
      };
    }

    return node;
  });

  const nextStart = ensureValidStartNodeId(
    nodes,
    nodeIds.has(dialogue.startNodeId) ? null : dialogue.startNodeId,
  );

  return {
    ...dialogue,
    startNodeId: nextStart,
    nodes,
  };
}

export function buildNodeBlocks(
  nodes: DialogueNode[],
): Array<{ topNodeId: string; nodeIds: string[] }> {
  const blocks: Array<{ topNodeId: string; nodeIds: string[] }> = [];

  let index = 0;
  while (index < nodes.length) {
    const node = nodes[index];

    if (isBranchNode(node)) {
      blocks.push({ topNodeId: node.id, nodeIds: [node.id] });
      index += 1;
      continue;
    }

    if (node.type !== 'choice') {
      blocks.push({ topNodeId: node.id, nodeIds: [node.id] });
      index += 1;
      continue;
    }

    const nodeIds = [node.id];
    let inner = index + 1;
    while (inner < nodes.length) {
      const child = nodes[inner];
      if (child.editor?.parentChoiceNodeId !== node.id) break;
      nodeIds.push(child.id);
      inner += 1;
    }

    blocks.push({ topNodeId: node.id, nodeIds });
    index = inner;
  }

  return blocks;
}

export function reorderNodeBlocks(
  nodes: DialogueNode[],
  sourceTopNodeId: string,
  targetTopNodeId: string | null,
): DialogueNode[] {
  const blocks = buildNodeBlocks(nodes);
  const sourceIndex = blocks.findIndex((block) => block.topNodeId === sourceTopNodeId);
  if (sourceIndex < 0) return nodes;

  const targetIndex = targetTopNodeId
    ? blocks.findIndex((block) => block.topNodeId === targetTopNodeId)
    : blocks.length;

  if (targetIndex < 0) return nodes;

  const [sourceBlock] = blocks.splice(sourceIndex, 1);
  const nextTarget = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  blocks.splice(nextTarget, 0, sourceBlock);

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const flattened: DialogueNode[] = [];
  for (const block of blocks) {
    for (const nodeId of block.nodeIds) {
      const node = nodeById.get(nodeId);
      if (node) flattened.push(node);
    }
  }
  return flattened;
}

export function getDialogueTypeById(
  project: Project | null | undefined,
  dialogueTypeId: string | null | undefined,
): DialogueType | undefined {
  if (!project || !dialogueTypeId) return undefined;
  return project.dialogueTypes?.find((dialogueType) => dialogueType.id === dialogueTypeId);
}

export function resolveDialogueContextType(
  project: Project | null | undefined,
  dialogue: DialogueDocument | null | undefined,
  scriptContextTypes: ScriptContextType[],
): ScriptContextType | undefined {
  const dialogueType = getDialogueTypeById(project, dialogue?.dialogueTypeId);
  const contextTypeId = dialogueType?.contextTypeId || project?.defaultDialogueContextTypeId;
  if (!contextTypeId) return undefined;
  return scriptContextTypes.find((context) => context.id === contextTypeId);
}

// Unused in current code but exported to avoid re-importing ScriptContextType elsewhere
export type { ScriptContextType };
