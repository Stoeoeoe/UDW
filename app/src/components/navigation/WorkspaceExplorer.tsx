import React from 'react';
import { AddIcon } from '@chakra-ui/icons';
import {
  Box,
  FormControl,
  HStack,
  Icon,
  IconButton,
  Image,
  Input,
  Select,
  Text,
  Textarea,
  VStack,
  useToast,
} from '@chakra-ui/react';
import {
  ContextMenuState,
  CreateNewResourceDialog,
  WorkspaceContextMenu,
} from './WorkspaceContextMenu';
import {
  FiBox,
  FiCode,
  FiChevronDown,
  FiChevronRight,
  FiFolder,
  FiGrid,
  FiMap,
  FiMapPin,
  FiMessageSquare,
  FiPackage,
  FiEdit2,
  FiSettings,
  FiSliders,
  FiTrash2,
  FiUsers,
} from 'react-icons/fi';
import { WorkspaceDocument, WorkspaceTreeNode } from '../../types/workspace';
import {
  useSaveStore,
  saveDialogueIndexImmediate,
  saveDialogueImmediate,
} from '../../lib/saveManager';
import { SectionLabel } from '../common/Typography.tsx';
import { supportsPreviewTab } from '../../store/useWorkspaceStore';
import { GameIcon } from '../common/GameIcon';
import { canCreateResourceKind } from '../../lib/resourceAdapters';
import { fileSystem } from '../../lib/fileSystem';
import { MapCreator } from '../dialogs/MapCreator';
import { CreateTilesetDialog } from '../screens/tileset/CreateTilesetDialog';
import { CreateDialogueDialog } from '../screens/dialogue/CreateDialogueDialog';
import { EditorModal } from '../common/EditorModal';
import { EntityFormDialog } from '../screens/common/EntityFormDialog';
import {
  buildI18nExport,
  createDefaultDialogueIndex,
  createEmptyDialogue,
  getDialogueEntry,
  nextDialogueId,
  slugify,
  toRuntimeDialogue,
  type MetadataDraft,
} from '../screens/dialogue/dialogueUtils';
import { useEditorStore } from '../../store/useEditorStore';
import { TilesetMetadataDialog } from '../tileset/TilesetMetadataDialog';
import { IconPicker, ColorPicker } from '../screens/common/FormFields';
import { FormLabel } from '../common/FormLabel';

interface WorkspaceExplorerProps {
  nodes: WorkspaceTreeNode[];
  expandedNodeIds: string[];
  activeTabId: string | null;
  onToggleNode: (nodeId: string) => void;
  onOpenNode: (node: WorkspaceTreeNode, options?: { pin?: boolean }) => void;
  headerAction?: React.ReactNode;
  onOpenDocument?: (document: WorkspaceDocument, options?: { pin?: boolean }) => void;
}

type CreatableKind = 'location' | 'tileset' | 'actor' | 'entity' | 'item' | 'dialogue';

type CreateDialogState = {
  kind: CreatableKind;
  folderPath: string;
} | null;

type EditDialogState =
  | { kind: 'location'; document: Extract<WorkspaceDocument, { kind: 'location' }> }
  | { kind: 'tileset'; document: Extract<WorkspaceDocument, { kind: 'tileset' }> }
  | { kind: 'actor'; document: Extract<WorkspaceDocument, { kind: 'actor' }> }
  | { kind: 'entity'; document: Extract<WorkspaceDocument, { kind: 'entity' }> }
  | { kind: 'item'; document: Extract<WorkspaceDocument, { kind: 'item' }> }
  | { kind: 'dialogue'; document: Extract<WorkspaceDocument, { kind: 'dialogue' }> }
  | null;

type WorkspaceAccent = {
  color: string;
  tint: string;
  hoverTint: string;
  rowGradient: string;
  headerGradient: string;
};

const accentByResourceKind: Partial<Record<CreatableKind, WorkspaceAccent>> = {
  location: {
    color: 'blue.300',
    tint: 'rgba(59,130,246,0.14)',
    hoverTint: 'rgba(59,130,246,0.2)',
    rowGradient: 'linear(to-r, rgba(59,130,246,0.18), rgba(59,130,246,0.03) 72%, transparent)',
    headerGradient: 'linear(to-r, rgba(59,130,246,0.14), rgba(59,130,246,0.04) 68%, transparent)',
  },
  tileset: {
    color: 'cyan.300',
    tint: 'rgba(34,211,238,0.12)',
    hoverTint: 'rgba(34,211,238,0.18)',
    rowGradient: 'linear(to-r, rgba(34,211,238,0.16), rgba(34,211,238,0.03) 72%, transparent)',
    headerGradient: 'linear(to-r, rgba(34,211,238,0.12), rgba(34,211,238,0.035) 68%, transparent)',
  },
  actor: {
    color: 'orange.300',
    tint: 'rgba(251,146,60,0.12)',
    hoverTint: 'rgba(251,146,60,0.18)',
    rowGradient: 'linear(to-r, rgba(251,146,60,0.16), rgba(251,146,60,0.03) 72%, transparent)',
    headerGradient: 'linear(to-r, rgba(251,146,60,0.12), rgba(251,146,60,0.035) 68%, transparent)',
  },
  entity: {
    color: 'green.300',
    tint: 'rgba(74,222,128,0.12)',
    hoverTint: 'rgba(74,222,128,0.18)',
    rowGradient: 'linear(to-r, rgba(74,222,128,0.16), rgba(74,222,128,0.03) 72%, transparent)',
    headerGradient: 'linear(to-r, rgba(74,222,128,0.12), rgba(74,222,128,0.035) 68%, transparent)',
  },
  item: {
    color: 'purple.300',
    tint: 'rgba(196,181,253,0.12)',
    hoverTint: 'rgba(196,181,253,0.18)',
    rowGradient: 'linear(to-r, rgba(196,181,253,0.16), rgba(196,181,253,0.03) 72%, transparent)',
    headerGradient:
      'linear(to-r, rgba(196,181,253,0.12), rgba(196,181,253,0.035) 68%, transparent)',
  },
  dialogue: {
    color: 'yellow.300',
    tint: 'rgba(253,224,71,0.12)',
    hoverTint: 'rgba(253,224,71,0.18)',
    rowGradient: 'linear(to-r, rgba(253,224,71,0.16), rgba(253,224,71,0.03) 72%, transparent)',
    headerGradient: 'linear(to-r, rgba(253,224,71,0.12), rgba(253,224,71,0.035) 68%, transparent)',
  },
};

