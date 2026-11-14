import { resourceFileKey, resourceRegistry } from './resourceRegistry';
import { fileSystem } from '../lib/fileSystem';
import { useEditorStore } from '../store/useEditorStore';
import { WorkspaceDocument } from '../types/workspace';
import {
  EditorResourceDescriptor,
  EditorResourceMetadataField,
  EditorResourceTypeDefinition,
  EditorResourceTypeId,
  editorResourceTypeIds,
} from '../types/editorResource';

export const editorResourceTypes: Record<EditorResourceTypeId, EditorResourceTypeDefinition> = {
  location: {
    id: 'location',
    documentDefinition: resourceRegistry.location,
    label: 'Location',
    collectionLabel: 'Locations',
    editorIcon: 'locations',
    createFlow: 'location',
    metadataFlow: 'location',
    saveUnitPrefix: 'location:',
    accentColor: 'blue.300',
    tint: 'rgba(59,130,246,0.14)',
    hoverTint: 'rgba(59,130,246,0.2)',
    rowGradient: 'linear(to-r, rgba(59,130,246,0.18), rgba(59,130,246,0.03) 72%, transparent)',
    headerGradient: 'linear(to-r, rgba(59,130,246,0.14), rgba(59,130,246,0.04) 68%, transparent)',
    canCreate: true,
    canRename: false,
    canEditMetadata: true,
    canDelete: true,
    canRevealInFileExplorer: true,
    fileExplorerPath: (resourceId) =>
      `${resourceRegistry.location.folder}/${fileSystem.resolveFilename(resourceRegistry.location.folder, resourceFileKey('location', resourceId))}`,
    deleteResource: async (resourceId) => {
      await useEditorStore.getState().deleteMap(resourceId);
    },
    getFolderPath: (resourceId) =>
      useEditorStore.getState().maps.find((map) => map.id === resourceId)?.folderPath ?? '',
  },
  tileset: {
    id: 'tileset',
    documentDefinition: resourceRegistry.tileset,
    label: 'Tileset',
    collectionLabel: 'Tilesets',
    editorIcon: 'tilesets',
    createFlow: 'tileset',
    metadataFlow: 'tileset',
    saveUnitPrefix: 'tileset:',
    accentColor: 'cyan.300',
    tint: 'rgba(34,211,238,0.12)',
    hoverTint: 'rgba(34,211,238,0.18)',
    rowGradient: 'linear(to-r, rgba(34,211,238,0.16), rgba(34,211,238,0.03) 72%, transparent)',
    headerGradient: 'linear(to-r, rgba(34,211,238,0.12), rgba(34,211,238,0.035) 68%, transparent)',
    canCreate: true,
    canRename: true,
    canEditMetadata: true,
    canDelete: true,
    canRevealInFileExplorer: true,
    fileExplorerPath: (resourceId) =>
      `${resourceRegistry.tileset.folder}/${fileSystem.resolveFilename(resourceRegistry.tileset.folder, resourceFileKey('tileset', resourceId))}`,
    renameResource: async (resourceId, name) => {
      await useEditorStore.getState().updateTileset(resourceId, { name });
    },
    deleteResource: async (resourceId) => {
      await useEditorStore.getState().deleteTileset(resourceId);
    },
    getFolderPath: (resourceId) =>
      useEditorStore.getState().tilesets.get(resourceId)?.folderPath ?? '',
  },
  character: {
    id: 'character',
    documentDefinition: resourceRegistry.character,
    label: 'Character',
    collectionLabel: 'Characters',
    editorIcon: 'characters',
    createFlow: 'simple',
    metadataFlow: 'character',
    metadataTitle: 'Edit Character',
    getMetadataFields: () => [{ key: 'name', label: 'Name', type: 'text' }],
    getMetadataInitialValues: (resourceId) => {
      const character = useEditorStore
        .getState()
        .characters.find((entry) => entry.id === resourceId);
      if (!character) return null;
      return { name: character.name };
    },
    submitMetadata: async (resourceId, values) => {
      const character = useEditorStore
        .getState()
        .characters.find((entry) => entry.id === resourceId);
      if (!character) return;
      await useEditorStore.getState().updateCharacter(resourceId, {
        name: String(values.name ?? '').trim() || character.name,
      });
    },
    saveUnitPrefix: 'character:',
    accentColor: 'orange.300',
    tint: 'rgba(251,146,60,0.12)',
    hoverTint: 'rgba(251,146,60,0.18)',
    rowGradient: 'linear(to-r, rgba(251,146,60,0.16), rgba(251,146,60,0.03) 72%, transparent)',
    headerGradient: 'linear(to-r, rgba(251,146,60,0.12), rgba(251,146,60,0.035) 68%, transparent)',
    canCreate: true,
    canRename: true,
    canEditMetadata: true,
    canDelete: true,
    canRevealInFileExplorer: true,
    fileExplorerPath: (resourceId) =>
      `${resourceRegistry.character.folder}/${fileSystem.resolveFilename(resourceRegistry.character.folder, resourceFileKey('character', resourceId))}`,
    renameResource: async (resourceId, name) => {
      await useEditorStore.getState().updateCharacter(resourceId, { name });
    },
    deleteResource: async (resourceId) => {
      await useEditorStore.getState().deleteCharacter(resourceId);
    },
    getFolderPath: (resourceId) =>
      useEditorStore.getState().characters.find((character) => character.id === resourceId)
        ?.folderPath ?? '',
  },
  entity: {
    id: 'entity',
    documentDefinition: resourceRegistry.entity,
    label: 'Entity',
    collectionLabel: 'Entities',
    editorIcon: 'entities',
    createFlow: 'simple',
    metadataFlow: 'entity',
    metadataTitle: 'Edit Entity Type',
    getMetadataFields: () => [
      { key: 'displayName', label: 'Name', type: 'text' },
      {
        key: 'category',
        label: 'Category',
        type: 'select',
        width: 'half',
        options: [
          { label: 'NPC', value: 'npc' },
          { label: 'Object', value: 'object' },
          { label: 'Trigger', value: 'trigger' },
          { label: 'Spawn', value: 'spawn' },
          { label: 'Transition', value: 'transition' },
          { label: 'Decoration', value: 'decoration' },
        ],
      },
      { key: 'group', label: 'Group', type: 'text', width: 'half', placeholder: 'Ungrouped' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'icon', label: 'Icon', type: 'icon', width: 'half' },
      { key: 'placeholderColor', label: 'Color', type: 'color', width: 'half' },
    ],
    getMetadataInitialValues: (resourceId) => {
      const entity = useEditorStore.getState().entityTypes.find((entry) => entry.id === resourceId);
      if (!entity) return null;
      return {
        displayName: entity.displayName,
        category: entity.category,
        group: entity.group ?? '',
        description: entity.description ?? '',
        icon: entity.icon ?? 'GiYinYang',
        placeholderColor: entity.placeholderColor,
      };
    },
    submitMetadata: async (resourceId, values) => {
      const entity = useEditorStore.getState().entityTypes.find((entry) => entry.id === resourceId);
      if (!entity) return;
      await useEditorStore.getState().updateEntityType(resourceId, {
        displayName: String(values.displayName ?? '').trim() || entity.displayName,
        category: String(values.category ?? entity.category) as typeof entity.category,
        group: String(values.group ?? '').trim() || undefined,
        description: String(values.description ?? '').trim() || undefined,
        icon: String(values.icon ?? ''),
        placeholderColor: String(values.placeholderColor ?? entity.placeholderColor),
      });
    },
    saveUnitPrefix: 'entity:',
    accentColor: 'green.300',
    tint: 'rgba(74,222,128,0.12)',
    hoverTint: 'rgba(74,222,128,0.18)',
    rowGradient: 'linear(to-r, rgba(74,222,128,0.16), rgba(74,222,128,0.03) 72%, transparent)',
    headerGradient: 'linear(to-r, rgba(74,222,128,0.12), rgba(74,222,128,0.035) 68%, transparent)',
    canCreate: true,
    canRename: true,
    canEditMetadata: true,
    canDelete: true,
    canRevealInFileExplorer: false,
    renameResource: async (resourceId, name) => {
      await useEditorStore.getState().updateEntityType(resourceId, { displayName: name });
    },
    deleteResource: async (resourceId) => {
      await useEditorStore.getState().deleteEntityType(resourceId);
    },
    getFolderPath: (resourceId) =>
      useEditorStore.getState().entityTypes.find((entity) => entity.id === resourceId)
        ?.folderPath ?? '',
  },
  item: {
    id: 'item',
    documentDefinition: resourceRegistry.item,
    label: 'Item',
    collectionLabel: 'Items',
    editorIcon: 'items',
    createFlow: 'simple',
    metadataFlow: 'item',
    metadataTitle: 'Edit Item',
    getMetadataFields: () => {
      const itemClasses = useEditorStore.getState().itemClasses;
      const fields: EditorResourceMetadataField[] = [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'category', label: 'Category', type: 'text' },
      ];

      if (itemClasses.length > 0) {
        fields.push({
          key: 'classId',
          label: 'Item Class',
          type: 'select',
          options: [
            { label: '-- None --', value: '' },
            ...itemClasses.map((itemClass) => ({
              label: itemClass.name,
              value: itemClass.id,
            })),
          ],
        });
      }

      fields.push(
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'icon', label: 'Icon Asset', type: 'text' },
        { key: 'maxStackSize', label: 'Max Stack Size', type: 'number', min: 1 },
      );

      return fields;
    },
    getMetadataInitialValues: (resourceId) => {
      const item = useEditorStore.getState().items.find((entry) => entry.id === resourceId);
      if (!item) return null;
      return {
        name: item.name,
        category: item.category,
        description: item.description,
        icon: item.icon,
        maxStackSize: item.maxStackSize,
        classId: item.classId ?? '',
      };
    },
    submitMetadata: async (resourceId, values) => {
      const item = useEditorStore.getState().items.find((entry) => entry.id === resourceId);
      if (!item) return;
      await useEditorStore.getState().updateItem(resourceId, {
        name: String(values.name ?? '').trim() || item.name,
        category: String(values.category ?? ''),
        description: String(values.description ?? ''),
        icon: String(values.icon ?? ''),
        maxStackSize: Number(values.maxStackSize ?? item.maxStackSize) || 1,
        classId: String(values.classId ?? '').trim() || undefined,
      });
    },
    saveUnitPrefix: 'item:',
    accentColor: 'purple.300',
    tint: 'rgba(196,181,253,0.12)',
    hoverTint: 'rgba(196,181,253,0.18)',
    rowGradient: 'linear(to-r, rgba(196,181,253,0.16), rgba(196,181,253,0.03) 72%, transparent)',
    headerGradient:
      'linear(to-r, rgba(196,181,253,0.12), rgba(196,181,253,0.035) 68%, transparent)',
    canCreate: true,
    canRename: true,
    canEditMetadata: true,
    canDelete: true,
    canRevealInFileExplorer: true,
    fileExplorerPath: (resourceId) =>
      `${resourceRegistry.item.folder}/${fileSystem.resolveFilename(resourceRegistry.item.folder, resourceFileKey('item', resourceId))}`,
    renameResource: async (resourceId, name) => {
      await useEditorStore.getState().updateItem(resourceId, { name });
    },
    deleteResource: async (resourceId) => {
      await useEditorStore.getState().deleteItem(resourceId);
    },
    getFolderPath: (resourceId) =>
      useEditorStore.getState().items.find((item) => item.id === resourceId)?.folderPath ?? '',
  },
  shop: {
    id: 'shop',
    documentDefinition: resourceRegistry.shop,
    label: 'Shop',
    collectionLabel: 'Shops',
    editorIcon: 'items',
    createFlow: 'simple',
    metadataFlow: 'none',
    saveUnitPrefix: 'shop:',
    accentColor: 'orange.300',
    tint: 'rgba(253,186,116,0.12)',
    hoverTint: 'rgba(253,186,116,0.18)',
    rowGradient: 'linear(to-r, rgba(253,186,116,0.16), rgba(253,186,116,0.03) 72%, transparent)',
    headerGradient:
      'linear(to-r, rgba(253,186,116,0.12), rgba(253,186,116,0.035) 68%, transparent)',
    canCreate: true,
    canRename: true,
    canEditMetadata: false,
    canDelete: true,
    canRevealInFileExplorer: true,
    fileExplorerPath: (resourceId) =>
      `${resourceRegistry.shop.folder}/${fileSystem.resolveFilename(resourceRegistry.shop.folder, resourceFileKey('shop', resourceId))}`,
    renameResource: async (resourceId, name) => {
      await useEditorStore.getState().updateShop(resourceId, { name });
    },
    deleteResource: async (resourceId) => {
      await useEditorStore.getState().deleteShop(resourceId);
    },
    getFolderPath: (resourceId) =>
      useEditorStore.getState().shops.find((shop) => shop.id === resourceId)
        ?.folderPath ?? '',
  },
  routine: {
    id: 'routine',
    documentDefinition: resourceRegistry.routine,
    label: 'Routine',
    collectionLabel: 'Routines',
    editorIcon: 'routines',
    createFlow: 'routine',
    metadataFlow: 'none',
    saveUnitPrefix: 'routine:',
    accentColor: 'teal.300',
    tint: 'rgba(79,209,197,0.12)',
    hoverTint: 'rgba(79,209,197,0.18)',
    rowGradient: 'linear(to-r, rgba(79,209,197,0.16), rgba(79,209,197,0.03) 72%, transparent)',
    headerGradient: 'linear(to-r, rgba(79,209,197,0.12), rgba(79,209,197,0.035) 68%, transparent)',
    canCreate: true,
    // A routine is named after its character.
    canRename: false,
    canEditMetadata: false,
    canDelete: true,
    canRevealInFileExplorer: true,
    fileExplorerPath: (resourceId) =>
      `${resourceRegistry.routine.folder}/${fileSystem.resolveFilename(resourceRegistry.routine.folder, resourceFileKey('routine', resourceId))}`,
    deleteResource: async (resourceId) => {
      await useEditorStore.getState().deleteRoutine(resourceId);
    },
    getFolderPath: (resourceId) =>
      useEditorStore.getState().routines.find((routine) => routine.id === resourceId)?.folderPath ??
      '',
  },
  cutscene: {
    id: 'cutscene',
    documentDefinition: resourceRegistry.cutscene,
    label: 'Cutscene',
    collectionLabel: 'Cutscenes',
    editorIcon: 'cutscene',
    createFlow: 'simple',
    metadataFlow: 'none',
    saveUnitPrefix: 'cutscene:',
    accentColor: 'pink.300',
    tint: 'rgba(236,72,153,0.12)',
    hoverTint: 'rgba(236,72,153,0.18)',
    rowGradient: 'linear(to-r, rgba(236,72,153,0.16), rgba(236,72,153,0.03) 72%, transparent)',
    headerGradient: 'linear(to-r, rgba(236,72,153,0.12), rgba(236,72,153,0.035) 68%, transparent)',
    canCreate: true,
    canRename: true,
    canEditMetadata: false,
    canDelete: true,
    canRevealInFileExplorer: true,
    fileExplorerPath: (id) =>
      `${resourceRegistry.cutscene.folder}/${fileSystem.resolveFilename(resourceRegistry.cutscene.folder, resourceFileKey('cutscene', id))}`,
    renameResource: async (id, name) => {
      useEditorStore.getState().editCutscenes((_documents, labels) => {
        labels[id] = name;
      });
    },
    deleteResource: async (id) => {
      useEditorStore.getState().deleteCutscene(id);
    },
    getFolderPath: (id) => useEditorStore.getState().cutsceneFolders[id] ?? '',
  },
  dialogue: {
    id: 'dialogue',
    documentDefinition: resourceRegistry.dialogue,
    label: 'Dialogue',
    collectionLabel: 'Dialogues',
    editorIcon: 'dialogues',
    createFlow: 'dialogue',
    metadataFlow: 'dialogue',
    saveUnitPrefix: 'dialogue:',
    accentColor: 'yellow.300',
    tint: 'rgba(253,224,71,0.12)',
    hoverTint: 'rgba(253,224,71,0.18)',
    rowGradient: 'linear(to-r, rgba(253,224,71,0.16), rgba(253,224,71,0.03) 72%, transparent)',
    headerGradient: 'linear(to-r, rgba(253,224,71,0.12), rgba(253,224,71,0.035) 68%, transparent)',
    canCreate: true,
    canRename: false,
    canEditMetadata: true,
    canDelete: true,
    canRevealInFileExplorer: true,
    fileExplorerPath: (resourceId) =>
      `${resourceRegistry.dialogue.folder}/${fileSystem.resolveFilename(resourceRegistry.dialogue.folder, resourceFileKey('dialogue', resourceId))}`,
    deleteResource: async (resourceId) => {
      useEditorStore.setState((draft) => {
        draft.dialogues.delete(resourceId);
        if (draft.selectedDialogueId === resourceId) {
          draft.selectedDialogueId = Array.from(draft.dialogues.keys())[0] ?? null;
          draft.selectedDialogueNodeId = null;
        }
      });

      await Promise.allSettled([
        fileSystem.deleteJson(
          resourceRegistry.dialogue.folder,
          resourceFileKey('dialogue', resourceId),
        ),
        fileSystem.deleteJson(
          resourceRegistry.dialogue.folder,
          resourceFileKey('dialogue-runtime', resourceId),
        ),
        fileSystem.deleteJson(
          resourceRegistry.dialogue.folder,
          resourceFileKey('dialogue-i18n', resourceId),
        ),
      ]);
    },
    getFolderPath: (resourceId) =>
      useEditorStore.getState().dialogues.get(resourceId)?.folderPath ?? '',
  },
};

