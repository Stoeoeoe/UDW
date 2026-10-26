import { PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { validateLuaChunk } from '../../../lib/luaRunner';
import { registerWorkspaceTabSaveOverride } from '../../../lib/workspaceSaveActions';
import { useEditorStore } from '../../../store/useEditorStore';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import {
  DialogueChoiceNode,
  DialogueChoiceOption,
  DialogueDocument,
  DialogueNode,
  DialogueNodeType,
} from '../../../types/schema';
import { loadSortedDialogues, saveDialogueArtifacts } from './dialoguePersistence';
import {
  ActionLuaValidation,
  getBrokenReferenceNodeIds,
  getDuplicateMsgKeys,
  nowIso,
  resolveDialogueContextType,
} from './dialogueUtils';
import {
  addChoiceOptionToDialogue,
  appendNodeToChoiceBranch,
  appendTopLevelNode,
  assignChoiceOptionTarget,
  insertNodeAtIndex,
  moveChoiceOptionInDialogue,
  removeChoiceOptionFromDialogue,
  removeNodeFromDialogue,
  renameNodeInDialogue,
  reorderDialogueNodes,
  updateChoiceOptionInDialogue,
  updateNodeById,
} from './dialogueMutations';

export interface DialogueEditorController {
  characters: ReturnType<typeof useEditorStore.getState>['characters'];
  gameVariables: ReturnType<typeof useEditorStore.getState>['gameVariables'];
  scriptTables: ReturnType<typeof useEditorStore.getState>['scriptTables'];
  scriptFunctions: ReturnType<typeof useEditorStore.getState>['scriptFunctions'];
  scriptNamespaces: ReturnType<typeof useEditorStore.getState>['scriptNamespaces'];
  dialogues: Map<string, DialogueDocument>;
  selectedDialogueId: string | null;
  selectedNodeId: string | null;
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedDialogue: DialogueDocument | null;
  selectedNode: DialogueNode | null;
  expandedActionNodeIds: Set<string>;
  setExpandedActionNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  isDirty: boolean;
  isTimelineHeaderCollapsed: boolean;
  setIsTimelineHeaderCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  actionLuaValidation: ActionLuaValidation | null;
  duplicateMsgKeys: Set<string>;
  brokenReferenceNodeIds: Set<string>;
  activeContextType: ReturnType<typeof resolveDialogueContextType>;
  dialogueNodeTargets: string[];
  sensors: ReturnType<typeof useSensors>;
  renameNode: (oldId: string, newId: string) => void;
  insertNode: (nodeType: DialogueNodeType, index: number) => void;
  appendTopLevelNode: (nodeType: DialogueNodeType) => void;
  appendNodeToBranch: (
    nodeType: DialogueNodeType,
    choiceNodeId: string,
    optionId: string,
    branchOrder: number,
  ) => void;
  updateSelectedNode: (updater: (node: DialogueNode) => DialogueNode) => void;
  removeSelectedNode: () => void;
  removeNode: (nodeId: string) => void;
  updateChoiceOption: (
    choiceNodeId: string,
    optionId: string,
    updater: (option: DialogueChoiceOption) => DialogueChoiceOption,
  ) => void;
  moveChoiceOption: (choiceNode: DialogueChoiceNode, from: number, direction: -1 | 1) => void;
  removeChoiceOption: (choiceNodeId: string, optionId: string) => void;
  addChoiceOption: (choiceNodeId: string) => void;
  setChoiceOptionTarget: (
    choiceNodeId: string,
    optionId: string,
    targetNodeId: string,
    branchOrder: number,
  ) => void;
  handleDragEnd: (event: DragEndEvent) => void;
}

export function useDialogueEditorController(): DialogueEditorController {
  const project = useEditorStore((state) => state.project);
  const characters = useEditorStore((state) => state.characters);
  const storedSelectedDialogueId = useEditorStore((state) => state.selectedDialogueId);
  const storeDialogues = useEditorStore((state) => state.dialogues);
  const gameVariables = useEditorStore((state) => state.gameVariables);
  const scriptTables = useEditorStore((state) => state.scriptTables);
  const scriptFunctions = useEditorStore((state) => state.scriptFunctions);
  const scriptNamespaces = useEditorStore((state) => state.scriptNamespaces);
  const scriptContextTypes = useEditorStore((state) => state.scriptContextTypes);
  const workspaceTabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);

  const [dialogues, setDialogues] = useState<Map<string, DialogueDocument>>(new Map());
  const [selectedDialogueId, setSelectedDialogueId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedActionNodeIds, setExpandedActionNodeIds] = useState<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [isTimelineHeaderCollapsed, setIsTimelineHeaderCollapsed] = useState(false);
  const [actionLuaValidation, setActionLuaValidation] = useState<ActionLuaValidation | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyDialogueIdsRef = useRef<Set<string>>(new Set());
  const dialoguesRef = useRef(dialogues);

  useEffect(() => {
    dialoguesRef.current = dialogues;
  }, [dialogues]);

  useEffect(() => {
    if (storeDialogues.size === 0) return;
    setDialogues(new Map(storeDialogues));
  }, [storeDialogues]);

  const activeDocument = useMemo(
    () => workspaceTabs.find((tab) => tab.id === activeTabId)?.document ?? null,
    [activeTabId, workspaceTabs],
  );

  useEffect(() => {
    if (activeDocument?.kind !== 'dialogue') return;
    if (activeDocument.dialogueId === selectedDialogueId) return;
    if (!dialogues.has(activeDocument.dialogueId)) return;
    setSelectedDialogueId(activeDocument.dialogueId);
    setSelectedNodeId(null);
  }, [activeDocument, dialogues, selectedDialogueId]);

  useEffect(() => {
    if (!storedSelectedDialogueId || storedSelectedDialogueId === selectedDialogueId) return;
    if (!dialogues.has(storedSelectedDialogueId)) return;
    setSelectedDialogueId(storedSelectedDialogueId);
    setSelectedNodeId(null);
  }, [dialogues, selectedDialogueId, storedSelectedDialogueId]);

  useEffect(() => {
    useEditorStore.setState((state) => {
      state.selectedDialogueId = selectedDialogueId;
      state.selectedDialogueNodeId = selectedNodeId;
    });
  }, [selectedDialogueId, selectedNodeId]);

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

  const activeContextType = useMemo(
    () => resolveDialogueContextType(project, selectedDialogue, scriptContextTypes),
    [project, scriptContextTypes, selectedDialogue],
  );

  const flushSavesNow = useCallback(async () => {
    if (!project) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const dirtyIds = Array.from(dirtyDialogueIdsRef.current);
    for (const dialogueId of dirtyIds) {
      const dialogue = dialoguesRef.current.get(dialogueId);
      if (!dialogue) continue;
      await saveDialogueArtifacts(dialogue);
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

  useEffect(
    () =>
      registerWorkspaceTabSaveOverride('dialogues', {
        saveTab: async () => {
          if (!isDirty) return;
          await flushSavesNow();
        },
        saveAll: async () => {
          if (!isDirty) return;
          await flushSavesNow();
        },
      }),
    [flushSavesNow, isDirty],
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!project) {
        if (!cancelled) {
          setDialogues(new Map());
          setSelectedDialogueId(null);
          setSelectedNodeId(null);
          setIsDirty(false);
          dirtyDialogueIdsRef.current.clear();
        }
        return;
      }

      const sortedDialogues = await loadSortedDialogues();
      const map = new Map(sortedDialogues.map((dialogue) => [dialogue.id, dialogue]));

      if (cancelled) return;
      setDialogues(map);
      const preferredDialogueId =
        storedSelectedDialogueId && map.has(storedSelectedDialogueId)
          ? storedSelectedDialogueId
          : (sortedDialogues[0]?.id ?? null);
      setSelectedDialogueId(preferredDialogueId);
      setSelectedNodeId(null);
      setIsDirty(false);
      dirtyDialogueIdsRef.current.clear();
    };

    load().catch((error) => {
      console.error('Failed to load dialogues:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [project, storedSelectedDialogueId]);

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

    if (selectedNodeId && !selectedDialogue.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [selectedDialogue, selectedNodeId]);

  const updateDialogue = useCallback(
    (
      dialogueId: string,
      updater: (dialogue: DialogueDocument) => DialogueDocument,
      options?: { selectNodeId?: string | null },
    ) => {
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

      if (options && 'selectNodeId' in options) {
        setSelectedNodeId(options.selectNodeId ?? null);
      }

      queueSave(dialogueId);
    },
    [queueSave],
  );

  const renameNode = useCallback(
    (oldId: string, newId: string) => {
      if (!selectedDialogueId || !selectedDialogue) return;

      const nextDialogue = renameNodeInDialogue(selectedDialogue, oldId, newId);
      if (nextDialogue === selectedDialogue) return;

      updateDialogue(selectedDialogueId, () => nextDialogue);
      if (selectedNodeId === oldId) {
        setSelectedNodeId(newId.trim());
      }
    },
    [selectedDialogue, selectedDialogueId, selectedNodeId, updateDialogue],
  );

  const insertNode = useCallback(
    (nodeType: DialogueNodeType, index: number) => {
      if (!selectedDialogueId || !selectedDialogue) return;
      const result = insertNodeAtIndex(selectedDialogue, nodeType, index);
      updateDialogue(selectedDialogueId, () => result.dialogue, {
        selectNodeId: result.insertedNodeId,
      });
    },
    [selectedDialogue, selectedDialogueId, updateDialogue],
  );

  const appendTopLevelNodeToDialogue = useCallback(
    (nodeType: DialogueNodeType) => {
      if (!selectedDialogueId || !selectedDialogue) return;
      const result = appendTopLevelNode(selectedDialogue, nodeType);
      updateDialogue(selectedDialogueId, () => result.dialogue, {
        selectNodeId: result.insertedNodeId,
      });
    },
    [selectedDialogue, selectedDialogueId, updateDialogue],
  );

  const appendNodeToBranch = useCallback(
    (nodeType: DialogueNodeType, choiceNodeId: string, optionId: string, branchOrder: number) => {
      if (!selectedDialogueId || !selectedDialogue) return;
      const result = appendNodeToChoiceBranch(
        selectedDialogue,
        nodeType,
        choiceNodeId,
        optionId,
        branchOrder,
      );
      updateDialogue(selectedDialogueId, () => result.dialogue, {
        selectNodeId: result.insertedNodeId,
      });
    },
    [selectedDialogue, selectedDialogueId, updateDialogue],
  );

  const updateSelectedNode = useCallback(
    (updater: (node: DialogueNode) => DialogueNode) => {
      if (!selectedDialogueId || !selectedNodeId || !selectedDialogue) return;
      updateDialogue(selectedDialogueId, () =>
        updateNodeById(selectedDialogue, selectedNodeId, updater),
      );
    },
    [selectedDialogue, selectedDialogueId, selectedNodeId, updateDialogue],
  );

  const removeNode = useCallback(
    (nodeId: string) => {
      if (!selectedDialogueId || !selectedDialogue) return;
      updateDialogue(selectedDialogueId, () => removeNodeFromDialogue(selectedDialogue, nodeId));
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }
    },
    [selectedDialogue, selectedDialogueId, selectedNodeId, updateDialogue],
  );

  const removeSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;
    removeNode(selectedNodeId);
  }, [removeNode, selectedNodeId]);

  const updateChoiceOption = useCallback(
    (
      choiceNodeId: string,
      optionId: string,
      updater: (option: DialogueChoiceOption) => DialogueChoiceOption,
    ) => {
      if (!selectedDialogueId || !selectedDialogue) return;
      updateDialogue(selectedDialogueId, () =>
        updateChoiceOptionInDialogue(selectedDialogue, choiceNodeId, optionId, updater),
      );
    },
    [selectedDialogue, selectedDialogueId, updateDialogue],
  );

  const moveChoiceOption = useCallback(
    (choiceNode: DialogueChoiceNode, from: number, direction: -1 | 1) => {
      if (!selectedDialogueId || !selectedDialogue) return;
      updateDialogue(selectedDialogueId, () =>
        moveChoiceOptionInDialogue(selectedDialogue, choiceNode.id, from, direction),
      );
    },
    [selectedDialogue, selectedDialogueId, updateDialogue],
  );

  const removeChoiceOption = useCallback(
    (choiceNodeId: string, optionId: string) => {
      if (!selectedDialogueId || !selectedDialogue) return;
      updateDialogue(selectedDialogueId, () =>
        removeChoiceOptionFromDialogue(selectedDialogue, choiceNodeId, optionId),
      );
    },
    [selectedDialogue, selectedDialogueId, updateDialogue],
  );

  const addChoiceOption = useCallback(
    (choiceNodeId: string) => {
      if (!selectedDialogueId || !selectedDialogue) return;
      updateDialogue(selectedDialogueId, () =>
        addChoiceOptionToDialogue(selectedDialogue, choiceNodeId),
      );
    },
    [selectedDialogue, selectedDialogueId, updateDialogue],
  );

  const setChoiceOptionTarget = useCallback(
    (choiceNodeId: string, optionId: string, targetNodeId: string, branchOrder: number) => {
      if (!selectedDialogueId || !selectedDialogue) return;
      updateDialogue(selectedDialogueId, () =>
        assignChoiceOptionTarget(
          selectedDialogue,
          choiceNodeId,
          optionId,
          targetNodeId,
          branchOrder,
        ),
      );
    },
    [selectedDialogue, selectedDialogueId, updateDialogue],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target as HTMLElement;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      if (!selectedNodeId) return;
      removeNode(selectedNodeId);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [removeNode, selectedNodeId]);

  const dialogueNodeTargets = useMemo(
    () =>
      selectedDialogue
        ? selectedDialogue.nodes.filter((node) => node.type !== 'comment').map((node) => node.id)
        : [],
    [selectedDialogue],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !selectedDialogueId || !selectedDialogue) return;
      updateDialogue(selectedDialogueId, () =>
        reorderDialogueNodes(selectedDialogue, String(active.id), String(over.id)),
      );
    },
    [selectedDialogue, selectedDialogueId, updateDialogue],
  );

  return {
    characters,
    gameVariables,
    scriptTables,
    scriptFunctions,
    scriptNamespaces,
    dialogues,
    selectedDialogueId,
    selectedNodeId,
    setSelectedNodeId,
    selectedDialogue,
    selectedNode,
    expandedActionNodeIds,
    setExpandedActionNodeIds,
    isDirty,
    isTimelineHeaderCollapsed,
    setIsTimelineHeaderCollapsed,
    actionLuaValidation,
    duplicateMsgKeys,
    brokenReferenceNodeIds,
    activeContextType,
    dialogueNodeTargets,
    sensors,
    renameNode,
    insertNode,
    appendTopLevelNode: appendTopLevelNodeToDialogue,
    appendNodeToBranch,
    updateSelectedNode,
    removeSelectedNode,
    removeNode,
    updateChoiceOption,
    moveChoiceOption,
    removeChoiceOption,
    addChoiceOption,
    setChoiceOptionTarget,
    handleDragEnd,
  };
}
