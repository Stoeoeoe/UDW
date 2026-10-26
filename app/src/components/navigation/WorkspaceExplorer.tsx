import React from 'react';
import { AddIcon } from '@chakra-ui/icons';
import { Box, HStack, Icon, IconButton, Text, VStack } from '@chakra-ui/react';
import { ContextMenuState, WorkspaceContextMenu } from './WorkspaceContextMenu';
import {
  FiBox,
  FiFilm,
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
import { useSaveStore } from '../../lib/saveManager';
import { SectionLabel } from '../common/Typography.tsx';
import { supportsPreviewTab, getDocumentSaveUnitId } from '../../store/useWorkspaceStore';
import {
  canDeleteEditorResourceDocument,
  canEditMetadataForResourceDocument,
  deleteEditorResourceDocument,
  getEditorResourceDocumentTabId,
  getNodeAccent,
  getDocumentResourceKind,
  NodeAccent,
} from '../../lib/editorResourceTypes';
import { canCreateResourceKind } from '../../lib/resourceAdapters';
import { WorkspaceNodeVisual } from './WorkspaceNodeVisual';
import { WorkspaceCreateDialog, CreateDialogState } from './WorkspaceCreateDialog';
import { WorkspaceEditDialog, EditDialogState } from './WorkspaceEditDialog';

interface WorkspaceExplorerProps {
  nodes: WorkspaceTreeNode[];
  expandedNodeIds: string[];
  activeTabId: string | null;
  onToggleNode: (nodeId: string) => void;
  onOpenNode: (node: WorkspaceTreeNode, options?: { pin?: boolean }) => void;
  headerAction?: React.ReactNode;
  onOpenDocument?: (document: WorkspaceDocument, options?: { pin?: boolean }) => void;
}

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
    case 'characters':
      return FiUsers;
    case 'items':
      return FiPackage;
    case 'cutscene':
      return FiFilm;
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

function getNodeAccentFromNode(node: WorkspaceTreeNode): NodeAccent | null {
  const resourceKind = node.resourceKind ?? getDocumentResourceKind(node.document);
  return getNodeAccent(resourceKind);
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

  const handleCreateResource = React.useCallback(
    (kind: NonNullable<WorkspaceTreeNode['resourceKind']>, folderPath: string) => {
      setCreateDialog({ kind, folderPath });
    },
    [],
  );

  const handleEditResource = React.useCallback((node: WorkspaceTreeNode) => {
    if (!node.document) return;
    if (!canEditMetadataForResourceDocument(node.document)) return;
    setEditDialog({ document: node.document });
  }, []);

  const handleDeleteResource = React.useCallback(async (node: WorkspaceTreeNode) => {
    if (!node.document) return;
    if (!canDeleteEditorResourceDocument(node.document)) return;
    if (!confirm(`Delete "${node.label}"?`)) return;
    await deleteEditorResourceDocument(node.document);
  }, []);

  const sharedNodeProps = {
    expandedNodeIds,
    activeTabId,
    onToggleNode,
    onOpenNode,
    onContextMenu: handleContextMenu,
    onCreateResource: handleCreateResource,
    onEditResource: handleEditResource,
    onDeleteResource: handleDeleteResource,
  };

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
              depth={0}
              accent={getNodeAccentFromNode(node)}
              {...sharedNodeProps}
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
                depth={0}
                accent={null}
                {...sharedNodeProps}
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
  accent: NodeAccent | null;
  onToggleNode: (nodeId: string) => void;
  onOpenNode: (node: WorkspaceTreeNode, options?: { pin?: boolean }) => void;
  onContextMenu: (node: WorkspaceTreeNode, event: React.MouseEvent) => void;
  onCreateResource: (
    kind: NonNullable<WorkspaceTreeNode['resourceKind']>,
    folderPath: string,
  ) => void;
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
  const isActive = Boolean(node.document) && activeTabId === getActiveTabId(node);
  const isDirty = Boolean(node.document && saveUnits[getDocumentSaveUnitId(node.document)]?.dirty);
  const paddingLeft = 2 + depth * 4;
  const isUtilityLeaf =
    depth === 0 &&
    node.kind === 'leaf' &&
    (node.document?.kind === 'scripting' ||
      node.document?.kind === 'settings' ||
      node.document?.kind === 'configuration');
  const inheritedAccent = accent ?? getNodeAccentFromNode(node);

  const childProps = {
    expandedNodeIds,
    activeTabId,
    onToggleNode,
    onOpenNode,
    onContextMenu,
    onCreateResource,
    onEditResource,
    onDeleteResource,
  };

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
                onCreateResource(node.resourceKind!, '');
              }}
            />
          )}
        </HStack>
        {isExpanded &&
          node.children?.map((child) => (
            <Box key={child.id} mt={1}>
              <WorkspaceExplorerNode
                node={child}
                depth={depth + 1}
                accent={inheritedAccent}
                {...childProps}
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
                onCreateResource(node.resourceKind!, folderPath);
              }}
            />
          )}
        </HStack>
        {isExpanded &&
          node.children?.map((child) => (
            <Box key={child.id}>
              <WorkspaceExplorerNode
                node={child}
                depth={depth + 1}
                accent={inheritedAccent}
                {...childProps}
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
      {node.document &&
        (canEditMetadataForResourceDocument(node.document) ||
          canDeleteEditorResourceDocument(node.document)) && (
          <HStack spacing={1} opacity={0} _groupHover={{ opacity: 1 }} flexShrink={0}>
            {canEditMetadataForResourceDocument(node.document) && (
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
            {canDeleteEditorResourceDocument(node.document) && (
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

function getActiveTabId(node: WorkspaceTreeNode): string | null {
  if (!node.document) return null;
  return getEditorResourceDocumentTabId(node.document) ?? getFallbackTabId(node.document);
}

function getFallbackTabId(document: WorkspaceDocument): string | null {
  switch (document.kind) {
    case 'settings':
      return 'settings';
    case 'configuration':
      return 'config';
    case 'entities':
    case 'characters':
    case 'items':
    case 'dialogues':
    case 'cutscenes':
    case 'scripting':
      return document.kind;
    default:
      return null;
  }
}

export default WorkspaceExplorer;