export function isEditorResourceTypeId(value: string): value is EditorResourceTypeId {
  return (editorResourceTypeIds as readonly string[]).includes(value);
}

export function getEditorResourceType(type: EditorResourceTypeId): EditorResourceTypeDefinition {
  return editorResourceTypes[type];
}

export function getEditorResourceTypeLabel(type: EditorResourceTypeId): string {
  return getEditorResourceType(type).label;
}

export function getEditorResourceCreateFlow(type: EditorResourceTypeId) {
  return getEditorResourceType(type).createFlow;
}

export function getEditorResourceMetadataFlow(document: WorkspaceDocument | undefined) {
  const definition = getEditorResourceTypeForDocument(document);
  return definition?.metadataFlow ?? 'none';
}

export function getEditorResourceMetadataTitle(
  document: WorkspaceDocument | undefined,
): string | null {
  return getEditorResourceTypeForDocument(document)?.metadataTitle ?? null;
}

export function getEditorResourceMetadataFields(
  document: WorkspaceDocument | undefined,
): EditorResourceMetadataField[] {
  return getEditorResourceTypeForDocument(document)?.getMetadataFields?.() ?? [];
}

export function getEditorResourceMetadataInitialValues(
  document: WorkspaceDocument | undefined,
): Record<string, unknown> | null {
  const definition = getEditorResourceTypeForDocument(document);
  const resourceId = getEditorResourceDocumentId(document);
  if (!definition?.getMetadataInitialValues || !resourceId) return null;
  return definition.getMetadataInitialValues(resourceId);
}

