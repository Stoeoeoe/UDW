import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  HStack,
  Input,
  Select,
  Text,
  VStack,
  useDisclosure,
} from '@chakra-ui/react';
import { DeleteIcon, EditIcon } from '@chakra-ui/icons';
import { PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { useEditorStore } from '../../../store/useEditorStore';
import {
  DialogueChoiceNode,
  DialogueChoiceOption,
  DialogueDocument,
  DialogueIndex,
  DialogueNode,
  DialogueNodeEditorMeta,
  DialogueNodeType,
  ScriptContextType,
} from '../../../types/schema';
import { fileSystem } from '../../../lib/fileSystem';
import { registerWorkspaceTabSaveOverride } from '../../../lib/workspaceSaveActions';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { ListPanel, ListPanelItem } from '../common';
import { validateLuaChunk } from '../../../lib/luaRunner';
import {
  ActionLuaValidation,
  DialogueTab,
  MetadataDraft,
  buildI18nExport,
  createDefaultDialogueIndex,
  createEmptyDialogue,
  createNodeByType,
  getBrokenReferenceNodeIds,
  getDuplicateMsgKeys,
  getDialogueEntry,
  isBranchNode,
  inferBranchForInsert,
  nextDialogueId,
  normalizeDialogueDocument,
  normalizeDialogueIndex,
  nowIso,
  relinkLinearFlow,
  removeNodesWithCleanup,
  reorderNodeBlocks,
  slugify,
  toRuntimeDialogue,
  upsertDialogueEntry,
} from './dialogueUtils';
import { DialogueNodeInspector } from './DialogueNodeInspector';
import { DialogueTimeline } from './DialogueTimeline';
import { CreateDialogueDialog } from './CreateDialogueDialog';
import { FieldLabel } from '../../common/Typography.tsx';

export const DialogueEditor: React.FC = () => {
  const project = useEditorStore((state) => state.project);
  const actors = useEditorStore((state) => state.actors);
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
    // TODO: Rename extension
    await fileSystem.saveJson('dialogues', 'dialogues.index.vproj', {
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

    if (selectedNodeId && !selectedDialogue.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [selectedDialogue, selectedNodeId]);

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

  const dialoguePanelItems: ListPanelItem[] = useMemo(
    () =>
      dialogueItems.map((entry) => ({
        id: entry.id,
        label: entry.name,
        sublabel: `${entry.nodeCount} node${entry.nodeCount === 1 ? '' : 's'}`,
        badge: (
          <Badge fontSize="9px" colorScheme={entry.oneShot ? 'purple' : 'green'} variant="subtle">
            {entry.oneShot ? 'one-shot' : 'repeatable'}
          </Badge>
        ),
      })),
    [dialogueItems],
  );

  const handleSelectDialogue = useCallback(
    (dialogueId: string) => {
      setSelectedDialogueId(dialogueId);
      const dialogue = dialogues.get(dialogueId);
      setSelectedNodeId(dialogue?.startNodeId ?? null);
    },
    [dialogues],
  );

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

  const applyDialogueMetadata = (values: MetadataDraft) => {
    const name = values.name.trim();
    if (!name) return;

    if (metaMode === 'create') {
      const derived = slugify(name);
      const id = derived ? `dlg_${derived}` : nextDialogueId(dialogueIndex);
      const uniqueId = dialogues.has(id) ? nextDialogueId(dialogueIndex) : id;
      const dialogue = createEmptyDialogue(uniqueId, name, values.oneShot, values.entryCondition);

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
      oneShot: values.oneShot,
      entryCondition: values.entryCondition.trim() || undefined,
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

  const renameNode = (oldId: string, newId: string) => {
    if (!selectedDialogueId || !selectedDialogue) return;
    const trimmed = newId.trim();
    if (!trimmed || trimmed === oldId) return;
    if (selectedDialogue.nodes.some((n) => n.id === trimmed)) return;

    updateDialogue(selectedDialogueId, (dialogue) => {
      const nodes = dialogue.nodes.map((n) => {
        const updated = n.id === oldId ? { ...n, id: trimmed } : n;
        if ((updated.type === 'line' || updated.type === 'action') && updated.next === oldId) {
          return { ...updated, next: trimmed };
        }
        if (updated.type === 'choice') {
          return {
            ...updated,
            options: updated.options.map((o) =>
              o.targetNodeId === oldId ? { ...o, targetNodeId: trimmed } : o,
            ),
            editor:
              updated.editor?.parentChoiceNodeId === oldId
                ? { ...updated.editor, parentChoiceNodeId: trimmed }
                : updated.editor,
          };
        }
        if (
          updated.type === 'jump' &&
          updated.targetNodeId === oldId &&
          !updated.targetDialogueId
        ) {
          return { ...updated, targetNodeId: trimmed };
        }
        if (updated.editor?.parentChoiceNodeId === oldId) {
          return { ...updated, editor: { ...updated.editor, parentChoiceNodeId: trimmed } };
        }
        return updated;
      });
      const startNodeId = dialogue.startNodeId === oldId ? trimmed : dialogue.startNodeId;
      return { ...dialogue, startNodeId, nodes };
    });

    if (selectedNodeId === oldId) setSelectedNodeId(trimmed);
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

  const appendNodeToBranch = (
    nodeType: DialogueNodeType,
    choiceNodeId: string,
    optionId: string,
    branchOrder: number,
  ) => {
    if (!selectedDialogueId || !selectedDialogue) return;

    updateDialogue(selectedDialogueId, (dialogue) => {
      const branchId = `${choiceNodeId}:${optionId}`;
      const branchNodes = dialogue.nodes.filter(
        (n) =>
          n.editor?.parentChoiceNodeId === choiceNodeId && n.editor?.parentOptionId === optionId,
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
        insertAt = dialogue.nodes.findIndex((n) => n.id === lastBranchNode.id) + 1;
      } else {
        insertAt = dialogue.nodes.findIndex((n) => n.id === choiceNodeId) + 1;
      }

      const nextNodes = [...dialogue.nodes];
      nextNodes.splice(insertAt, 0, created);
      return { ...dialogue, nodes: nextNodes };
    });
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !selectedDialogueId) return;
    updateDialogue(selectedDialogueId, (dialogue) => {
      const reordered = reorderNodeBlocks(dialogue.nodes, String(active.id), String(over.id));
      const relinked = relinkLinearFlow(reordered);
      const firstTopLevel = relinked.find((n) => !isBranchNode(n));
      return {
        ...dialogue,
        startNodeId: firstTopLevel?.id ?? dialogue.startNodeId,
        nodes: relinked,
      };
    });
  };

  const leftPanel = (
    <ListPanel
      title="Dialogues"
      items={dialoguePanelItems}
      selectedId={selectedDialogueId}
      onSelect={handleSelectDialogue}
      onAdd={openCreateDialogueModal}
      emptyMessage="No dialogues yet"
      topContent={
        <Input
          size="xs"
          value={search}
          placeholder="Filter..."
          onChange={(event) => setSearch(event.target.value)}
          bg="editorInlineBg"
          borderColor="editorInlineBorder"
        />
      }
      itemActions={(item) => [
        {
          id: 'edit',
          label: 'Edit dialogue metadata',
          icon: <EditIcon fontSize="10px" />,
          ariaLabel: 'Rename dialogue',
          onClick: () => openEditDialogueModal(item.id),
        },
        {
          id: 'delete',
          label: 'Delete dialogue',
          icon: <DeleteIcon fontSize="10px" />,
          ariaLabel: 'Delete dialogue',
          hoverColor: 'red.300',
          onClick: async () => {
            if (confirm(`Delete dialogue "${item.label}"?`)) {
              await removeDialogue(item.id);
            }
          },
        },
      ]}
    />
  );

  const settingsContent = (
    <VStack align="stretch" spacing={4} p={4}>
      <Box p={3} border="1px" borderColor="whiteAlpha.200" borderRadius="md" bg="editorPanelBg">
        <Text fontSize="12px" color="gray.200" mb={2}>
          Dialogue Settings
        </Text>
        <FormControl>
          <FieldLabel>Default Lua Context (`self`)</FieldLabel>
          <Select
            size="sm"
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
            <option value="">None</option>
            {scriptContextTypes.map((contextType) => (
              <option key={contextType.id} value={contextType.id}>
                {contextType.name}
              </option>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Box p={3} border="1px" borderColor="whiteAlpha.200" borderRadius="md" bg="editorPanelBg">
        <Text fontSize="11px" color="gray.500">
          Save behavior: auto-save after edits and when editor loses focus.
        </Text>
      </Box>
    </VStack>
  );

  const centerContent =
    activeTab === 'timeline' ? (
      <DialogueTimeline
        selectedDialogue={selectedDialogue}
        selectedDialogueId={selectedDialogueId}
        selectedNodeId={selectedNodeId}
        setSelectedNodeId={setSelectedNodeId}
        expandedActionNodeIds={expandedActionNodeIds}
        setExpandedActionNodeIds={setExpandedActionNodeIds}
        isTimelineHeaderCollapsed={isTimelineHeaderCollapsed}
        setIsTimelineHeaderCollapsed={setIsTimelineHeaderCollapsed}
        brokenReferenceNodeIds={brokenReferenceNodeIds}
        duplicateMsgKeys={duplicateMsgKeys}
        sensors={sensors}
        updateDialogue={updateDialogue}
        insertNode={insertNode}
        appendNodeToBranch={appendNodeToBranch}
        handleDragEnd={handleDragEnd}
      />
    ) : (
      settingsContent
    );

  const content = (
    <VStack align="stretch" spacing={0} h="full" bg="editorWorkspaceBg">
      <Flex
        align="center"
        gap={2}
        px={4}
        h="40px"
        bg="editorHeaderBg"
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
        viewportBackground={false}
        content={content}
        leftPanel={leftPanel}
        rightPanel={
          activeTab === 'timeline' ? (
            <DialogueNodeInspector
              selectedDialogue={selectedDialogue}
              selectedNode={selectedNode}
              actors={actors}
              gameVariables={gameVariables}
              scriptTables={scriptTables}
              scriptFunctions={scriptFunctions}
              scriptNamespaces={scriptNamespaces}
              activeContextType={activeContextType}
              duplicateMsgKeys={duplicateMsgKeys}
              dialogueNodeTargets={dialogueNodeTargets}
              dialogues={dialogues}
              actionLuaValidation={actionLuaValidation}
              updateDialogue={updateDialogue}
              updateSelectedNode={updateSelectedNode}
              updateChoiceOption={updateChoiceOption}
              moveChoiceOption={moveChoiceOption}
              renameNode={renameNode}
              removeSelectedNode={removeSelectedNode}
            />
          ) : undefined
        }
        leftPanelDefaultSize={18}
        rightPanelDefaultSize={28}
      />

      <CreateDialogueDialog
        isOpen={metaModal.isOpen}
        onClose={metaModal.onClose}
        mode={metaMode}
        initialValues={metadataDraft}
        onApply={applyDialogueMetadata}
        gameVariables={gameVariables}
        scriptTables={scriptTables}
        scriptFunctions={scriptFunctions}
        scriptNamespaces={scriptNamespaces}
        activeContextType={activeContextType}
      />
    </>
  );
};

export default DialogueEditor;
