import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Box, Divider, Portal, Text, VStack } from '@chakra-ui/react';
import { CreateItemDialog } from '../common/CreateItemDialog';
import {
  canCreateResourceKind,
  normalizeFolderPath,
  renameResourceFolder,
  setResourceFolderPath,
} from '../../lib/resourceAdapters';
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
              <MenuItem key={item.key} onClick={() => void item.onClick()} color={item.color}>
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
          onOpenDocument(
            { kind: 'actor', actorId: id, label: name, saveUnitId: `actor:${id}` },
            { pin: true },
          );
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
          onOpenDocument(
            { kind: 'entity', entityTypeId: id, label: name, saveUnitId: 'configuration' },
            { pin: true },
          );
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
          onOpenDocument(
            { kind: 'item', itemId: id, label: name, saveUnitId: `item:${id}` },
            { pin: true },
          );
          break;
      }

      onClose();
    },
    [folderPath, kind, onClose, onOpenDocument, store],
  );

  return (
    <CreateItemDialog
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
  const canRenameLeaf = Boolean(node.document && isRenameableLeaf(node.document));
  const canRenameFolder = Boolean(node.kind === 'folder' && resourceKind && folderPathForNode);
  const canDeleteLeaf = Boolean(node.document && isDeletableLeaf(node.document));
  const canMoveLeaf = Boolean(node.document && resourceKind);
  const canReveal = Boolean(node.document && isRevealableLeaf(node.document));

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
      onClick: () => {
        handleReveal(node);
        onClose();
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

  const store = useEditorStore.getState();
  switch (node.document.kind) {
    case 'actor':
      await store.updateActor(node.document.actorId, { name: nextName });
      break;
    case 'entity':
      await store.updateEntityType(node.document.entityTypeId, { displayName: nextName });
      break;
    case 'item':
      await store.updateItem(node.document.itemId, { name: nextName });
      break;
    case 'tileset':
      await store.updateTileset(node.document.tilesetId, { name: nextName });
      break;
    default:
      break;
  }
}

async function handleDelete(node: WorkspaceTreeNode): Promise<void> {
  if (!node.document) return;
  if (!confirm(`Delete "${node.label}"?`)) return;

  const store = useEditorStore.getState();
  switch (node.document.kind) {
    case 'actor':
      await store.deleteActor(node.document.actorId);
      break;
    case 'entity':
      await store.deleteEntityType(node.document.entityTypeId);
      break;
    case 'item':
      await store.deleteItem(node.document.itemId);
      break;
    case 'tileset':
      await store.deleteTileset(node.document.tilesetId);
      break;
    case 'location':
      await store.deleteMap(node.document.mapId);
      break;
    default:
      break;
  }
}

function handleReveal(node: WorkspaceTreeNode): void {
  if (!node.document) return;

  const projectPath = useEditorStore.getState().projectPath;
  if (!projectPath || !('ipcRenderer' in window)) return;

  let relativePath = '';
  switch (node.document.kind) {
    case 'actor':
      relativePath = `actors/${node.document.actorId}.actor.json`;
      break;
    case 'item':
      relativePath = `items/${node.document.itemId}.vitm`;
      break;
    case 'location':
      relativePath = `maps/${node.document.mapId}.vmap`;
      break;
    case 'tileset':
      relativePath = `tilesets/${node.document.tilesetId}.vts`;
      break;
    case 'dialogue':
      relativePath = `dialogues/${node.document.dialogueId}.dialogue.json`;
      break;
    default:
      break;
  }

  if (relativePath) {
    void window.ipcRenderer.invoke('app:reveal-in-explorer', { projectPath, relativePath });
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
  const state = useEditorStore.getState();

  switch (document.kind) {
    case 'actor':
      return state.actors.find((actor) => actor.id === document.actorId)?.folderPath ?? '';
    case 'entity':
      return (
        state.entityTypes.find((entityType) => entityType.id === document.entityTypeId)
          ?.folderPath ?? ''
      );
    case 'item':
      return state.items.find((item) => item.id === document.itemId)?.folderPath ?? '';
    case 'location':
      return state.maps.find((map) => map.id === document.mapId)?.folderPath ?? '';
    case 'tileset':
      return state.tilesets.get(document.tilesetId)?.folderPath ?? '';
    case 'dialogue':
      return (
        state.dialogueIndex?.dialogues.find((dialogue) => dialogue.id === document.dialogueId)
          ?.folderPath ?? ''
      );
    case 'variable':
      return (
        state.gameVariables.find((variable) => variable.key === document.variableKey)?.folderPath ??
        ''
      );
    default:
      return '';
  }
}

function getDocumentResourceId(document: WorkspaceDocument | undefined): string {
  if (!document) return '';

  switch (document.kind) {
    case 'actor':
      return document.actorId;
    case 'entity':
      return document.entityTypeId;
    case 'item':
      return document.itemId;
    case 'location':
      return document.mapId;
    case 'tileset':
      return document.tilesetId;
    case 'dialogue':
      return document.dialogueId;
    case 'variable':
      return document.variableKey;
    default:
      return '';
  }
}

function isRenameableLeaf(document: WorkspaceDocument): boolean {
  return (
    document.kind === 'actor' ||
    document.kind === 'entity' ||
    document.kind === 'item' ||
    document.kind === 'tileset'
  );
}

function isDeletableLeaf(document: WorkspaceDocument): boolean {
  return (
    document.kind === 'actor' ||
    document.kind === 'entity' ||
    document.kind === 'item' ||
    document.kind === 'tileset' ||
    document.kind === 'location'
  );
}

function isRevealableLeaf(document: WorkspaceDocument): boolean {
  return (
    document.kind === 'actor' ||
    document.kind === 'item' ||
    document.kind === 'location' ||
    document.kind === 'tileset' ||
    document.kind === 'dialogue'
  );
}

function kindLabel(kind: ResourceKind): string {
  switch (kind) {
    case 'actor':
      return 'Actor';
    case 'entity':
      return 'Entity';
    case 'item':
      return 'Item';
    case 'location':
      return 'Location';
    case 'tileset':
      return 'Tileset';
    case 'dialogue':
      return 'Dialogue';
    case 'variable':
      return 'Variable';
  }
}