export function submitEditorResourceMetadata(
  document: WorkspaceDocument | undefined,
  values: Record<string, unknown>,
): Promise<void> {
  const definition = getEditorResourceTypeForDocument(document);
  const resourceId = getEditorResourceDocumentId(document);
  if (!definition?.submitMetadata || !resourceId) {
    return Promise.resolve();
  }
  return definition.submitMetadata(resourceId, values);
}

function getEditorResourceTypeForDocument(document: WorkspaceDocument | undefined) {
  const type = getEditorResourceTypeFromDocument(document);
  return type ? getEditorResourceType(type) : null;
}

export function getEditorResourceSaveUnitId(
  type: EditorResourceTypeId,
  resourceId: string,
): string {
  const definition = getEditorResourceType(type);
  if (definition.sharedSaveUnitId) {
    return definition.sharedSaveUnitId;
  }
  if (definition.saveUnitPrefix) {
    return `${definition.saveUnitPrefix}${resourceId}`;
  }
  return resourceId;
}

export function getEditorResourceDocumentId(
  document: WorkspaceDocument | undefined,
): string | null {
  switch (document?.kind) {
    case 'location':
      return document.mapId;
    case 'tileset':
      return document.tilesetId;
    case 'character':
      return document.characterId;
    case 'entity':
      return document.entityTypeId;
    case 'item':
      return document.itemId;
    case 'shop':
      return document.shopId;
    case 'routine':
      return document.routineId;
    case 'cutscene':
      return document.cutsceneId;
    case 'dialogue':
      return document.dialogueId;
    default:
      return null;
  }
}