function getNodeIcon(node: WorkspaceTreeNode) {
  switch (node.icon) {
    case 'locations':
    case 'location':
      return FiMapPin;
    case 'map-base':
    case 'map-variation':
      return FiMap;
    case 'tilesets':
    case 'tileset':
      return FiGrid;
    case 'entities':
      return FiBox;
    case 'actors':
      return FiUsers;
    case 'items':
      return FiPackage;
    case 'dialogues':
      return FiMessageSquare;
    case 'scripting':
      return FiCode;
    case 'settings':
      return FiSettings;
    case 'configuration':
      return FiSliders;
    case 'folder':
      return FiFolder;
    default:
      return FiMap;
  }
}

export const WorkspaceExplorer: React.FC<WorkspaceExplorerProps> = ({
  nodes,
  expandedNodeIds,
  activeTabId,
  onToggleNode,
  onOpenNode,
  headerAction,
  onOpenDocument,
}) => {
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null);
  const [createDialog, setCreateDialog] = React.useState<CreateDialogState>(null);
  const [editDialog, setEditDialog] = React.useState<EditDialogState>(null);
  const primaryNodes = React.useMemo(
    () =>
      nodes.filter(
        (node) =>
          !(
            node.kind === 'leaf' &&
            (node.document?.kind === 'scripting' ||
              node.document?.kind === 'settings' ||
              node.document?.kind === 'configuration')
          ),
      ),
    [nodes],
  );
  const utilityNodes = React.useMemo(
    () =>
      nodes.filter(
        (node) =>
          node.kind === 'leaf' &&
          (node.document?.kind === 'scripting' ||
            node.document?.kind === 'settings' ||
            node.document?.kind === 'configuration'),
      ),
    [nodes],
  );

  const handleContextMenu = React.useCallback(
    (node: WorkspaceTreeNode, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({ node, x: event.clientX, y: event.clientY });
    },
    [],
  );

  const handleOpenDocument = React.useCallback(
    (document: WorkspaceDocument, options?: { pin?: boolean }) => {
      if (onOpenDocument) {
        onOpenDocument(document, options);
        return;
      }
      onOpenNode({ id: '', kind: 'leaf', label: '', document }, options);
    },
    [onOpenDocument, onOpenNode],
  );

  const handleCreateResource = React.useCallback((kind: CreatableKind, folderPath: string) => {
    setCreateDialog({ kind, folderPath });
  }, []);

  const handleEditResource = React.useCallback((node: WorkspaceTreeNode) => {
    if (!node.document) return;
    switch (node.document.kind) {
      case 'location':
        setEditDialog({ kind: 'location', document: node.document });
        break;
      case 'tileset':
        setEditDialog({ kind: 'tileset', document: node.document });
        break;
      case 'actor':
        setEditDialog({ kind: 'actor', document: node.document });
        break;
      case 'entity':
        setEditDialog({ kind: 'entity', document: node.document });
        break;
      case 'item':
        setEditDialog({ kind: 'item', document: node.document });
        break;
      case 'dialogue':
        setEditDialog({ kind: 'dialogue', document: node.document });
        break;
      default:
        break;
    }
  }, []);

  const handleDeleteResource = React.useCallback(async (node: WorkspaceTreeNode) => {
    if (!node.document) return;
    if (!canQuickDelete(node.document)) return;
    if (!confirm(`Delete "${node.label}"?`)) return;

    const store = useEditorStore.getState();
    const document = node.document;
    switch (document.kind) {
      case 'actor':
        await store.deleteActor(document.actorId);
        break;
      case 'entity':
        await store.deleteEntityType(document.entityTypeId);
        break;
      case 'item':
        await store.deleteItem(document.itemId);
        break;
      case 'tileset':
        await store.deleteTileset(document.tilesetId);
        break;
      case 'location':
        await store.deleteMap(document.mapId);
        break;
      case 'dialogue': {
        const current = useEditorStore.getState();
        if (!current.dialogueIndex) return;
        const dialogueId = document.dialogueId;
        const nextIndex = {
          ...current.dialogueIndex,
          dialogues: current.dialogueIndex.dialogues.filter((entry) => entry.id !== dialogueId),
        };
        useEditorStore.setState((draft) => {
          draft.dialogueIndex = nextIndex;
          draft.dialogues.delete(dialogueId);
          if (draft.selectedDialogueId === dialogueId) {
            draft.selectedDialogueId = nextIndex.dialogues[0]?.id ?? null;
            draft.selectedDialogueNodeId = null;
          }
        });
        await saveDialogueIndexImmediate(nextIndex);
        break;
      }
      default:
        break;
    }
  }, []);

  return (
    <VStack align="stretch" spacing={0} h="full" bg="editorSidebarBg" overflow="hidden">
      <HStack
        px={4}
        py={3}
        borderBottom="1px"
        borderColor="editorShellBorder"
        justify="space-between"
        align="center"
      >
        <VStack align="start" spacing={0}>
          <SectionLabel textStyle="panelLabel">Project</SectionLabel>
        </VStack>
        {headerAction}
      </HStack>
      <Box flex={1} minH={0} overflowY="auto" px={2} py={3}>
        <VStack align="stretch" spacing={7}>
          {primaryNodes.map((node) => (
            <WorkspaceExplorerNode
              key={node.id}
              node={node}
              expandedNodeIds={expandedNodeIds}
              activeTabId={activeTabId}
              depth={0}
              accent={getNodeAccent(node)}
              onToggleNode={onToggleNode}
              onOpenNode={onOpenNode}
              onContextMenu={handleContextMenu}
              onCreateResource={handleCreateResource}
              onEditResource={handleEditResource}
              onDeleteResource={handleDeleteResource}
            />
          ))}
        </VStack>
      </Box>
      {utilityNodes.length > 0 && (
        <Box
          borderTop="1px"
          borderColor="editorShellBorder"
          bg="editorHeaderBg"
          px={2}
          py={2}
          flexShrink={0}
        >
          <VStack align="stretch" spacing={1}>
            {utilityNodes.map((node) => (
              <WorkspaceExplorerNode
                key={node.id}
                node={node}
                expandedNodeIds={expandedNodeIds}
                activeTabId={activeTabId}
                depth={0}
                accent={null}
                onToggleNode={onToggleNode}
                onOpenNode={onOpenNode}
                onContextMenu={handleContextMenu}
                onCreateResource={handleCreateResource}
                onEditResource={handleEditResource}
                onDeleteResource={handleDeleteResource}
              />
            ))}
          </VStack>
        </Box>
      )}
      <WorkspaceContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        onOpenDocument={handleOpenDocument}
        onCreateResource={handleCreateResource}
      />
      <WorkspaceCreateDialog
        state={createDialog}
        onClose={() => setCreateDialog(null)}
        onOpenDocument={handleOpenDocument}
      />
      <WorkspaceEditDialog
        state={editDialog}
        onClose={() => setEditDialog(null)}
        onOpenDocument={handleOpenDocument}
      />
    </VStack>
  );
};

