import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Box, Divider, Portal, Text, VStack, useToast } from '@chakra-ui/react';
import { CreateItemDialog } from '../common/CreateItemDialog';
import {
  canCreateResourceKind,
  normalizeFolderPath,
  renameResourceFolder,
  setResourceFolderPath,
} from '../../lib/resourceAdapters';
import {
  canDeleteEditorResourceDocument,
  canRenameEditorResourceDocument,
  canRevealEditorResourceDocument,
  createEditorResourceDocument,
  deleteEditorResourceDocument,
  getEditorResourceFolderPath,
  getEditorResourceFileExplorerPath,
  getEditorResourceDocumentId,
  getEditorResourceTypeLabel,
  renameEditorResourceDocument,
} from '../../lib/editorResourceTypes';
import { useEditorStore } from '../../store/useEditorStore';
import { ResourceKind, WorkspaceDocument, WorkspaceTreeNode } from '../../types/workspace';

export interface ContextMenuState {
  node: WorkspaceTreeNode;
  x: number;
  y: number;
}

interface WorkspaceContextMenuProps {
  state: ContextMenuState | null;
  onClose: () => void;
  onOpenDocument: (document: WorkspaceDocument, options?: { pin?: boolean }) => void;
  onCreateResource: (
    kind: 'location' | 'tileset' | 'actor' | 'entity' | 'item' | 'dialogue',
    folderPath: string,
  ) => void;
}

export const WorkspaceContextMenu: React.FC<WorkspaceContextMenuProps> = ({
  state,
  onClose,
  onOpenDocument,
  onCreateResource,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (!state) return;

    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [state, onClose]);

  const menuItems = useMemo(() => {
    if (!state) return [];
    return buildMenuItems(state.node, onOpenDocument, onClose, onCreateResource);
  }, [onClose, onCreateResource, onOpenDocument, state]);

  if (!state || menuItems.length === 0) return null;

  return (
    <Portal>
      <Box
        ref={menuRef}
        position="fixed"
        top={`${state.y}px`}
        left={`${state.x}px`}
        zIndex={9999}
        bg="editorPanelBg"
        border="1px"
        borderColor="editorShellBorder"
        borderRadius="md"
        boxShadow="xl"
        minW="220px"
        py={1}
        onContextMenu={(event) => event.preventDefault()}
      >
        <VStack align="stretch" spacing={0}>
          {menuItems.map((item) =>
            item.kind === 'divider' ? (
              <Divider key={item.key} borderColor="whiteAlpha.100" />
            ) : (
              <MenuItem
                key={item.key}
                onClick={() => {
                  void Promise.resolve().then(item.onClick).catch((error: unknown) => {
                    toast({
                      title: `${item.label} failed`,
                      description: error instanceof Error ? error.message : String(error),
                      status: 'error',
                      isClosable: true,
                    });
                  });
                }}
                color={item.color}
              >
                {item.label}
              </MenuItem>
            ),
          )}
        </VStack>
      </Box>
    </Portal>
  );
};

export const CreateNewResourceDialog: React.FC<{
  kind: 'actor' | 'entity' | 'item';
  folderPath: string;
  onClose: () => void;
  onOpenDocument: (document: WorkspaceDocument, options?: { pin?: boolean }) => void;
}> = ({ kind, folderPath, onClose, onOpenDocument }) => {
  const store = useEditorStore.getState();

  const existingIds = React.useMemo(() => {
    switch (kind) {
      case 'actor':
        return useEditorStore.getState().actors.map((actor) => actor.id);
      case 'entity':
        return useEditorStore.getState().entityTypes.map((entityType) => entityType.id);
      case 'item':
        return useEditorStore.getState().items.map((item) => item.id);
    }
  }, [kind]);

  const handleSubmit = useCallback(
    async ({ id, name }: { id: string; name: string }) => {
      switch (kind) {
        case 'actor':
          await store.addActor({ id, name, icon: 'GiPerson', emotions: [], folderPath });
          onOpenDocument(createEditorResourceDocument({ type: 'actor', id, name }), {
            pin: true,
          });
          break;
        case 'entity':
          await store.addEntityType({
            id,
            displayName: name,
            category: 'object',
            placeholderColor: '#888888',
            properties: [],
            folderPath,
          });
          onOpenDocument(createEditorResourceDocument({ type: 'entity', id, name }), {
            pin: true,
          });
          break;
        case 'item':
          await store.addItem({
            id,
            name,
            category: '',
            icon: '',
            description: '',
            maxStackSize: 99,
            folderPath,
          });
          onOpenDocument(createEditorResourceDocument({ type: 'item', id, name }), {
            pin: true,
          });
          break;
      }

      onClose();
    },
    [folderPath, kind, onClose, onOpenDocument, store],
  );

  return (
    <CreateItemDialog
      idPrefix={useEditorStore.getState().project?.idPrefix ?? 'base'}
      isOpen
      title={`New ${kindLabel(kind)}`}
      itemType={kindLabel(kind)}
      existingIds={existingIds}
      onClose={onClose}
      onSubmit={handleSubmit}
    />
  );
};

type MenuDefinition =
  | {
      kind: 'item';
      key: string;
      label: string;
      color?: string;
      onClick: () => void | Promise<void>;
    }
  | {
      kind: 'divider';
      key: string;
    };