export function canRenameEditorResourceDocument(document: WorkspaceDocument | undefined): boolean {
  return Boolean(getEditorResourceTypeForDocument(document)?.canRename);
}

export function canEditMetadataForResourceDocument(
  document: WorkspaceDocument | undefined,
): boolean {
  return Boolean(getEditorResourceTypeForDocument(document)?.canEditMetadata);
}

export function canDeleteEditorResourceDocument(document: WorkspaceDocument | undefined): boolean {
  return Boolean(getEditorResourceTypeForDocument(document)?.canDelete);
}

export function canRevealEditorResourceDocument(document: WorkspaceDocument | undefined): boolean {
  return Boolean(getEditorResourceTypeForDocument(document)?.canRevealInFileExplorer);
}

export function getEditorResourceFileExplorerPath(
  document: WorkspaceDocument | undefined,
): string | null {
  const definition = getEditorResourceTypeForDocument(document);
  const resourceId = getEditorResourceDocumentId(document);
  if (!definition?.fileExplorerPath || !resourceId) return null;
  return definition.fileExplorerPath(resourceId);
}

export function renameEditorResourceDocument(
  document: WorkspaceDocument | undefined,
  nextName: string,
): Promise<void> {
  const definition = getEditorResourceTypeForDocument(document);
  const resourceId = getEditorResourceDocumentId(document);
  if (!definition?.renameResource || !resourceId) {
    return Promise.resolve();
  }
  return definition.renameResource(resourceId, nextName);
}