const WorkspaceExplorerNode: React.FC<{
  node: WorkspaceTreeNode;
  expandedNodeIds: string[];
  activeTabId: string | null;
  depth: number;
  accent: WorkspaceAccent | null;
  onToggleNode: (nodeId: string) => void;
  onOpenNode: (node: WorkspaceTreeNode, options?: { pin?: boolean }) => void;
  onContextMenu: (node: WorkspaceTreeNode, event: React.MouseEvent) => void;
  onCreateResource: (kind: CreatableKind, folderPath: string) => void;
  onEditResource: (node: WorkspaceTreeNode) => void;
  onDeleteResource: (node: WorkspaceTreeNode) => void | Promise<void>;
}> = ({
  node,
  expandedNodeIds,
  activeTabId,
  depth,
  accent,
  onToggleNode,
  onOpenNode,
  onContextMenu,
  onCreateResource,
  onEditResource,
  onDeleteResource,
}) => {
  const saveUnits = useSaveStore((state) => state.saveUnits);
  const isExpanded = expandedNodeIds.includes(node.id);
  const IconComponent = getNodeIcon(node);
  const isActive = Boolean(node.document) && activeTabId === getActiveId(node);
  const isDirty = Boolean(node.document && saveUnits[node.document.saveUnitId]?.dirty);
  const paddingLeft = 2 + depth * 4;
  const isUtilityLeaf =
    depth === 0 &&
    node.kind === 'leaf' &&
    (node.document?.kind === 'scripting' ||
      node.document?.kind === 'settings' ||
      node.document?.kind === 'configuration');
  const inheritedAccent = accent ?? getNodeAccent(node);

  if (node.kind === 'group') {
    const canCreate = Boolean(node.resourceKind && canCreateResourceKind(node.resourceKind));
    return (
      <Box>
        <HStack
          px={Math.max(paddingLeft, 3)}
          h="8"
          pr={2}
          borderRadius="sm"
          cursor="pointer"
          color={inheritedAccent?.color ?? 'editorMutedText'}
          borderBottomWidth="1px"
          borderBottomColor="whiteAlpha.50"
          bgGradient={inheritedAccent?.headerGradient}
          _hover={{ bg: 'editorHoverBg', color: inheritedAccent?.color ?? 'editorText' }}
          onClick={() => onToggleNode(node.id)}
          onContextMenu={(event) => onContextMenu(node, event)}
          role="group"
        >
          <Icon
            as={isExpanded ? FiChevronDown : FiChevronRight}
            boxSize={3.5}
            color={inheritedAccent?.color ?? 'gray.500'}
          />
          <Text
            fontSize="xs"
            fontWeight="bold"
            textTransform="uppercase"
            letterSpacing="widest"
            flex={1}
            color={inheritedAccent?.color ?? 'blue.100'}
          >
            {node.label}
          </Text>
          {canCreate && (
            <IconButton
              aria-label={`Create ${node.label}`}
              icon={<AddIcon boxSize={2.5} />}
              size="xs"
              borderRadius="sm"
              bg="transparent"
              color={inheritedAccent?.color ?? 'gray.400'}
              opacity={0.7}
              _groupHover={{ opacity: 1 }}
              _hover={{ bg: 'whiteAlpha.100', color: inheritedAccent?.color ?? 'white' }}
              onClick={(event) => {
                event.stopPropagation();
                onCreateResource(node.resourceKind as CreatableKind, '');
              }}
            />
          )}
        </HStack>
        {isExpanded &&
          node.children?.map((child) => (
            <Box key={child.id} mt={1}>
              <WorkspaceExplorerNode
                node={child}
                expandedNodeIds={expandedNodeIds}
                activeTabId={activeTabId}
                depth={depth + 1}
                accent={inheritedAccent}
                onToggleNode={onToggleNode}
                onOpenNode={onOpenNode}
                onContextMenu={onContextMenu}
                onCreateResource={onCreateResource}
                onEditResource={onEditResource}
                onDeleteResource={onDeleteResource}
              />
            </Box>
          ))}
      </Box>
    );
  }

  if (node.kind === 'folder') {
    const canCreate = Boolean(node.resourceKind && canCreateResourceKind(node.resourceKind));
    const folderPath = node.id.replace(/^folder:[^:]+:/, '');
    return (
      <Box position="relative" pl={2}>
        <Box
          position="absolute"
          left="15px"
          top="6px"
          bottom="6px"
          w="1px"
          bg="whiteAlpha.50"
          pointerEvents="none"
        />
        <HStack
          px={paddingLeft}
          h="8"
          pr={2}
          borderRadius="sm"
          cursor="pointer"
          color="editorMutedText"
          _hover={{ bg: 'editorHoverBg', color: inheritedAccent?.color ?? 'editorText' }}
          onClick={() => onToggleNode(node.id)}
          onContextMenu={(event) => onContextMenu(node, event)}
          role="group"
        >
          <Icon
            as={isExpanded ? FiChevronDown : FiChevronRight}
            boxSize={3}
            color={inheritedAccent?.color ?? 'gray.600'}
          />
          <Icon as={FiFolder} boxSize={3} color={inheritedAccent?.color ?? 'gray.400'} />
          <Text
            fontSize="xs"
            fontWeight="semibold"
            flex={1}
            color={inheritedAccent?.color ?? 'editorMutedText'}
          >
            {node.label}
          </Text>
          {canCreate && (
            <IconButton
              aria-label={`Create in ${node.label}`}
              icon={<AddIcon boxSize={2.5} />}
              size="xs"
              borderRadius="full"
              bg="transparent"
              color={inheritedAccent?.color ?? 'gray.400'}
              opacity={0.3}
              _groupHover={{ opacity: 1 }}
              _hover={{ bg: 'whiteAlpha.100', color: inheritedAccent?.color ?? 'white' }}
              onClick={(event) => {
                event.stopPropagation();
                onCreateResource(node.resourceKind as CreatableKind, folderPath);
              }}
            />
          )}
        </HStack>
        {isExpanded &&
          node.children?.map((child) => (
            <Box key={child.id}>
              <WorkspaceExplorerNode
                node={child}
                expandedNodeIds={expandedNodeIds}
                activeTabId={activeTabId}
                depth={depth + 1}
                accent={inheritedAccent}
                onToggleNode={onToggleNode}
                onOpenNode={onOpenNode}
                onContextMenu={onContextMenu}
                onCreateResource={onCreateResource}
                onEditResource={onEditResource}
                onDeleteResource={onDeleteResource}
              />
            </Box>
          ))}
      </Box>
    );
  }

  return (
    <HStack
      px={isUtilityLeaf ? 3 : paddingLeft + 5}
      h="8"
      mt={isUtilityLeaf ? 1 : 0}
      borderRadius="sm"
      cursor="pointer"
      bg={isActive ? (inheritedAccent?.tint ?? 'editorHoverBg') : 'transparent'}
      bgGradient={isActive && !isUtilityLeaf ? inheritedAccent?.rowGradient : undefined}
      color={isActive ? 'editorText' : 'editorMutedText'}
      borderWidth="1px"
      borderColor={isActive ? 'whiteAlpha.100' : 'transparent'}
      role="group"
      _hover={{
        bg: isActive ? (inheritedAccent?.hoverTint ?? 'editorHoverBg') : 'editorHoverBg',
        color: 'editorText',
        borderColor: isActive ? 'whiteAlpha.200' : 'whiteAlpha.50',
      }}
      onClick={() =>
        onOpenNode(node, { pin: !node.document || !supportsPreviewTab(node.document) })
      }
      onDoubleClick={() => {
        if (!node.document || !supportsPreviewTab(node.document)) return;
        onOpenNode(node, { pin: true });
      }}
      onContextMenu={(event) => onContextMenu(node, event)}
    >
      <WorkspaceNodeVisual
        node={node}
        icon={IconComponent}
        isActive={isActive}
        compact={isUtilityLeaf}
      />
      <Text fontSize="sm" fontWeight={isActive ? 'semibold' : 'medium'} noOfLines={1} flex={1}>
        {node.label}
      </Text>
      {isDirty && <Box boxSize="2" borderRadius="full" bg="orange.400" flexShrink={0} />}
      {node.document && (canQuickEdit(node.document) || canQuickDelete(node.document)) && (
        <HStack spacing={1} opacity={0} _groupHover={{ opacity: 1 }} flexShrink={0}>
          {canQuickEdit(node.document) && (
            <IconButton
              aria-label={`Edit ${node.label}`}
              icon={<Icon as={FiEdit2} boxSize={3} />}
              size="xs"
              variant="ghost"
              color="gray.400"
              _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
              onClick={(event) => {
                event.stopPropagation();
                onEditResource(node);
              }}
            />
          )}
          {canQuickDelete(node.document) && (
            <IconButton
              aria-label={`Delete ${node.label}`}
              icon={<Icon as={FiTrash2} boxSize={3} />}
              size="xs"
              variant="ghost"
              color="gray.500"
              _hover={{ color: 'red.300', bg: 'whiteAlpha.100' }}
              onClick={(event) => {
                event.stopPropagation();
                void onDeleteResource(node);
              }}
            />
          )}
        </HStack>
      )}
    </HStack>
  );
};