function buildMenuItems(
  node: WorkspaceTreeNode,
  onOpenDocument: (document: WorkspaceDocument, options?: { pin?: boolean }) => void,
  onClose: () => void,
  onCreateResource: (
    kind: 'location' | 'tileset' | 'actor' | 'entity' | 'item' | 'dialogue',
    folderPath: string,
  ) => void,
): MenuDefinition[] {
  const items: MenuDefinition[] = [];
  const resourceKind = node.resourceKind ?? null;
  const folderPathForNode = getNodeFolderPath(node);
  const canCreate = Boolean(resourceKind && canCreateResourceKind(resourceKind));
  const canRenameLeaf = canRenameEditorResourceDocument(node.document);
  const canRenameFolder = Boolean(node.kind === 'folder' && resourceKind && folderPathForNode);
  const canDeleteLeaf = canDeleteEditorResourceDocument(node.document);
  const canMoveLeaf = Boolean(node.document && resourceKind);
  const canReveal = canRevealEditorResourceDocument(node.document);

  if ((node.kind === 'group' || node.kind === 'folder') && canCreate) {
    items.push({
      kind: 'item',
      key: 'create',
      label: `New ${kindLabel(resourceKind!)}...`,
      onClick: () => {
        onCreateResource(
          resourceKind as 'location' | 'tileset' | 'actor' | 'entity' | 'item' | 'dialogue',
          folderPathForNode,
        );
        onClose();
      },
    });
  }

  if (node.document) {
    items.push({
      kind: 'item',
      key: 'open',
      label: 'Open',
      onClick: () => {
        onOpenDocument(node.document!, { pin: true });
        onClose();
      },
    });
  }

  if (canRenameLeaf || canRenameFolder) {
    items.push({
      kind: 'item',
      key: 'rename',
      label: node.kind === 'folder' ? 'Rename Folder' : 'Rename',
      onClick: async () => {
        await handleRename(node, resourceKind, folderPathForNode);
        onClose();
      },
    });
  }

  if (canDeleteLeaf) {
    items.push({
      kind: 'item',
      key: 'delete',
      label: 'Delete',
      color: 'red.300',
      onClick: async () => {
        await handleDelete(node);
        onClose();
      },
    });
  }

  if (canMoveLeaf) {
    items.push({
      kind: 'item',
      key: 'move',
      label: 'Move to Folder...',
      onClick: async () => {
        if (!node.document || !resourceKind) return;
        const target = prompt('Move to folder (empty = root):', folderPathForNode);
        if (target === null) return;
        const id = getDocumentResourceId(node.document);
        if (!id) return;
        await setResourceFolderPath(resourceKind, id, target);
        onClose();
      },
    });
  }

  const hasSecondaryGroup = canReveal || Boolean(node.document);
  if (items.length > 0 && hasSecondaryGroup) {
    items.push({ kind: 'divider', key: 'divider:secondary' });
  }

  if (canReveal) {
    items.push({
      kind: 'item',
      key: 'reveal',
      label: 'Reveal in File Explorer',
      onClick: async () => {
        onClose();
        await handleReveal(node);
      },
    });
  }

  if (node.document) {
    items.push({
      kind: 'item',
      key: 'copy-id',
      label: 'Copy ID',
      onClick: () => {
        const id = getDocumentResourceId(node.document);
        if (id) {
          void navigator.clipboard.writeText(id);
        }
        onClose();
      },
    });
  }

  return items;
}

async function handleRename(
  node: WorkspaceTreeNode,
  resourceKind: ResourceKind | null,
  folderPathForNode: string,
): Promise<void> {
  if (node.kind === 'folder' && resourceKind) {
    const currentFolderPath = folderPathForNode;
    const currentName = currentFolderPath.split('/').pop() ?? currentFolderPath;
    const nextName = prompt('Rename folder to:', currentName)?.trim();
    if (!nextName || nextName === currentName) return;

    const parentPath = currentFolderPath.split('/').slice(0, -1).join('/');
    const nextFolderPath = normalizeFolderPath(parentPath ? `${parentPath}/${nextName}` : nextName);
    await renameResourceFolder(resourceKind, currentFolderPath, nextFolderPath);
    return;
  }

  if (!node.document) return;

  const nextName = prompt('Rename to:', node.label)?.trim();
  if (!nextName || nextName === node.label) return;

  await renameEditorResourceDocument(node.document, nextName);
}

async function handleDelete(node: WorkspaceTreeNode): Promise<void> {
  if (!node.document) return;
  if (!confirm(`Delete "${node.label}"?`)) return;
  await deleteEditorResourceDocument(node.document);
}

async function handleReveal(node: WorkspaceTreeNode): Promise<void> {
  if (!node.document) return;

  const projectPath = useEditorStore.getState().projectPath;
  if (!projectPath || !('ipcRenderer' in window)) return;

  const relativePath = getEditorResourceFileExplorerPath(node.document);

  if (relativePath) {
    await window.ipcRenderer.invoke('app:reveal-in-explorer', { projectPath, relativePath });
  }
}

const MenuItem: React.FC<{ onClick: () => void; color?: string; children: React.ReactNode }> = ({
  onClick,
  color,
  children,
}) => (
  <Box
    px={3}
    py={1.5}
    cursor="pointer"
    color={color ?? 'editorText'}
    fontSize="sm"
    _hover={{ bg: 'editorHoverBg' }}
    onClick={onClick}
  >
    <Text>{children}</Text>
  </Box>
);

function getNodeFolderPath(node: WorkspaceTreeNode): string {
  if (node.kind === 'folder') {
    return normalizeFolderPath(node.id.replace(/^folder:[^:]+:/, ''));
  }
  if (node.kind === 'leaf' && node.document) {
    return normalizeFolderPath(getLeafFolderPath(node.document));
  }
  return '';
}

function getLeafFolderPath(document: WorkspaceDocument): string {
  return getEditorResourceFolderPath(document);
}

function getDocumentResourceId(document: WorkspaceDocument | undefined): string {
  return getEditorResourceDocumentId(document) ?? '';
}

function kindLabel(kind: ResourceKind): string {
  return getEditorResourceTypeLabel(kind);
}