export function deleteEditorResourceDocument(
  document: WorkspaceDocument | undefined,
): Promise<void> {
  const definition = getEditorResourceTypeForDocument(document);
  const resourceId = getEditorResourceDocumentId(document);
  if (!definition?.deleteResource || !resourceId) {
    return Promise.resolve();
  }
  return definition.deleteResource(resourceId);
}

export function getEditorResourceFolderPath(document: WorkspaceDocument | undefined): string {
  const definition = getEditorResourceTypeForDocument(document);
  const resourceId = getEditorResourceDocumentId(document);
  if (!definition?.getFolderPath || !resourceId) {
    return '';
  }
  return definition.getFolderPath(resourceId);
}

export function getEditorResourceDocumentTabId(
  document: WorkspaceDocument | undefined,
): string | null {
  const type = getEditorResourceTypeFromDocument(document);
  const resourceId = getEditorResourceDocumentId(document);
  if (!type || !resourceId) return null;
  return `${type}:${resourceId}`;
}

export function createEditorResourceDocument(
  resource: Pick<EditorResourceDescriptor, 'type' | 'id' | 'name'>,
): WorkspaceDocument {
  const saveUnitId = getEditorResourceSaveUnitId(resource.type, resource.id);
  switch (resource.type) {
    case 'location':
      return {
        kind: 'location',
        mapId: resource.id,
        variationId: null,
        label: resource.name,
        saveUnitId,
      };
    case 'tileset':
      return {
        kind: 'tileset',
        tilesetId: resource.id,
        label: resource.name,
        saveUnitId,
      };
    case 'character':
      return {
        kind: 'character',
        characterId: resource.id,
        label: resource.name,
        saveUnitId,
      };
    case 'entity':
      return {
        kind: 'entity',
        entityTypeId: resource.id,
        label: resource.name,
        saveUnitId,
      };
    case 'item':
      return {
        kind: 'item',
        itemId: resource.id,
        label: resource.name,
        saveUnitId,
      };
    case 'shop':
      return {
        kind: 'shop',
        shopId: resource.id,
        label: resource.name,
        saveUnitId,
      };
    case 'routine':
      return { kind: 'routine', routineId: resource.id, label: resource.name, saveUnitId };
    case 'cutscene':
      return { kind: 'cutscene', cutsceneId: resource.id, label: resource.name, saveUnitId };
    case 'dialogue':
      return {
        kind: 'dialogue',
        dialogueId: resource.id,
        label: resource.name,
        saveUnitId,
      };
  }
}

export function getEditorResourceTypeFromDocument(
  document: WorkspaceDocument | undefined,
): EditorResourceTypeId | null {
  switch (document?.kind) {
    case 'location':
    case 'tileset':
    case 'character':
    case 'entity':
    case 'item':
    case 'shop':
    case 'routine':
    case 'dialogue':
    case 'cutscene':
      return document.kind;
    default:
      return null;
  }
}

export interface NodeAccent {
  color: string;
  tint: string;
  hoverTint: string;
  rowGradient: string;
  headerGradient: string;
}

export function getNodeAccent(
  resourceKind: EditorResourceTypeId | undefined | null,
): NodeAccent | null {
  if (!resourceKind) return null;
  const type = getEditorResourceType(resourceKind);
  return {
    color: type.accentColor,
    tint: type.tint,
    hoverTint: type.hoverTint,
    rowGradient: type.rowGradient,
    headerGradient: type.headerGradient,
  };
}

export function getDocumentResourceKind(
  document: WorkspaceDocument | undefined,
): EditorResourceTypeId | null {
  const type = getEditorResourceTypeFromDocument(document);
  return type;
}