const WorkspaceCreateDialog: React.FC<{
  state: CreateDialogState;
  onClose: () => void;
  onOpenDocument: (document: WorkspaceDocument, options?: { pin?: boolean }) => void;
}> = ({ state, onClose, onOpenDocument }) => {
  const toast = useToast();
  const gameVariables = useEditorStore((s) => s.gameVariables);
  const scriptTables = useEditorStore((s) => s.scriptTables);
  const scriptFunctions = useEditorStore((s) => s.scriptFunctions);
  const scriptNamespaces = useEditorStore((s) => s.scriptNamespaces);
  const scriptContextTypes = useEditorStore((s) => s.scriptContextTypes);

  const handleCreateDialogue = React.useCallback(
    async (values: MetadataDraft, folderPath: string) => {
      const state = useEditorStore.getState();
      const existingIndex = state.dialogueIndex ?? createDefaultDialogueIndex();
      const derived = slugify(values.name);
      const candidateId = derived ? `dlg_${derived}` : nextDialogueId(existingIndex);
      const dialogueId = state.dialogues.has(candidateId)
        ? nextDialogueId(existingIndex)
        : candidateId;
      const dialogue = createEmptyDialogue(
        dialogueId,
        values.name.trim(),
        values.oneShot,
        values.entryCondition,
      );
      const entry = { ...getDialogueEntry(dialogue), folderPath: folderPath || undefined };
      const nextIndex = {
        ...existingIndex,
        dialogues: [...existingIndex.dialogues.filter((item) => item.id !== dialogue.id), entry],
      };

      useEditorStore.setState((draft) => {
        draft.dialogueIndex = nextIndex;
        draft.dialogues.set(dialogue.id, dialogue);
        draft.selectedDialogueId = dialogue.id;
        draft.selectedDialogueNodeId = dialogue.startNodeId;
      });

      await saveDialogueIndexImmediate(nextIndex);
      await saveDialogueImmediate(dialogue);
      await fileSystem.saveJson(
        'dialogues',
        `${dialogue.id}.runtime.dialogue.json`,
        toRuntimeDialogue(dialogue),
      );
      await fileSystem.saveJson('dialogues', `${dialogue.id}.i18n.json`, buildI18nExport(dialogue));
      onOpenDocument(
        {
          kind: 'dialogue',
          dialogueId: dialogue.id,
          label: dialogue.name,
          saveUnitId: `dialogue:${dialogue.id}`,
        },
        { pin: true },
      );
      onClose();
    },
    [onClose, onOpenDocument],
  );

  if (!state) return null;

  if (state.kind === 'location') {
    return (
      <EditorModal isOpen onClose={onClose}>
        <MapCreator
          onCreate={onClose}
          onCancel={onClose}
          folderPath={state.folderPath}
          onCreatedMapId={(mapId) => {
            const map = useEditorStore.getState().maps.find((entry) => entry.id === mapId);
            if (!map) return;
            onOpenDocument(
              {
                kind: 'location',
                mapId: map.id,
                variationId: null,
                label: map.name,
                saveUnitId: `location:${map.id}`,
              },
              { pin: true },
            );
          }}
        />
      </EditorModal>
    );
  }

  if (state.kind === 'tileset') {
    return (
      <CreateTilesetDialog
        isOpen
        onClose={onClose}
        folderPath={state.folderPath}
        onCreatedTilesetId={(tilesetId) => {
          const tileset = useEditorStore.getState().tilesets.get(tilesetId);
          if (!tileset) return;
          onOpenDocument(
            {
              kind: 'tileset',
              tilesetId: tileset.id,
              label: tileset.name,
              saveUnitId: `tileset:${tileset.id}`,
            },
            { pin: true },
          );
        }}
      />
    );
  }

  if (state.kind === 'dialogue') {
    return (
      <CreateDialogueDialog
        isOpen
        onClose={onClose}
        mode="create"
        initialValues={{ name: '', oneShot: false, entryCondition: '' }}
        onApply={(values) => {
          void handleCreateDialogue(values, state.folderPath).catch((error) => {
            toast({
              title: 'Create dialogue failed',
              description: error instanceof Error ? error.message : 'Unknown error',
              status: 'error',
            });
          });
        }}
        gameVariables={gameVariables}
        scriptTables={scriptTables}
        scriptFunctions={scriptFunctions}
        scriptNamespaces={scriptNamespaces}
        activeContextType={
          scriptContextTypes.find(
            (context) =>
              context.id === useEditorStore.getState().dialogueIndex?.defaultContextTypeId,
          ) ?? undefined
        }
      />
    );
  }

  return (
    <CreateNewResourceDialog
      kind={state.kind}
      folderPath={state.folderPath}
      onClose={onClose}
      onOpenDocument={onOpenDocument}
    />
  );
};

