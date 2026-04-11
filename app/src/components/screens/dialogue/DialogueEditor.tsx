import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Select,
  Switch,
  Text,
  Textarea,
  VStack,
  useDisclosure,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon, EditIcon, WarningIcon } from '@chakra-ui/icons';
import { LuaScriptEditor } from '../scripting/LuaScriptEditor';
import { useEditorStore } from '../../../store/useEditorStore';
import {
  DialogueChoiceNode,
  DialogueChoiceOption,
  DialogueDocument,
  DialogueI18nExport,
  DialogueIndex,
  DialogueListEntry,
  DialogueNode,
  DialogueNodeEditorMeta,
  DialogueNodeType,
  ScriptContextType,
} from '../../../types/schema';
import { fileSystem } from '../../../lib/fileSystem';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { InspectorEmptyState, InspectorPanel } from '../common';
import { ConditionEditor } from '../scripting/ConditionEditor';
import { EditorModal } from '../../common/EditorModal';
import { validateLuaChunk } from '../../../lib/luaRunner';

const BRANCH_COLORS = ['#7c5cff', '#34d399', '#60a5fa', '#f59e0b', '#ef4444', '#a78bfa'];

type DialogueTab = 'timeline' | 'characters' | 'settings';

type MetadataDraft = {
  name: string;
  oneShot: boolean;
  entryCondition: string;
};

type ActionLuaValidation = {
  ok: boolean;
  error?: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function createDefaultDialogueIndex(): DialogueIndex {
  return {
    version: 1,
    categories: [],
    customActors: [],
    dialogues: [],
  };
}

function nextDialogueId(index: DialogueIndex): string {
  const max = index.dialogues.reduce((acc, entry) => {
    const match = /^dlg_(\d+)$/.exec(entry.id);
    if (!match) return acc;
    return Math.max(acc, Number(match[1]));
  }, 0);
  return `dlg_${max + 1}`;
}

function nextNodeId(nodes: DialogueNode[]): string {
  const max = nodes.reduce((acc, node) => {
    const match = /^n(\d+)$/.exec(node.id);
    if (!match) return acc;
    return Math.max(acc, Number(match[1]));
  }, 0);
  return `n${max + 1}`;
}

function nextOptionId(options: DialogueChoiceOption[]): string {
  const max = options.reduce((acc, option) => {
    const match = /^o(\d+)$/.exec(option.id);
    if (!match) return acc;
    return Math.max(acc, Number(match[1]));
  }, 0);
  return `o${max + 1}`;
}

function suggestMsgKey(dialogueId: string, nodes: DialogueNode[], suffix = ''): string {
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

function parseTags(tagsText: string): string[] {
  return tagsText
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function branchColor(branchOrder?: number): string {
  if (branchOrder === undefined || branchOrder < 0) return '#7c5cff';
  return BRANCH_COLORS[branchOrder % BRANCH_COLORS.length];
}

function isBranchNode(node: DialogueNode): boolean {
  return Boolean(node.editor?.parentChoiceNodeId);
}

function isNavigable(node: DialogueNode): boolean {
  return node.type !== 'comment';
}

function normalizeDialogueIndex(raw: unknown): DialogueIndex {
  if (!raw || typeof raw !== 'object') return createDefaultDialogueIndex();
  const value = raw as Partial<DialogueIndex>;

  return {
    version: value.version ?? 1,
    defaultContextTypeId: value.defaultContextTypeId,
    categories: Array.isArray(value.categories) ? value.categories : [],
    customActors: Array.isArray(value.customActors) ? value.customActors : [],
    dialogues: Array.isArray(value.dialogues)
      ? value.dialogues.map((entry) => ({
          id: entry.id,
          name: entry.name,
          oneShot: (entry as DialogueListEntry).oneShot ?? false,
          nodeCount: (entry as DialogueListEntry).nodeCount ?? 0,
          tags: Array.isArray(entry.tags) ? entry.tags : [],
          updatedAt: entry.updatedAt ?? nowIso(),
        }))
      : [],
  };
}

function createEmptyDialogue(
  id: string,
  name: string,
  oneShot: boolean,
  entryCondition: string,
): DialogueDocument {
  const firstNodeId = 'n1';
  return {
    version: 1,
    id,
    name,
    oneShot,
    entryCondition: entryCondition.trim() || undefined,
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

function normalizeNode(node: unknown, fallbackId: string): DialogueNode | null {
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

function migrateFromStepTransitionModel(
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
    entryCondition: undefined,
    startNodeId,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    createdAt: typeof raw.createdAt === 'string' ? (raw.createdAt as string) : nowIso(),
    updatedAt: typeof raw.updatedAt === 'string' ? (raw.updatedAt as string) : nowIso(),
    nodes,
  };
}

function normalizeDialogueDocument(raw: unknown, fallbackId: string): DialogueDocument {
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

    let startNodeId =
      typeof value.startNodeId === 'string'
        ? (value.startNodeId as string)
        : typeof value.entryStepId === 'string'
          ? (value.entryStepId as string)
          : safeNodes[0].id;

    if (!nodeSet.has(startNodeId)) {
      startNodeId = safeNodes[0].id;
    }

    return {
      version: typeof value.version === 'number' ? (value.version as number) : 1,
      id: typeof value.id === 'string' ? (value.id as string) : fallbackId,
      name: typeof value.name === 'string' ? (value.name as string) : 'Dialogue',
      oneShot: typeof value.oneShot === 'boolean' ? (value.oneShot as boolean) : false,
      entryCondition:
        typeof value.entryCondition === 'string' && value.entryCondition.trim()
          ? (value.entryCondition as string)
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

function getDialogueEntry(dialogue: DialogueDocument): DialogueListEntry {
  return {
    id: dialogue.id,
    name: dialogue.name,
    oneShot: dialogue.oneShot,
    nodeCount: dialogue.nodes.filter((node) => node.type !== 'comment').length,
    tags: dialogue.tags,
    updatedAt: dialogue.updatedAt,
  };
}

function upsertDialogueEntry(index: DialogueIndex, dialogue: DialogueDocument): DialogueIndex {
  const entry = getDialogueEntry(dialogue);
  const exists = index.dialogues.some((item) => item.id === dialogue.id);

  if (exists) {
    return {
      ...index,
      dialogues: index.dialogues.map((item) => (item.id === dialogue.id ? entry : item)),
    };
  }

  return {
    ...index,
    dialogues: [...index.dialogues, entry],
  };
}

function buildI18nExport(dialogue: DialogueDocument): DialogueI18nExport {
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

function toRuntimeDialogue(dialogue: DialogueDocument): DialogueDocument {
  const nodes = dialogue.nodes.filter((node) => node.type !== 'comment');
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
      return {
        ...node,
        editor: undefined,
        targetNodeId: nodeIdSet.has(node.targetNodeId) ? node.targetNodeId : node.targetNodeId,
      };
    }

    return {
      ...node,
      editor: undefined,
    };
  });

  const fallbackStartNodeId = sanitizedNodes[0]?.id ?? dialogue.startNodeId;
  const startNodeId = nodeIdSet.has(dialogue.startNodeId)
    ? dialogue.startNodeId
    : fallbackStartNodeId;

  return {
    ...dialogue,
    startNodeId,
    nodes: sanitizedNodes,
  };
}

function getDuplicateMsgKeys(dialogue: DialogueDocument): Set<string> {
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

function getBrokenReferenceNodeIds(
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

function relinkLinearFlow(nodes: DialogueNode[]): DialogueNode[] {
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

function assignBranchMetaToNode(
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

function inferBranchForInsert(
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

function createNodeByType(
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

function removeNodesWithCleanup(
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

  const nextStart = nodeIds.has(dialogue.startNodeId)
    ? (nodes[0]?.id ?? dialogue.startNodeId)
    : dialogue.startNodeId;

  return {
    ...dialogue,
    startNodeId: nextStart,
    nodes,
  };
}

function buildNodeBlocks(nodes: DialogueNode[]): Array<{ topNodeId: string; nodeIds: string[] }> {
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

function reorderNodeBlocks(
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

export const DialogueEditor: React.FC = () => {
  const project = useEditorStore((state) => state.project);
  const actors = useEditorStore((state) => state.actors);
  const addActor = useEditorStore((state) => state.addActor);
  const updateActor = useEditorStore((state) => state.updateActor);
  const deleteActor = useEditorStore((state) => state.deleteActor);

  const gameVariables = useEditorStore((state) => state.gameVariables);
  const scriptTables = useEditorStore((state) => state.scriptTables);
  const scriptFunctions = useEditorStore((state) => state.scriptFunctions);
  const scriptNamespaces = useEditorStore((state) => state.scriptNamespaces);
  const scriptContextTypes = useEditorStore((state) => state.scriptContextTypes);

  const [activeTab, setActiveTab] = useState<DialogueTab>('timeline');
  const [search, setSearch] = useState('');
  const [dialogueIndex, setDialogueIndex] = useState<DialogueIndex>(createDefaultDialogueIndex());
  const [dialogues, setDialogues] = useState<Map<string, DialogueDocument>>(new Map());
  const [selectedDialogueId, setSelectedDialogueId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedActionNodeIds, setExpandedActionNodeIds] = useState<Set<string>>(new Set());
  const [draggedTopNodeId, setDraggedTopNodeId] = useState<string | null>(null);
  const [hoveredGapIndex, setHoveredGapIndex] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isTimelineHeaderCollapsed, setIsTimelineHeaderCollapsed] = useState(false);

  const [actionLuaValidation, setActionLuaValidation] = useState<ActionLuaValidation | null>(null);

  const metaModal = useDisclosure();
  const [metaMode, setMetaMode] = useState<'create' | 'edit'>('create');
  const [metadataDraft, setMetadataDraft] = useState<MetadataDraft>({
    name: '',
    oneShot: false,
    entryCondition: '',
  });

  const [newActorName, setNewActorName] = useState('');
  const [newActorId, setNewActorId] = useState('');
  const [newActorIcon, setNewActorIcon] = useState('U');
  const [newActorEmotions, setNewActorEmotions] = useState('neutral');

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyDialogueIdsRef = useRef<Set<string>>(new Set());
  const dialoguesRef = useRef(dialogues);
  const dialogueIndexRef = useRef(dialogueIndex);

  useEffect(() => {
    dialoguesRef.current = dialogues;
  }, [dialogues]);

  useEffect(() => {
    dialogueIndexRef.current = dialogueIndex;
  }, [dialogueIndex]);

  const selectedDialogue = selectedDialogueId ? (dialogues.get(selectedDialogueId) ?? null) : null;
  const selectedNode = selectedDialogue?.nodes.find((node) => node.id === selectedNodeId) ?? null;

  const duplicateMsgKeys = useMemo(
    () => (selectedDialogue ? getDuplicateMsgKeys(selectedDialogue) : new Set<string>()),
    [selectedDialogue],
  );

  const brokenReferenceNodeIds = useMemo(
    () =>
      selectedDialogue ? getBrokenReferenceNodeIds(selectedDialogue, dialogues) : new Set<string>(),
    [dialogues, selectedDialogue],
  );

  const activeContextType: ScriptContextType | undefined = useMemo(() => {
    if (!dialogueIndex.defaultContextTypeId) return undefined;
    return scriptContextTypes.find((context) => context.id === dialogueIndex.defaultContextTypeId);
  }, [dialogueIndex.defaultContextTypeId, scriptContextTypes]);

  const flushSavesNow = useCallback(async () => {
    if (!project) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const dirtyIds = Array.from(dirtyDialogueIdsRef.current);

    await fileSystem.saveJson('dialogues', 'dialogues.index.json', {
      $schema: '../../schemas/dialogue-index.schema.json',
      ...dialogueIndexRef.current,
    });

    for (const dialogueId of dirtyIds) {
      const dialogue = dialoguesRef.current.get(dialogueId);
      if (!dialogue) continue;

      await fileSystem.saveJson('dialogues', `${dialogue.id}.dialogue.json`, {
        $schema: '../../schemas/dialogue.schema.json',
        ...dialogue,
      });

      await fileSystem.saveJson('dialogues', `${dialogue.id}.runtime.dialogue.json`, {
        ...toRuntimeDialogue(dialogue),
      });

      await fileSystem.saveJson('dialogues', `${dialogue.id}.i18n.json`, buildI18nExport(dialogue));
    }

    dirtyDialogueIdsRef.current.clear();
    setIsDirty(false);
  }, [project]);

  const queueSave = useCallback(
    (dialogueId?: string) => {
      if (!project) return;
      if (dialogueId) dirtyDialogueIdsRef.current.add(dialogueId);
      setIsDirty(true);

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        flushSavesNow().catch((error) => {
          console.error('Failed to save dialogue changes:', error);
        });
      }, 700);
    },
    [flushSavesNow, project],
  );

  useEffect(() => {
    const onWindowBlur = () => {
      flushSavesNow().catch((error) => {
        console.error('Failed to flush dialogue saves on blur:', error);
      });
    };

    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [flushSavesNow]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!project) {
        if (!cancelled) {
          setDialogueIndex(createDefaultDialogueIndex());
          setDialogues(new Map());
          setSelectedDialogueId(null);
          setSelectedNodeId(null);
          setIsDirty(false);
          dirtyDialogueIdsRef.current.clear();
        }
        return;
      }

      const loadedIndex = normalizeDialogueIndex(await fileSystem.readDialogueIndex());
      const ids = loadedIndex.dialogues.map((entry) => entry.id);
      const rawDialogues = await fileSystem.loadDialoguesByIds(ids);

      const normalizedDialogues = rawDialogues.map((rawDialogue, index) => {
        const fallbackId = ids[index] ?? nextDialogueId(loadedIndex);
        return normalizeDialogueDocument(rawDialogue, fallbackId);
      });

      const map = new Map(normalizedDialogues.map((dialogue) => [dialogue.id, dialogue]));
      const syncedIndex: DialogueIndex = {
        ...loadedIndex,
        dialogues: normalizedDialogues.map((dialogue) => getDialogueEntry(dialogue)),
      };

      if (cancelled) return;
      setDialogueIndex(syncedIndex);
      setDialogues(map);
      setSelectedDialogueId(normalizedDialogues[0]?.id ?? null);
      setSelectedNodeId(normalizedDialogues[0]?.startNodeId ?? null);
      setIsDirty(false);
      dirtyDialogueIdsRef.current.clear();
    };

    load().catch((error) => {
      console.error('Failed to load dialogues:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [project]);

  useEffect(() => {
    if (!selectedDialogue || !selectedNode || selectedNode.type !== 'action') {
      setActionLuaValidation(null);
      return;
    }

    const timeout = setTimeout(() => {
      setActionLuaValidation(validateLuaChunk(selectedNode.lua));
    }, 800);

    return () => {
      clearTimeout(timeout);
    };
  }, [selectedDialogue, selectedNode]);

  useEffect(() => {
    if (!selectedDialogue) {
      setSelectedNodeId(null);
      return;
    }

    const stillExists = selectedNodeId
      ? selectedDialogue.nodes.some((node) => node.id === selectedNodeId)
      : false;

    if (!stillExists) {
      setSelectedNodeId(selectedDialogue.startNodeId);
    }
  }, [selectedDialogue, selectedNodeId]);

  // Delete selected node on Delete / Backspace when focus is on the timeline (not an input)
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const tag = (event.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (event.target as HTMLElement).isContentEditable)
        return;
      if (!selectedNodeId) return;
      removeSelectedNode();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, selectedDialogueId]);

  const dialogueItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return dialogueIndex.dialogues
      .filter((entry) => (term ? entry.name.toLowerCase().includes(term) : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [dialogueIndex.dialogues, search]);

  const dialogueNodeTargets = useMemo(
    () =>
      selectedDialogue
        ? selectedDialogue.nodes.filter((node) => node.type !== 'comment').map((node) => node.id)
        : [],
    [selectedDialogue],
  );

  const updateDialogue = useCallback(
    (dialogueId: string, updater: (dialogue: DialogueDocument) => DialogueDocument) => {
      setDialogues((previous) => {
        const current = previous.get(dialogueId);
        if (!current) return previous;

        const updated = {
          ...updater(current),
          updatedAt: nowIso(),
        };

        const next = new Map(previous);
        next.set(dialogueId, updated);
        dialoguesRef.current = next;
        return next;
      });

      setDialogueIndex((previous) => {
        const dialogue = dialoguesRef.current.get(dialogueId);
        if (!dialogue) return previous;
        const updated = upsertDialogueEntry(previous, dialogue);
        dialogueIndexRef.current = updated;
        return updated;
      });

      queueSave(dialogueId);
    },
    [queueSave],
  );

  const openCreateDialogueModal = () => {
    setMetaMode('create');
    setMetadataDraft({
      name: 'New Dialogue',
      oneShot: false,
      entryCondition: '',
    });
    metaModal.onOpen();
  };

  const openEditDialogueModal = (dialogueId: string) => {
    const dialogue = dialogues.get(dialogueId);
    if (!dialogue) return;

    setMetaMode('edit');
    setMetadataDraft({
      name: dialogue.name,
      oneShot: dialogue.oneShot,
      entryCondition: dialogue.entryCondition ?? '',
    });
    setSelectedDialogueId(dialogue.id);
    metaModal.onOpen();
  };

  const applyDialogueMetadata = () => {
    const name = metadataDraft.name.trim();
    if (!name) return;

    if (metaMode === 'create') {
      const derived = slugify(name);
      const id = derived ? `dlg_${derived}` : nextDialogueId(dialogueIndex);
      const uniqueId = dialogues.has(id) ? nextDialogueId(dialogueIndex) : id;
      const dialogue = createEmptyDialogue(
        uniqueId,
        name,
        metadataDraft.oneShot,
        metadataDraft.entryCondition,
      );

      setDialogues((previous) => {
        const next = new Map(previous);
        next.set(dialogue.id, dialogue);
        dialoguesRef.current = next;
        return next;
      });

      setDialogueIndex((previous) => {
        const next = upsertDialogueEntry(previous, dialogue);
        dialogueIndexRef.current = next;
        return next;
      });

      setSelectedDialogueId(dialogue.id);
      setSelectedNodeId(dialogue.startNodeId);
      queueSave(dialogue.id);
      metaModal.onClose();
      return;
    }

    if (!selectedDialogueId) return;
    updateDialogue(selectedDialogueId, (dialogue) => ({
      ...dialogue,
      name,
      oneShot: metadataDraft.oneShot,
      entryCondition: metadataDraft.entryCondition.trim() || undefined,
    }));
    metaModal.onClose();
  };

  const removeDialogue = async (dialogueId: string) => {
    if (!dialogues.has(dialogueId)) return;

    setDialogues((previous) => {
      const next = new Map(previous);
      next.delete(dialogueId);
      dialoguesRef.current = next;
      return next;
    });

    setDialogueIndex((previous) => {
      const next = {
        ...previous,
        dialogues: previous.dialogues.filter((entry) => entry.id !== dialogueId),
      };
      dialogueIndexRef.current = next;
      return next;
    });

    await fileSystem.deleteJson('dialogues', `${dialogueId}.dialogue.json`);
    await fileSystem.deleteJson('dialogues', `${dialogueId}.runtime.dialogue.json`);
    await fileSystem.deleteJson('dialogues', `${dialogueId}.i18n.json`);

    const fallbackId = dialogueIndexRef.current.dialogues[0]?.id ?? null;
    setSelectedDialogueId((current) => (current === dialogueId ? fallbackId : current));
    setSelectedNodeId(null);
    queueSave();
  };

  const insertNode = (nodeType: DialogueNodeType, index: number) => {
    if (!selectedDialogueId || !selectedDialogue) return;

    updateDialogue(selectedDialogueId, (dialogue) => {
      const branchMeta = inferBranchForInsert(dialogue.nodes, index);
      const created = createNodeByType(nodeType, dialogue, branchMeta);
      const nextNodes = [...dialogue.nodes];
      nextNodes.splice(index, 0, created);
      const relinked = relinkLinearFlow(nextNodes);

      const nextStartNodeId = dialogue.startNodeId || created.id;
      return {
        ...dialogue,
        startNodeId: nextStartNodeId,
        nodes: relinked,
      };
    });

    const nextDialogue = dialoguesRef.current.get(selectedDialogueId);
    const insertedNodeId = nextDialogue ? nextDialogue.nodes[index]?.id : null;
    if (insertedNodeId) {
      setSelectedNodeId(insertedNodeId);
    }
  };

  const updateSelectedNode = (updater: (node: DialogueNode) => DialogueNode) => {
    if (!selectedDialogueId || !selectedNodeId) return;

    updateDialogue(selectedDialogueId, (dialogue) => ({
      ...dialogue,
      nodes: dialogue.nodes.map((node) => (node.id === selectedNodeId ? updater(node) : node)),
    }));
  };

  const removeSelectedNode = () => {
    if (!selectedDialogueId || !selectedNode) return;

    updateDialogue(selectedDialogueId, (dialogue) => {
      const removeIds = new Set<string>([selectedNode.id]);
      if (selectedNode.type === 'choice') {
        for (const node of dialogue.nodes) {
          if (node.editor?.parentChoiceNodeId === selectedNode.id) {
            removeIds.add(node.id);
          }
        }
      }

      const cleaned = removeNodesWithCleanup(dialogue, removeIds);
      return {
        ...cleaned,
        nodes: relinkLinearFlow(cleaned.nodes),
      };
    });

    setSelectedNodeId(null);
  };

  const updateChoiceOption = (
    choiceNodeId: string,
    optionId: string,
    updater: (option: DialogueChoiceOption) => DialogueChoiceOption,
  ) => {
    if (!selectedDialogueId) return;

    updateDialogue(selectedDialogueId, (dialogue) => {
      const nextNodes = dialogue.nodes.map((node) => {
        if (node.id !== choiceNodeId || node.type !== 'choice') return node;
        return {
          ...node,
          options: node.options.map((option) =>
            option.id === optionId ? updater(option) : option,
          ),
        };
      });

      return {
        ...dialogue,
        nodes: nextNodes,
      };
    });
  };

  const moveChoiceOption = (choiceNode: DialogueChoiceNode, from: number, direction: -1 | 1) => {
    if (!selectedDialogueId) return;

    const to = from + direction;
    if (to < 0 || to >= choiceNode.options.length) return;

    updateDialogue(selectedDialogueId, (dialogue) => {
      return {
        ...dialogue,
        nodes: dialogue.nodes.map((node) => {
          if (node.id !== choiceNode.id || node.type !== 'choice') return node;
          const options = [...node.options];
          const [picked] = options.splice(from, 1);
          options.splice(to, 0, picked);
          return { ...node, options };
        }),
      };
    });
  };

  const onDropTopLevelNode = (targetTopNodeId: string | null) => {
    if (!selectedDialogueId || !draggedTopNodeId) return;

    updateDialogue(selectedDialogueId, (dialogue) => {
      const reordered = reorderNodeBlocks(dialogue.nodes, draggedTopNodeId, targetTopNodeId);
      return {
        ...dialogue,
        nodes: relinkLinearFlow(reordered),
      };
    });

    setDraggedTopNodeId(null);
  };

  const createActorFromTab = async () => {
    const trimmedName = newActorName.trim();
    if (!trimmedName) return;

    const derived = newActorId.trim() || slugify(trimmedName);
    if (!derived) return;
    if (actors.some((actor) => actor.id === derived)) return;

    await addActor({
      id: derived,
      name: trimmedName,
      icon: newActorIcon || 'U',
      emotions: parseTags(newActorEmotions),
    });

    setNewActorName('');
    setNewActorId('');
    setNewActorIcon('U');
    setNewActorEmotions('neutral');
  };

  const leftPanel = (
    <VStack align="stretch" spacing={0} h="full" bg="#17171c">
      <Flex
        h="40px"
        px={3}
        align="center"
        justify="space-between"
        borderBottom="1px"
        borderColor="whiteAlpha.200"
      >
        <Text fontSize="11px" color="gray.500" textTransform="uppercase" letterSpacing="0.08em">
          Dialogues
        </Text>
        <IconButton
          aria-label="Create dialogue"
          icon={<AddIcon fontSize="10px" />}
          size="xs"
          variant="ghost"
          color="gray.400"
          _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
          onClick={openCreateDialogueModal}
        />
      </Flex>

      <Box p={2} borderBottom="1px" borderColor="whiteAlpha.200">
        <Input
          size="xs"
          value={search}
          placeholder="Filter..."
          onChange={(event) => setSearch(event.target.value)}
          bg="#222228"
          borderColor="#333"
          color="gray.100"
        />
      </Box>

      <VStack align="stretch" spacing={0} p={1} flex={1} overflowY="auto">
        {dialogueItems.map((entry) => {
          const isSelected = selectedDialogueId === entry.id;
          return (
            <Box
              key={entry.id}
              px={3}
              py={2}
              role="group"
              cursor="pointer"
              borderLeft="2px solid"
              borderLeftColor={isSelected ? '#6c63ff' : 'transparent'}
              bg={isSelected ? '#1e1e2e' : 'transparent'}
              _hover={{ bg: '#1e1e24' }}
              onClick={() => {
                setSelectedDialogueId(entry.id);
                const dialogue = dialogues.get(entry.id);
                setSelectedNodeId(dialogue?.startNodeId ?? null);
              }}
            >
              <Flex align="center" gap={2}>
                <Box flex={1} minW={0}>
                  <Text fontSize="12px" color={isSelected ? '#a89fff' : 'gray.100'} noOfLines={1}>
                    {entry.name}
                  </Text>
                  <HStack spacing={2} mt="2px">
                    <Badge
                      fontSize="9px"
                      colorScheme={entry.oneShot ? 'purple' : 'green'}
                      variant="subtle"
                    >
                      {entry.oneShot ? 'one-shot' : 'repeatable'}
                    </Badge>
                    <Text fontSize="10px" color="gray.500">
                      {entry.nodeCount} nodes
                    </Text>
                  </HStack>
                </Box>

                <HStack spacing={1} opacity={0} _groupHover={{ opacity: 1 }}>
                  <IconButton
                    aria-label="Rename dialogue"
                    icon={<EditIcon fontSize="10px" />}
                    size="xs"
                    variant="ghost"
                    color="gray.400"
                    _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
                    onClick={(event) => {
                      event.stopPropagation();
                      openEditDialogueModal(entry.id);
                    }}
                  />
                  <IconButton
                    aria-label="Delete dialogue"
                    icon={<DeleteIcon fontSize="10px" />}
                    size="xs"
                    variant="ghost"
                    color="gray.400"
                    _hover={{ color: 'red.300', bg: 'whiteAlpha.100' }}
                    onClick={async (event) => {
                      event.stopPropagation();
                      if (confirm(`Delete dialogue "${entry.name}"?`)) {
                        await removeDialogue(entry.id);
                      }
                    }}
                  />
                </HStack>
              </Flex>
            </Box>
          );
        })}

        {dialogueItems.length === 0 && (
          <Text fontSize="xs" color="gray.600" textAlign="center" mt={4}>
            No dialogues yet
          </Text>
        )}
      </VStack>
    </VStack>
  );

  const NODE_TYPES: Array<[DialogueNodeType, string]> = [
    ['line', 'Line'],
    ['choice', 'Choice'],
    ['action', 'Action'],
    ['jump', 'Jump'],
    ['comment', 'Comment'],
    ['end', 'End'],
  ];

  const rightPanel = (
    <InspectorPanel
      title={selectedDialogue?.name || 'Dialogue'}
      subtitle={selectedDialogue ? selectedDialogue.id : undefined}
      emptyState={
        <InspectorEmptyState
          icon="D"
          message="No dialogue selected"
          hint="Create or pick a dialogue"
        />
      }
    >
      {!selectedDialogue && null}

      {selectedDialogue && !selectedNode && (
        <VStack align="stretch" spacing={4}>
          <Text fontSize="10px" color="gray.500" textTransform="uppercase" fontWeight="bold">
            Dialogue Metadata
          </Text>

          <FormControl>
            <FormLabel fontSize="10px" color="gray.500" textTransform="uppercase" mb={1}>
              Name
            </FormLabel>
            <Input
              size="xs"
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              value={selectedDialogue.name}
              onChange={(event) =>
                updateDialogue(selectedDialogue.id, (dialogue) => ({
                  ...dialogue,
                  name: event.target.value,
                }))
              }
            />
          </FormControl>

          <FormControl display="flex" alignItems="center" justifyContent="space-between">
            <FormLabel fontSize="10px" color="gray.500" textTransform="uppercase" mb={0}>
              One-shot
            </FormLabel>
            <Switch
              size="sm"
              isChecked={selectedDialogue.oneShot}
              onChange={(event) =>
                updateDialogue(selectedDialogue.id, (dialogue) => ({
                  ...dialogue,
                  oneShot: event.target.checked,
                }))
              }
            />
          </FormControl>

          <FormControl>
            <FormLabel fontSize="10px" color="gray.500" textTransform="uppercase" mb={1}>
              Tags (comma separated)
            </FormLabel>
            <Input
              size="xs"
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              value={selectedDialogue.tags.join(', ')}
              onChange={(event) =>
                updateDialogue(selectedDialogue.id, (dialogue) => ({
                  ...dialogue,
                  tags: parseTags(event.target.value),
                }))
              }
            />
          </FormControl>

          <Text fontSize="10px" color="gray.500" textTransform="uppercase" fontWeight="bold">
            Entry Condition (Lua)
          </Text>

          <ConditionEditor
            value={selectedDialogue.entryCondition ?? ''}
            onChange={(expr) =>
              updateDialogue(selectedDialogue.id, (dialogue) => ({
                ...dialogue,
                entryCondition: expr.trim() ? expr : undefined,
              }))
            }
            variables={gameVariables}
            tables={scriptTables}
            functions={scriptFunctions}
            namespaces={scriptNamespaces}
            activeContextType={activeContextType}
          />
        </VStack>
      )}

      {selectedDialogue && selectedNode?.type === 'line' && (
        <VStack align="stretch" spacing={3}>
          <Badge colorScheme="blue" w="fit-content">
            line
          </Badge>

          <FormControl>
            <FormLabel fontSize="10px" color="gray.500" textTransform="uppercase" mb={1}>
              Speaker
            </FormLabel>
            <Select
              size="xs"
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              value={selectedNode.speaker ?? ''}
              onChange={(event) => {
                const actorId = event.target.value || undefined;
                const actor = actors.find((item) => item.id === actorId);
                updateSelectedNode((node) => {
                  if (node.type !== 'line') return node;
                  return {
                    ...node,
                    speaker: actorId,
                    emotion: actor?.emotions?.[0] ?? undefined,
                  };
                });
              }}
            >
              <option value="" style={{ background: '#0a0a0b' }}>
                Narrator
              </option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id} style={{ background: '#0a0a0b' }}>
                  {actor.name}
                </option>
              ))}
            </Select>
          </FormControl>

          <FormControl>
            <FormLabel fontSize="10px" color="gray.500" textTransform="uppercase" mb={1}>
              Emotion
            </FormLabel>
            <Select
              size="xs"
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              value={selectedNode.emotion ?? ''}
              onChange={(event) =>
                updateSelectedNode((node) => {
                  if (node.type !== 'line') return node;
                  return {
                    ...node,
                    emotion: event.target.value || undefined,
                  };
                })
              }
            >
              <option value="" style={{ background: '#0a0a0b' }}>
                None
              </option>
              {(actors.find((actor) => actor.id === selectedNode.speaker)?.emotions ?? []).map(
                (emotion) => (
                  <option key={emotion} value={emotion} style={{ background: '#0a0a0b' }}>
                    {emotion}
                  </option>
                ),
              )}
            </Select>
          </FormControl>

          <FormControl>
            <FormLabel fontSize="10px" color="gray.500" textTransform="uppercase" mb={1}>
              Message Key
            </FormLabel>
            <Input
              size="xs"
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              value={selectedNode.msgKey}
              onChange={(event) =>
                updateSelectedNode((node) => {
                  if (node.type !== 'line') return node;
                  return { ...node, msgKey: event.target.value };
                })
              }
            />
            {duplicateMsgKeys.has(selectedNode.msgKey.trim()) && selectedNode.msgKey.trim() && (
              <Text fontSize="10px" color="orange.300" mt={1}>
                Duplicate msgKey in this dialogue.
              </Text>
            )}
          </FormControl>

          <FormControl>
            <FormLabel fontSize="10px" color="gray.500" textTransform="uppercase" mb={1}>
              Text
            </FormLabel>
            <Textarea
              minH="110px"
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              value={selectedNode.text}
              onChange={(event) =>
                updateSelectedNode((node) => {
                  if (node.type !== 'line') return node;
                  return { ...node, text: event.target.value };
                })
              }
            />
            <Text fontSize="10px" color="gray.500" mt={1}>
              Interpolation tokens: [variable_path]
            </Text>
          </FormControl>

          <Button size="xs" colorScheme="red" variant="outline" onClick={removeSelectedNode}>
            Delete Node
          </Button>
        </VStack>
      )}

      {selectedDialogue && selectedNode?.type === 'choice' && (
        <VStack align="stretch" spacing={3}>
          <Badge colorScheme="purple" w="fit-content">
            choice
          </Badge>

          {selectedNode.options.map((option, index) => {
            const currentBranchId = `${selectedNode.id}:${option.id}`;
            return (
              <Box
                key={option.id}
                p={2}
                border="1px"
                borderColor="whiteAlpha.200"
                borderRadius="md"
              >
                <HStack justify="space-between" mb={2}>
                  <Text fontSize="11px" color="gray.200">
                    Option {index + 1}
                  </Text>
                  <HStack spacing={1}>
                    <IconButton
                      aria-label="Move option up"
                      size="xs"
                      icon={<Text fontSize="10px">^</Text>}
                      onClick={() => moveChoiceOption(selectedNode, index, -1)}
                    />
                    <IconButton
                      aria-label="Move option down"
                      size="xs"
                      icon={<Text fontSize="10px">v</Text>}
                      onClick={() => moveChoiceOption(selectedNode, index, 1)}
                    />
                    <IconButton
                      aria-label="Delete option"
                      size="xs"
                      colorScheme="red"
                      icon={<DeleteIcon fontSize="10px" />}
                      onClick={() => {
                        updateDialogue(selectedDialogue.id, (dialogue) => ({
                          ...dialogue,
                          nodes: dialogue.nodes.map((node) => {
                            if (node.id !== selectedNode.id || node.type !== 'choice') return node;
                            if (node.options.length <= 1) return node;
                            return {
                              ...node,
                              options: node.options.filter((item) => item.id !== option.id),
                            };
                          }),
                        }));
                      }}
                    />
                  </HStack>
                </HStack>

                <VStack align="stretch" spacing={2}>
                  <Input
                    size="xs"
                    bg="#0a0a0b"
                    borderColor="#1a1a2e"
                    color="white"
                    value={option.text}
                    onChange={(event) =>
                      updateChoiceOption(selectedNode.id, option.id, (item) => ({
                        ...item,
                        text: event.target.value,
                      }))
                    }
                    placeholder="Option text"
                  />

                  <Input
                    size="xs"
                    bg="#0a0a0b"
                    borderColor="#1a1a2e"
                    color="white"
                    value={option.msgKey}
                    onChange={(event) =>
                      updateChoiceOption(selectedNode.id, option.id, (item) => ({
                        ...item,
                        msgKey: event.target.value,
                      }))
                    }
                    placeholder="msgKey"
                  />
                  {duplicateMsgKeys.has(option.msgKey.trim()) && option.msgKey.trim() && (
                    <Text fontSize="10px" color="orange.300">
                      Duplicate msgKey in this dialogue.
                    </Text>
                  )}

                  <Input
                    size="xs"
                    bg="#0a0a0b"
                    borderColor="#1a1a2e"
                    color="white"
                    value={option.condition ?? ''}
                    onChange={(event) =>
                      updateChoiceOption(selectedNode.id, option.id, (item) => ({
                        ...item,
                        condition: event.target.value || null,
                      }))
                    }
                    placeholder="condition (optional Lua)"
                  />

                  <Select
                    size="xs"
                    bg="#0a0a0b"
                    borderColor="#1a1a2e"
                    color="white"
                    value={option.targetNodeId}
                    onChange={(event) => {
                      const targetNodeId = event.target.value;
                      updateChoiceOption(selectedNode.id, option.id, (item) => ({
                        ...item,
                        targetNodeId,
                      }));

                      updateDialogue(selectedDialogue.id, (dialogue) => ({
                        ...dialogue,
                        nodes: assignBranchMetaToNode(dialogue.nodes, targetNodeId, {
                          branchId: currentBranchId,
                          parentChoiceNodeId: selectedNode.id,
                          parentOptionId: option.id,
                          branchOrder: index,
                        }),
                      }));
                    }}
                  >
                    <option value="" style={{ background: '#0a0a0b' }}>
                      Select target node
                    </option>
                    {dialogueNodeTargets.map((nodeId) => (
                      <option key={nodeId} value={nodeId} style={{ background: '#0a0a0b' }}>
                        {nodeId}
                      </option>
                    ))}
                  </Select>
                </VStack>
              </Box>
            );
          })}

          <Button
            size="xs"
            leftIcon={<AddIcon />}
            onClick={() => {
              updateDialogue(selectedDialogue.id, (dialogue) => ({
                ...dialogue,
                nodes: dialogue.nodes.map((node) => {
                  if (node.id !== selectedNode.id || node.type !== 'choice') return node;
                  const id = nextOptionId(node.options);
                  return {
                    ...node,
                    options: [
                      ...node.options,
                      {
                        id,
                        text: `Option ${node.options.length + 1}`,
                        msgKey: suggestMsgKey(
                          dialogue.id,
                          dialogue.nodes,
                          `c${node.options.length + 1}`,
                        ),
                        condition: null,
                        targetNodeId: '',
                      },
                    ],
                  };
                }),
              }));
            }}
          >
            Add option
          </Button>

          <Button size="xs" colorScheme="red" variant="outline" onClick={removeSelectedNode}>
            Delete Node
          </Button>
        </VStack>
      )}

      {selectedDialogue && selectedNode?.type === 'action' && (
        <VStack align="stretch" spacing={3}>
          <Badge colorScheme="green" w="fit-content">
            action
          </Badge>

          <FormControl>
            <FormLabel fontSize="10px" color="gray.500" textTransform="uppercase" mb={1}>
              Lua Script
            </FormLabel>
            <Box border="1px" borderColor="#1a1a2e" borderRadius="md" overflow="hidden">
              <LuaScriptEditor
                value={selectedNode.lua}
                height="220px"
                onChange={(value) =>
                  updateSelectedNode((node) => {
                    if (node.type !== 'action') return node;
                    return { ...node, lua: value };
                  })
                }
                gameVariables={gameVariables}
                scriptTables={scriptTables}
                scriptFunctions={scriptFunctions}
                scriptNamespaces={scriptNamespaces}
                activeContextType={activeContextType}
              />
            </Box>
            <Text
              mt={1}
              fontSize="10px"
              color="orange.300"
              minH="16px"
              visibility={actionLuaValidation && !actionLuaValidation.ok ? 'visible' : 'hidden'}
            >
              {actionLuaValidation && !actionLuaValidation.ok
                ? `Lua syntax error: ${actionLuaValidation.error ?? 'Invalid chunk'}`
                : '\u00A0'}
            </Text>
          </FormControl>

          <Button size="xs" colorScheme="red" variant="outline" onClick={removeSelectedNode}>
            Delete Node
          </Button>
        </VStack>
      )}

      {selectedDialogue && selectedNode?.type === 'jump' && (
        <VStack align="stretch" spacing={3}>
          <Badge colorScheme="yellow" w="fit-content">
            jump
          </Badge>

          <FormControl>
            <FormLabel fontSize="10px" color="gray.500" textTransform="uppercase" mb={1}>
              Target Dialogue
            </FormLabel>
            <Select
              size="xs"
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              value={selectedNode.targetDialogueId ?? ''}
              onChange={(event) =>
                updateSelectedNode((node) => {
                  if (node.type !== 'jump') return node;
                  return {
                    ...node,
                    targetDialogueId: event.target.value || null,
                    targetNodeId: '',
                  };
                })
              }
            >
              <option value="" style={{ background: '#0a0a0b' }}>
                Current dialogue
              </option>
              {Array.from(dialogues.values())
                .filter((dialogue) => dialogue.id !== selectedDialogue.id)
                .map((dialogue) => (
                  <option key={dialogue.id} value={dialogue.id} style={{ background: '#0a0a0b' }}>
                    {dialogue.name}
                  </option>
                ))}
            </Select>
          </FormControl>

          <FormControl>
            <FormLabel fontSize="10px" color="gray.500" textTransform="uppercase" mb={1}>
              Target Node
            </FormLabel>
            <Select
              size="xs"
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              value={selectedNode.targetNodeId}
              onChange={(event) =>
                updateSelectedNode((node) => {
                  if (node.type !== 'jump') return node;
                  return {
                    ...node,
                    targetNodeId: event.target.value,
                  };
                })
              }
            >
              <option value="" style={{ background: '#0a0a0b' }}>
                Select target node
              </option>
              {(dialogues.get(selectedNode.targetDialogueId || selectedDialogue.id)?.nodes ?? [])
                .filter((node) => node.type !== 'comment')
                .map((node) => (
                  <option key={node.id} value={node.id} style={{ background: '#0a0a0b' }}>
                    {node.id}
                  </option>
                ))}
            </Select>
          </FormControl>

          <Button size="xs" colorScheme="red" variant="outline" onClick={removeSelectedNode}>
            Delete Node
          </Button>
        </VStack>
      )}

      {selectedDialogue && selectedNode?.type === 'comment' && (
        <VStack align="stretch" spacing={3}>
          <Badge colorScheme="gray" w="fit-content">
            comment (editor-only)
          </Badge>
          <Textarea
            minH="120px"
            bg="#0a0a0b"
            borderColor="#1a1a2e"
            color="white"
            value={selectedNode.text}
            onChange={(event) =>
              updateSelectedNode((node) => {
                if (node.type !== 'comment') return node;
                return { ...node, text: event.target.value };
              })
            }
          />
          <Button size="xs" colorScheme="red" variant="outline" onClick={removeSelectedNode}>
            Delete Node
          </Button>
        </VStack>
      )}

      {selectedDialogue && selectedNode?.type === 'end' && (
        <VStack align="stretch" spacing={3}>
          <Badge colorScheme="red" w="fit-content">
            end
          </Badge>
          <Text fontSize="12px" color="gray.400">
            Terminal node. No fields.
          </Text>
          <Button size="xs" colorScheme="red" variant="outline" onClick={removeSelectedNode}>
            Delete Node
          </Button>
        </VStack>
      )}
    </InspectorPanel>
  );

  const timelineContent = !selectedDialogue ? (
    <Box p={5}>
      <Text color="gray.400">Create a dialogue to start authoring timeline beats.</Text>
    </Box>
  ) : (
    <VStack align="stretch" spacing={0} h="full" overflow="hidden">
      <Flex
        px={4}
        py={2}
        bg="#141418"
        borderBottom="1px"
        borderColor="whiteAlpha.200"
        align="center"
        gap={2}
        minH="40px"
      >
        <Text fontSize="13px" color="gray.100" fontWeight="semibold" flexShrink={0}>
          {selectedDialogue.name}
        </Text>
        <Badge colorScheme={selectedDialogue.oneShot ? 'purple' : 'green'} flexShrink={0}>
          {selectedDialogue.oneShot ? 'one-shot' : 'repeatable'}
        </Badge>
        {!isTimelineHeaderCollapsed && selectedDialogue.entryCondition?.trim() && (
          <Badge colorScheme="orange" variant="subtle" fontFamily="mono" maxW="160px" isTruncated>
            {selectedDialogue.entryCondition}
          </Badge>
        )}
        {!isTimelineHeaderCollapsed && !!selectedDialogue.tags.length && (
          <Text fontSize="11px" color="gray.500" noOfLines={1} flexShrink={1} minW={0}>
            {selectedDialogue.tags.join(', ')}
          </Text>
        )}

        <HStack spacing={1} ml="auto" flexShrink={0}>
          {/* Add Node dropdown */}
          <Popover placement="bottom-end" isLazy>
            <PopoverTrigger>
              <Button size="xs" variant="outline" leftIcon={<AddIcon fontSize="9px" />}>
                Add Node
              </Button>
            </PopoverTrigger>
            <PopoverContent w="150px" bg="#1e1e24" borderColor="#333">
              <PopoverBody p={1}>
                <VStack align="stretch" spacing={0}>
                  {NODE_TYPES.map(([type, label]) => (
                    <Button
                      key={type}
                      size="xs"
                      variant="ghost"
                      justifyContent="flex-start"
                      fontWeight="normal"
                      onClick={() => {
                        if (!selectedDialogue) return;
                        const idx = selectedNodeId
                          ? Math.max(
                              0,
                              selectedDialogue.nodes.findIndex((n) => n.id === selectedNodeId) + 1,
                            )
                          : selectedDialogue.nodes.length;
                        insertNode(type, idx);
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </VStack>
              </PopoverBody>
            </PopoverContent>
          </Popover>

          <Button
            size="xs"
            variant="ghost"
            color="gray.500"
            onClick={() => setIsTimelineHeaderCollapsed((c) => !c)}
            title={isTimelineHeaderCollapsed ? 'Show metadata' : 'Hide metadata'}
          >
            {isTimelineHeaderCollapsed ? '▸ info' : '▾ info'}
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setSelectedNodeId(null)}>
            Metadata
          </Button>
        </HStack>
      </Flex>

      <Box flex={1} overflowY="auto" p={3}>
        {selectedDialogue.nodes.map((node, index) => {
          const topLevel = !isBranchNode(node);
          const selected = selectedNodeId === node.id;
          const missingMsgKey =
            (node.type === 'line' && !node.msgKey.trim()) ||
            (node.type === 'choice' && node.options.some((option) => !option.msgKey.trim()));
          const brokenRef = brokenReferenceNodeIds.has(node.id);
          const branchMeta = node.editor;
          const branchEnd =
            Boolean(branchMeta?.branchId) &&
            selectedDialogue.nodes[index + 1]?.editor?.branchId !== branchMeta?.branchId;

          // Per-type visual config
          const isComment = node.type === 'comment';
          const isJump = node.type === 'jump';
          const isAction = node.type === 'action';
          const isChoice = node.type === 'choice';
          const isEnd = node.type === 'end';

          const typeColor =
            node.type === 'line'
              ? '#60a5fa'
              : node.type === 'choice'
                ? '#a78bfa'
                : node.type === 'action'
                  ? '#34d399'
                  : node.type === 'jump'
                    ? '#fbbf24'
                    : node.type === 'comment'
                      ? '#6b7280'
                      : '#f87171'; // end

          const cardBg = isComment
            ? '#161618'
            : isAction
              ? '#141a14'
              : isEnd
                ? '#1a1212'
                : isJump
                  ? '#1a1a10'
                  : '#1e1e28';

          return (
            <React.Fragment key={node.id}>
              {/* Insert-gap button */}
              <Box
                onMouseEnter={() => setHoveredGapIndex(index)}
                onMouseLeave={() =>
                  setHoveredGapIndex((current) => (current === index ? null : current))
                }
                py="2px"
              >
                <Popover placement="top" isLazy>
                  <PopoverTrigger>
                    <Button
                      size="xs"
                      variant="ghost"
                      w="full"
                      h="16px"
                      opacity={hoveredGapIndex === index ? 0.55 : 0}
                      _hover={{ opacity: 1 }}
                      fontSize="10px"
                      color="gray.500"
                    >
                      + insert
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent w="150px" bg="#1e1e24" borderColor="#333">
                    <PopoverBody p={1}>
                      <VStack align="stretch" spacing={0}>
                        {NODE_TYPES.map(([type, label]) => (
                          <Button
                            key={type}
                            size="xs"
                            variant="ghost"
                            justifyContent="flex-start"
                            fontWeight="normal"
                            onClick={() => insertNode(type, index)}
                          >
                            {label}
                          </Button>
                        ))}
                      </VStack>
                    </PopoverBody>
                  </PopoverContent>
                </Popover>
              </Box>

              {/* Node card */}
              <Box
                role="group"
                draggable={topLevel}
                onDragStart={() => {
                  if (!topLevel) return;
                  setDraggedTopNodeId(node.id);
                }}
                onDragOver={(event) => {
                  if (!topLevel || !draggedTopNodeId) return;
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  if (!topLevel) return;
                  event.preventDefault();
                  onDropTopLevelNode(node.id);
                }}
                onClick={() => {
                  setSelectedNodeId(node.id);
                  if (isAction) {
                    setExpandedActionNodeIds((current) => {
                      const next = new Set(current);
                      if (next.has(node.id)) next.delete(node.id);
                      else next.add(node.id);
                      return next;
                    });
                  }
                }}
                border="1px"
                borderStyle={isComment ? 'dashed' : 'solid'}
                borderColor={selected ? '#6c63ff' : isComment ? '#333' : '#2e2e3e'}
                borderLeftWidth={branchMeta?.branchId ? '3px' : isComment ? '0px' : '3px'}
                borderLeftColor={
                  branchMeta?.branchId
                    ? branchColor(branchMeta.branchOrder)
                    : isComment
                      ? undefined
                      : typeColor
                }
                borderRadius="md"
                bg={cardBg}
                p={isComment ? 2 : 3}
                mb={isChoice ? 0 : 2}
                cursor="pointer"
                opacity={isComment ? 0.75 : 1}
                _hover={{ borderColor: selected ? '#6c63ff' : isComment ? '#555' : '#555' }}
                position="relative"
              >
                {/* Header row */}
                <Flex align="center" gap={2} mb={isComment ? 1 : 2}>
                  <Text
                    fontSize="9px"
                    fontWeight="bold"
                    textTransform="uppercase"
                    letterSpacing="0.1em"
                    color={typeColor}
                    flexShrink={0}
                  >
                    {node.type}
                  </Text>
                  <Text fontSize="10px" color="gray.600" fontFamily="mono">
                    {node.id}
                  </Text>
                  {node.id === selectedDialogue.startNodeId && (
                    <Badge colorScheme="teal" fontSize="8px">
                      start
                    </Badge>
                  )}
                  {missingMsgKey && <WarningIcon color="orange.300" boxSize="10px" />}
                  {brokenRef && (
                    <Badge colorScheme="red" fontSize="8px">
                      broken ref
                    </Badge>
                  )}

                  {/* Hover delete button */}
                  <IconButton
                    aria-label="Delete node"
                    icon={<DeleteIcon fontSize="9px" />}
                    size="xs"
                    variant="ghost"
                    color="gray.600"
                    _hover={{ color: 'red.400', bg: 'transparent' }}
                    opacity={0}
                    _groupHover={{ opacity: 1 }}
                    ml="auto"
                    h="auto"
                    minW="auto"
                    p="2px"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(node.id);
                      // Defer to next tick so selectedNodeId is set first
                      setTimeout(() => {
                        if (!selectedDialogueId) return;
                        updateDialogue(selectedDialogueId, (dialogue) => {
                          const removeIds = new Set<string>([node.id]);
                          if (node.type === 'choice') {
                            for (const n of dialogue.nodes) {
                              if (n.editor?.parentChoiceNodeId === node.id) removeIds.add(n.id);
                            }
                          }
                          const cleaned = removeNodesWithCleanup(dialogue, removeIds);
                          return { ...cleaned, nodes: relinkLinearFlow(cleaned.nodes) };
                        });
                        setSelectedNodeId(null);
                      }, 0);
                    }}
                  />
                </Flex>

                {/* Body content */}
                {node.type === 'line' && (
                  <VStack align="stretch" spacing={1}>
                    {(node.speaker || node.emotion) && (
                      <HStack spacing={2}>
                        {node.speaker && (
                          <Badge colorScheme="blue" fontSize="9px">
                            {node.speaker}
                          </Badge>
                        )}
                        {node.emotion && (
                          <Badge colorScheme="cyan" variant="subtle" fontSize="9px">
                            {node.emotion}
                          </Badge>
                        )}
                        {!!node.msgKey.trim() && (
                          <Text
                            fontSize="9px"
                            color="gray.600"
                            fontFamily="mono"
                            noOfLines={1}
                            ml="auto"
                          >
                            {node.msgKey}
                          </Text>
                        )}
                      </HStack>
                    )}
                    <Text fontSize="12px" color="gray.200" noOfLines={3} lineHeight="1.5">
                      {node.text || (
                        <Text as="span" color="gray.600" fontStyle="italic">
                          (empty line)
                        </Text>
                      )}
                    </Text>
                  </VStack>
                )}

                {isChoice && (
                  <VStack align="stretch" spacing={0} mt={1}>
                    {node.options.map((option, optIdx) => {
                      const optColor = BRANCH_COLORS[optIdx % BRANCH_COLORS.length];
                      return (
                        <Flex key={option.id} align="stretch" gap={0} mb={1}>
                          {/* Colored branch indicator */}
                          <Box
                            w="3px"
                            borderRadius="full"
                            bg={optColor}
                            flexShrink={0}
                            mr={2}
                            my="1px"
                          />
                          <Box flex={1} minW={0}>
                            <Flex align="center" gap={2}>
                              <Text fontSize="11px" color="gray.200" noOfLines={1} flex={1}>
                                {option.text || (
                                  <Text as="span" color="gray.600" fontStyle="italic">
                                    (empty)
                                  </Text>
                                )}
                              </Text>
                              {option.condition?.trim() && (
                                <Badge fontSize="8px" colorScheme="yellow" flexShrink={0}>
                                  if
                                </Badge>
                              )}
                              <Text
                                fontSize="9px"
                                color="gray.600"
                                fontFamily="mono"
                                flexShrink={0}
                              >
                                {option.targetNodeId ? (
                                  `→ ${option.targetNodeId}`
                                ) : (
                                  <Text as="span" color="red.400">
                                    no target
                                  </Text>
                                )}
                              </Text>
                            </Flex>
                          </Box>
                        </Flex>
                      );
                    })}
                  </VStack>
                )}

                {isAction && (
                  <Box
                    bg="#0d1a0d"
                    borderRadius="sm"
                    px={2}
                    py={1}
                    fontFamily="mono"
                    fontSize="11px"
                  >
                    {expandedActionNodeIds.has(node.id) ? (
                      <Text color="green.200" whiteSpace="pre-wrap" noOfLines={8}>
                        {node.lua || '(empty)'}
                      </Text>
                    ) : (
                      <Text color="green.400" noOfLines={1}>
                        {node.lua ? node.lua.split('\n')[0] : '(empty)'}
                      </Text>
                    )}
                  </Box>
                )}

                {isJump && (
                  <Flex align="center" gap={2}>
                    <Text fontSize="11px" color="yellow.300" fontFamily="mono" fontWeight="bold">
                      ⟶
                    </Text>
                    <Text fontSize="11px" color="yellow.200" fontFamily="mono">
                      {node.targetDialogueId
                        ? `${node.targetDialogueId} : ${node.targetNodeId || '?'}`
                        : node.targetNodeId || (
                            <Text as="span" color="gray.500">
                              no target
                            </Text>
                          )}
                    </Text>
                    {node.targetNodeId && !node.targetDialogueId && (
                      <Text fontSize="9px" color="gray.600" fontFamily="mono">
                        (this dialogue)
                      </Text>
                    )}
                  </Flex>
                )}

                {isComment && (
                  <Text fontSize="11px" color="gray.500" fontStyle="italic" noOfLines={3}>
                    {node.text || '(empty comment)'}
                  </Text>
                )}

                {isEnd && (
                  <Flex align="center" gap={2}>
                    <Box w="full" h="1px" bg="red.900" />
                    <Text fontSize="10px" color="red.500" flexShrink={0} fontFamily="mono">
                      END
                    </Text>
                    <Box w="full" h="1px" bg="red.900" />
                  </Flex>
                )}
              </Box>

              {/* Branch end divider */}
              {branchEnd && (
                <Box mb={2} ml={3} mr={0}>
                  <Box h="1px" bg={branchColor(branchMeta?.branchOrder)} opacity={0.3} />
                </Box>
              )}
            </React.Fragment>
          );
        })}

        <Box
          onDragOver={(event) => {
            if (!draggedTopNodeId) return;
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            onDropTopLevelNode(null);
          }}
          py="2px"
        >
          <Popover placement="top" isLazy>
            <PopoverTrigger>
              <Button
                size="xs"
                variant="ghost"
                w="full"
                h="20px"
                fontSize="10px"
                color="gray.600"
                opacity={hoveredGapIndex === selectedDialogue.nodes.length ? 0.65 : 0.2}
                onMouseEnter={() => setHoveredGapIndex(selectedDialogue.nodes.length)}
                onMouseLeave={() => setHoveredGapIndex(null)}
              >
                + append
              </Button>
            </PopoverTrigger>
            <PopoverContent w="150px" bg="#1e1e24" borderColor="#333">
              <PopoverBody p={1}>
                <VStack align="stretch" spacing={0}>
                  {NODE_TYPES.map(([type, label]) => (
                    <Button
                      key={type}
                      size="xs"
                      variant="ghost"
                      justifyContent="flex-start"
                      fontWeight="normal"
                      onClick={() => insertNode(type, selectedDialogue.nodes.length)}
                    >
                      {label}
                    </Button>
                  ))}
                </VStack>
              </PopoverBody>
            </PopoverContent>
          </Popover>
        </Box>
      </Box>
    </VStack>
  );

  const charactersContent = (
    <VStack align="stretch" spacing={3} h="full" p={4} overflowY="auto">
      <Box p={3} border="1px" borderColor="whiteAlpha.200" borderRadius="md" bg="#17171c">
        <Text fontSize="12px" color="gray.200" mb={2}>
          Add Character
        </Text>
        <VStack align="stretch" spacing={2}>
          <Input
            size="sm"
            bg="#0a0a0b"
            borderColor="#1a1a2e"
            color="white"
            placeholder="Name"
            value={newActorName}
            onChange={(event) => setNewActorName(event.target.value)}
          />
          <Input
            size="sm"
            bg="#0a0a0b"
            borderColor="#1a1a2e"
            color="white"
            placeholder="ID (optional)"
            value={newActorId}
            onChange={(event) => setNewActorId(event.target.value)}
          />
          <Input
            size="sm"
            bg="#0a0a0b"
            borderColor="#1a1a2e"
            color="white"
            placeholder="Icon"
            value={newActorIcon}
            onChange={(event) => setNewActorIcon(event.target.value)}
          />
          <Input
            size="sm"
            bg="#0a0a0b"
            borderColor="#1a1a2e"
            color="white"
            placeholder="Emotions, comma separated"
            value={newActorEmotions}
            onChange={(event) => setNewActorEmotions(event.target.value)}
          />
          <Button size="sm" onClick={createActorFromTab}>
            Add Character
          </Button>
        </VStack>
      </Box>

      {actors.map((actor) => (
        <Box
          key={actor.id}
          p={3}
          border="1px"
          borderColor="whiteAlpha.200"
          borderRadius="md"
          bg="#17171c"
        >
          <VStack align="stretch" spacing={2}>
            <HStack>
              <Input
                size="sm"
                bg="#0a0a0b"
                borderColor="#1a1a2e"
                color="white"
                value={actor.name}
                onChange={(event) => updateActor(actor.id, { name: event.target.value })}
              />
              <Input
                size="sm"
                w="70px"
                bg="#0a0a0b"
                borderColor="#1a1a2e"
                color="white"
                value={actor.icon}
                onChange={(event) => updateActor(actor.id, { icon: event.target.value })}
              />
              <Button
                size="sm"
                colorScheme="red"
                variant="outline"
                onClick={() => deleteActor(actor.id)}
              >
                Delete
              </Button>
            </HStack>
            <Text fontSize="10px" color="gray.500" fontFamily="mono">
              {actor.id}
            </Text>
            <Input
              size="sm"
              bg="#0a0a0b"
              borderColor="#1a1a2e"
              color="white"
              value={(actor.emotions ?? []).join(', ')}
              placeholder="Emotions, comma separated"
              onChange={(event) =>
                updateActor(actor.id, {
                  emotions: parseTags(event.target.value),
                })
              }
            />
          </VStack>
        </Box>
      ))}
    </VStack>
  );

  const settingsContent = (
    <VStack align="stretch" spacing={4} p={4}>
      <Box p={3} border="1px" borderColor="whiteAlpha.200" borderRadius="md" bg="#17171c">
        <Text fontSize="12px" color="gray.200" mb={2}>
          Dialogue Settings
        </Text>
        <FormControl>
          <FormLabel fontSize="10px" color="gray.500" textTransform="uppercase" mb={1}>
            Default Lua Context (`self`)
          </FormLabel>
          <Select
            size="sm"
            bg="#0a0a0b"
            borderColor="#1a1a2e"
            color="white"
            value={dialogueIndex.defaultContextTypeId ?? ''}
            onChange={(event) => {
              const next = {
                ...dialogueIndex,
                defaultContextTypeId: event.target.value || undefined,
              };
              setDialogueIndex(next);
              dialogueIndexRef.current = next;
              queueSave();
            }}
          >
            <option value="" style={{ background: '#0a0a0b' }}>
              None
            </option>
            {scriptContextTypes.map((contextType) => (
              <option key={contextType.id} value={contextType.id} style={{ background: '#0a0a0b' }}>
                {contextType.name}
              </option>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Box p={3} border="1px" borderColor="whiteAlpha.200" borderRadius="md" bg="#17171c">
        <Text fontSize="11px" color="gray.500">
          Save behavior: auto-save after edits and when editor loses focus.
        </Text>
      </Box>
    </VStack>
  );

  const centerContent =
    activeTab === 'timeline'
      ? timelineContent
      : activeTab === 'characters'
        ? charactersContent
        : settingsContent;

  const content = (
    <VStack align="stretch" spacing={0} h="full">
      <Flex
        align="center"
        gap={2}
        px={4}
        h="40px"
        bg="#141418"
        borderBottom="1px"
        borderColor="whiteAlpha.200"
      >
        <Text fontSize="12px" color="gray.500">
          {selectedDialogue ? `${selectedDialogue.id}.dlg` : 'dialogues'}
        </Text>

        <HStack spacing={1} ml={3}>
          {(
            [
              ['timeline', 'Timeline'],
              ['characters', 'Characters'],
              ['settings', 'Settings'],
            ] as Array<[DialogueTab, string]>
          ).map(([tab, label]) => (
            <Button
              key={tab}
              size="xs"
              variant={activeTab === tab ? 'solid' : 'ghost'}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </Button>
          ))}
        </HStack>

        <HStack spacing={2} ml="auto">
          {isDirty && <Badge colorScheme="orange">Unsaved</Badge>}
          <Button size="xs" variant="outline" onClick={() => flushSavesNow()}>
            Save now
          </Button>
        </HStack>
      </Flex>

      <Box flex={1} minH={0}>
        {centerContent}
      </Box>
    </VStack>
  );

  return (
    <>
      <ResizableEditorLayout
        header={{
          title: 'Dialogues',
          subtitle: `${dialogueIndex.dialogues.length} dialogue${dialogueIndex.dialogues.length === 1 ? '' : 's'}${isDirty ? ' (dirty)' : ''}`,
        }}
        content={content}
        leftPanel={leftPanel}
        rightPanel={activeTab === 'timeline' ? rightPanel : undefined}
        leftPanelDefaultSize={20}
        rightPanelDefaultSize={28}
      />

      <EditorModal isOpen={metaModal.isOpen} onClose={metaModal.onClose} size="md">
        <Box p={5} bg="gray.900" border="1px" borderColor="gray.700" borderRadius="md">
          <VStack align="stretch" spacing={4}>
            <Text color="white" fontSize="lg" fontWeight="bold">
              {metaMode === 'create' ? 'Create Dialogue' : 'Edit Dialogue'}
            </Text>

            <FormControl isRequired>
              <FormLabel fontSize="xs" color="gray.400">
                Name
              </FormLabel>
              <Input
                size="sm"
                bg="gray.800"
                color="white"
                value={metadataDraft.name}
                onChange={(event) =>
                  setMetadataDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                autoFocus
              />
            </FormControl>

            <FormControl display="flex" alignItems="center" justifyContent="space-between">
              <FormLabel fontSize="xs" color="gray.400" mb={0}>
                One-shot dialogue
              </FormLabel>
              <Switch
                size="sm"
                isChecked={metadataDraft.oneShot}
                onChange={(event) =>
                  setMetadataDraft((current) => ({
                    ...current,
                    oneShot: event.target.checked,
                  }))
                }
              />
            </FormControl>

            <Text fontSize="xs" color="gray.400" fontWeight="bold" textTransform="uppercase">
              Entry Condition (Lua, optional)
            </Text>

            <ConditionEditor
              value={metadataDraft.entryCondition}
              onChange={(expr) =>
                setMetadataDraft((current) => ({
                  ...current,
                  entryCondition: expr,
                }))
              }
              variables={gameVariables}
              tables={scriptTables}
              functions={scriptFunctions}
              namespaces={scriptNamespaces}
              activeContextType={activeContextType}
            />

            <Divider borderColor="whiteAlpha.300" />

            <HStack justify="flex-end">
              <Button size="sm" variant="ghost" onClick={metaModal.onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                colorScheme="blue"
                onClick={applyDialogueMetadata}
                isDisabled={!metadataDraft.name.trim()}
              >
                {metaMode === 'create' ? 'Create' : 'Save'}
              </Button>
            </HStack>
          </VStack>
        </Box>
      </EditorModal>
    </>
  );
};

export default DialogueEditor;