const WorkspaceEditDialog: React.FC<{
  state: EditDialogState;
  onClose: () => void;
  onOpenDocument: (document: WorkspaceDocument, options?: { pin?: boolean }) => void;
}> = ({ state, onClose, onOpenDocument }) => {
  const toast = useToast();
  const tilesetId = state?.kind === 'tileset' ? state.document.tilesetId : null;
  const tileset = useEditorStore((s) => (tilesetId ? s.tilesets.get(tilesetId) : undefined));

  if (!state) return null;

  if (state.kind === 'location') {
    return (
      <OpenMapMetadataDialog
        document={state.document}
        onClose={onClose}
        onOpenDocument={onOpenDocument}
      />
    );
  }

  if (state.kind === 'tileset') {
    if (!tileset) return null;
    return <TilesetMetadataDialog isOpen onClose={onClose} tileset={tileset} />;
  }

  if (state.kind === 'dialogue') {
    return (
      <DialogueMetadataDialog
        document={state.document}
        onClose={onClose}
        onOpenDocument={onOpenDocument}
      />
    );
  }

  if (state.kind === 'actor') {
    return <ActorMetadataDialog document={state.document} onClose={onClose} />;
  }

  if (state.kind === 'entity') {
    return <EntityMetadataDialog document={state.document} onClose={onClose} />;
  }

  if (state.kind === 'item') {
    return <ItemMetadataDialog document={state.document} onClose={onClose} />;
  }

  toast({
    title: 'Unsupported resource',
    status: 'warning',
  });
  return null;
};

const OpenMapMetadataDialog: React.FC<{
  document: Extract<WorkspaceDocument, { kind: 'location' }>;
  onClose: () => void;
  onOpenDocument: (document: WorkspaceDocument, options?: { pin?: boolean }) => void;
}> = ({ document, onClose, onOpenDocument }) => {
  React.useEffect(() => {
    onOpenDocument(document, { pin: true });

    let cancelled = false;
    let attempts = 0;

    const openWhenReady = () => {
      if (cancelled) return;

      const currentMapId = useEditorStore.getState().currentMap?.id;
      if (currentMapId === document.mapId) {
        window.dispatchEvent(
          new CustomEvent('openMetadataDialog', { detail: { initialTab: 'base' } }),
        );
        onClose();
        return;
      }

      attempts += 1;
      if (attempts >= 20) {
        onClose();
        return;
      }

      window.setTimeout(openWhenReady, 30);
    };

    window.setTimeout(openWhenReady, 30);

    return () => {
      cancelled = true;
    };
  }, [document, onClose, onOpenDocument]);

  return null;
};

const DialogueMetadataDialog: React.FC<{
  document: Extract<WorkspaceDocument, { kind: 'dialogue' }>;
  onClose: () => void;
  onOpenDocument: (document: WorkspaceDocument, options?: { pin?: boolean }) => void;
}> = ({ document, onClose, onOpenDocument }) => {
  const dialogue = useEditorStore((s) => s.dialogues.get(document.dialogueId));
  const dialogueIndex = useEditorStore((s) => s.dialogueIndex);
  const gameVariables = useEditorStore((s) => s.gameVariables);
  const scriptTables = useEditorStore((s) => s.scriptTables);
  const scriptFunctions = useEditorStore((s) => s.scriptFunctions);
  const scriptNamespaces = useEditorStore((s) => s.scriptNamespaces);
  const scriptContextTypes = useEditorStore((s) => s.scriptContextTypes);
  const toast = useToast();

  if (!dialogue || !dialogueIndex) return null;

  return (
    <CreateDialogueDialog
      isOpen
      onClose={onClose}
      mode="edit"
      initialValues={{
        name: dialogue.name,
        oneShot: dialogue.oneShot,
        entryCondition: dialogue.entryCondition ?? '',
      }}
      onApply={(values) => {
        const updated = {
          ...dialogue,
          name: values.name.trim(),
          oneShot: values.oneShot,
          entryCondition: values.entryCondition.trim() || undefined,
          updatedAt: new Date().toISOString(),
        };
        const entry = {
          ...getDialogueEntry(updated),
          folderPath: dialogueIndex.dialogues.find((d) => d.id === updated.id)?.folderPath,
        };
        const nextIndex = {
          ...dialogueIndex,
          dialogues: dialogueIndex.dialogues.map((item) => (item.id === updated.id ? entry : item)),
        };
        useEditorStore.setState((draft) => {
          draft.dialogues.set(updated.id, updated);
          draft.dialogueIndex = nextIndex;
        });
        void saveDialogueIndexImmediate(nextIndex);
        void saveDialogueImmediate(updated);
        void fileSystem
          .saveJson('dialogues', `${updated.id}.runtime.dialogue.json`, toRuntimeDialogue(updated))
          .then(() =>
            fileSystem.saveJson('dialogues', `${updated.id}.i18n.json`, buildI18nExport(updated)),
          )
          .then(() => {
            onOpenDocument(
              {
                kind: 'dialogue',
                dialogueId: updated.id,
                label: updated.name,
                saveUnitId: `dialogue:${updated.id}`,
              },
              { pin: true },
            );
            onClose();
          })
          .catch((error) => {
            toast({
              title: 'Save dialogue failed',
              description: error instanceof Error ? error.message : 'Unknown error',
              status: 'error',
            });
          });
      }}
      gameVariables={gameVariables}
      scriptTables={scriptTables}
      scriptFunctions={scriptFunctions}
      scriptNamespaces={scriptNamespaces}
      activeContextType={
        scriptContextTypes.find((context) => context.id === dialogueIndex.defaultContextTypeId) ??
        undefined
      }
    />
  );
};

const ActorMetadataDialog: React.FC<{
  document: Extract<WorkspaceDocument, { kind: 'actor' }>;
  onClose: () => void;
}> = ({ document, onClose }) => {
  const actor = useEditorStore((s) => s.actors.find((entry) => entry.id === document.actorId));
  const updateActor = useEditorStore((s) => s.updateActor);
  const [name, setName] = React.useState(actor?.name ?? '');
  const [icon, setIcon] = React.useState(actor?.icon ?? 'GiPerson');

  if (!actor) return null;

  return (
    <EditorModal isOpen onClose={onClose}>
      <EntityFormDialog
        title="Edit Actor"
        onCancel={onClose}
        onSubmit={async () => {
          await updateActor(actor.id, { name: name.trim() || actor.name, icon });
          onClose();
        }}
        submitLabel="Save"
      >
        <FormControl>
          <FormLabel>Name</FormLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormControl>
        <FormControl>
          <FormLabel>Icon</FormLabel>
          <IconPicker value={icon} onChange={(value) => setIcon(value ?? '')} />
        </FormControl>
      </EntityFormDialog>
    </EditorModal>
  );
};

const EntityMetadataDialog: React.FC<{
  document: Extract<WorkspaceDocument, { kind: 'entity' }>;
  onClose: () => void;
}> = ({ document, onClose }) => {
  const entity = useEditorStore((s) =>
    s.entityTypes.find((entry) => entry.id === document.entityTypeId),
  );
  const updateEntityType = useEditorStore((s) => s.updateEntityType);
  const [displayName, setDisplayName] = React.useState(entity?.displayName ?? '');
  const [category, setCategory] = React.useState(entity?.category ?? 'object');
  const [group, setGroup] = React.useState(entity?.group ?? '');
  const [description, setDescription] = React.useState(entity?.description ?? '');
  const [icon, setIcon] = React.useState(entity?.icon ?? 'GiYinYang');
  const [placeholderColor, setPlaceholderColor] = React.useState(
    entity?.placeholderColor ?? '#888888',
  );

  if (!entity) return null;

  return (
    <EditorModal isOpen onClose={onClose}>
      <EntityFormDialog
        title="Edit Entity Type"
        onCancel={onClose}
        onSubmit={async () => {
          await updateEntityType(entity.id, {
            displayName: displayName.trim() || entity.displayName,
            category: category as any,
            group: group.trim() || undefined,
            description: description.trim() || undefined,
            icon,
            placeholderColor,
          });
          onClose();
        }}
        submitLabel="Save"
        scrollable
      >
        <FormControl>
          <FormLabel>Name</FormLabel>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </FormControl>
        <HStack spacing={4} align="start">
          <FormControl>
            <FormLabel>Category</FormLabel>
            <Select
              value={category}
              onChange={(e) =>
                setCategory(
                  e.target.value as 'object' | 'trigger' | 'spawn' | 'transition' | 'decoration',
                )
              }
            >
              <option value="object">Object</option>
              <option value="trigger">Trigger</option>
              <option value="spawn">Spawn</option>
              <option value="transition">Transition</option>
              <option value="decoration">Decoration</option>
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel>Group</FormLabel>
            <Input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="Ungrouped"
            />
          </FormControl>
        </HStack>
        <FormControl>
          <FormLabel>Description</FormLabel>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormControl>
        <HStack spacing={4} align="start">
          <FormControl>
            <FormLabel>Icon</FormLabel>
            <IconPicker value={icon} onChange={(value) => setIcon(value ?? '')} />
          </FormControl>
          <FormControl>
            <FormLabel>Color</FormLabel>
            <ColorPicker value={placeholderColor} onChange={setPlaceholderColor} />
          </FormControl>
        </HStack>
      </EntityFormDialog>
    </EditorModal>
  );
};

const ItemMetadataDialog: React.FC<{
  document: Extract<WorkspaceDocument, { kind: 'item' }>;
  onClose: () => void;
}> = ({ document, onClose }) => {
  const item = useEditorStore((s) => s.items.find((entry) => entry.id === document.itemId));
  const updateItem = useEditorStore((s) => s.updateItem);
  const itemClasses = useEditorStore((s) => s.itemClasses);
  const [name, setName] = React.useState(item?.name ?? '');
  const [category, setCategory] = React.useState(item?.category ?? '');
  const [description, setDescription] = React.useState(item?.description ?? '');
  const [icon, setIcon] = React.useState(item?.icon ?? '');
  const [maxStackSize, setMaxStackSize] = React.useState(item?.maxStackSize ?? 99);
  const [classId, setClassId] = React.useState(item?.classId ?? '');

  if (!item) return null;

  return (
    <EditorModal isOpen onClose={onClose}>
      <EntityFormDialog
        title="Edit Item"
        onCancel={onClose}
        onSubmit={async () => {
          await updateItem(item.id, {
            name: name.trim() || item.name,
            category,
            description,
            icon,
            maxStackSize,
            classId: classId || undefined,
          });
          onClose();
        }}
        submitLabel="Save"
        scrollable
      >
        <FormControl>
          <FormLabel>Name</FormLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormControl>
        <FormControl>
          <FormLabel>Category</FormLabel>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} />
        </FormControl>
        {itemClasses.length > 0 && (
          <FormControl>
            <FormLabel>Item Class</FormLabel>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">-- None --</option>
              {itemClasses.map((itemClass) => (
                <option key={itemClass.id} value={itemClass.id}>
                  {itemClass.name}
                </option>
              ))}
            </Select>
          </FormControl>
        )}
        <FormControl>
          <FormLabel>Description</FormLabel>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormControl>
        <FormControl>
          <FormLabel>Icon Asset</FormLabel>
          <Input value={icon} onChange={(e) => setIcon(e.target.value)} />
        </FormControl>
        <FormControl>
          <FormLabel>Max Stack Size</FormLabel>
          <Input
            type="number"
            value={maxStackSize}
            onChange={(e) => setMaxStackSize(Number(e.target.value) || 1)}
          />
        </FormControl>
      </EntityFormDialog>
    </EditorModal>
  );
};

const WorkspaceNodeVisual: React.FC<{
  node: WorkspaceTreeNode;
  icon: React.ComponentType;
  isActive: boolean;
  compact?: boolean;
}> = ({ node, icon, isActive, compact = false }) => {
  const boxSize = compact ? '18px' : '20px';
  const iconSize = compact ? 3 : 3.5;

  if (node.resourceIcon?.type === 'game-icon') {
    return (
      <Box
        boxSize={boxSize}
        borderRadius="md"
        bg={isActive ? 'rgba(96,165,250,0.14)' : 'rgba(255,255,255,0.04)'}
        display="flex"
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
      >
        <GameIcon
          iconName={node.resourceIcon.value}
          size={12}
          color={isActive ? 'blue.200' : 'inherit'}
        />
      </Box>
    );
  }

  if (node.resourceIcon?.type === 'emoji') {
    return (
      <Box
        boxSize={boxSize}
        display="flex"
        alignItems="center"
        justifyContent="center"
        fontSize="12px"
        flexShrink={0}
        borderRadius="md"
        bg={isActive ? 'rgba(96,165,250,0.16)' : 'rgba(255,255,255,0.04)'}
      >
        {node.resourceIcon.value}
      </Box>
    );
  }

  if (node.resourceIcon?.type === 'asset') {
    return <WorkspaceAssetIcon path={node.resourceIcon.value} />;
  }

  return (
    <Box
      boxSize={boxSize}
      borderRadius="md"
      bg={
        compact
          ? 'rgba(255,255,255,0.04)'
          : isActive
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(255,255,255,0.04)'
      }
      display="flex"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
    >
      <Icon as={icon} boxSize={iconSize} color={isActive ? 'blue.200' : 'inherit'} />
    </Box>
  );
};

const WorkspaceAssetIcon: React.FC<{ path: string }> = ({ path }) => {
  const [src, setSrc] = React.useState<string | null>(null);

  React.useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;

    const loadIcon = async () => {
      try {
        const blob = await fileSystem.loadAsset(path);
        objectUrl = URL.createObjectURL(blob);
        if (!disposed) {
          setSrc(objectUrl);
        }
      } catch {
        if (!disposed) {
          setSrc(null);
        }
      }
    };

    void loadIcon();

    return () => {
      disposed = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [path]);

  if (!src) {
    return (
      <Box
        boxSize="20px"
        borderRadius="md"
        bg="rgba(255,255,255,0.04)"
        display="flex"
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
      >
        <Icon as={FiPackage} boxSize={3} flexShrink={0} />
      </Box>
    );
  }

  return (
    <Box boxSize="20px" borderRadius="md" bg="rgba(255,255,255,0.04)" p="2px" flexShrink={0}>
      <Image src={src} boxSize="full" objectFit="cover" borderRadius="md" />
    </Box>
  );
};

function getActiveId(node: WorkspaceTreeNode): string | null {
  if (!node.document) return null;
  switch (node.document.kind) {
    case 'location':
      return `location:${node.document.mapId}`;
    case 'tileset':
      return `tileset:${node.document.tilesetId}`;
    case 'settings':
      return 'settings';
    case 'configuration':
      return 'config';
    case 'actor':
      return `actor:${node.document.actorId}`;
    case 'entity':
      return `entity:${node.document.entityTypeId}`;
    case 'item':
      return `item:${node.document.itemId}`;
    case 'dialogue':
      return `dialogue:${node.document.dialogueId}`;
    case 'variable':
      return `variable:${node.document.variableKey}`;
    case 'entities':
    case 'actors':
    case 'items':
    case 'dialogues':
    case 'scripting':
      return node.document.kind;
    default:
      return null;
  }
}

function getNodeAccent(node: WorkspaceTreeNode): WorkspaceAccent | null {
  const resourceKind = node.resourceKind ?? getDocumentResourceKind(node.document);
  if (!resourceKind) return null;
  return accentByResourceKind[resourceKind as CreatableKind] ?? null;
}

function canQuickEdit(document: WorkspaceDocument): boolean {
  return (
    document.kind === 'location' ||
    document.kind === 'tileset' ||
    document.kind === 'actor' ||
    document.kind === 'entity' ||
    document.kind === 'item' ||
    document.kind === 'dialogue'
  );
}

function canQuickDelete(document: WorkspaceDocument): boolean {
  return (
    document.kind === 'location' ||
    document.kind === 'tileset' ||
    document.kind === 'actor' ||
    document.kind === 'entity' ||
    document.kind === 'item' ||
    document.kind === 'dialogue'
  );
}

function getDocumentResourceKind(document: WorkspaceDocument | undefined): CreatableKind | null {
  if (!document) return null;
  switch (document.kind) {
    case 'location':
    case 'tileset':
    case 'actor':
    case 'entity':
    case 'item':
    case 'dialogue':
      return document.kind;
    default:
      return null;
  }
}

export default WorkspaceExplorer;
