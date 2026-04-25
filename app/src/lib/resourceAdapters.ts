import { useEditorStore } from '../store/useEditorStore';
import { ResourceKind, WorkspaceDocument } from '../types/workspace';
import { EditorResourceDescriptor } from '../types/editorResource';
import { createEditorResourceDocument, getEditorResourceSaveUnitId } from './editorResourceTypes';
import {
  Actor,
  DialogueListEntry,
  EntityType,
  GameVariable,
  Item,
  Map as GameMap,
  Tileset,
  getSchemaResourceId,
  getSchemaResourceName,
} from '../types/schema';

export interface ResourceDescriptor extends EditorResourceDescriptor {
  kind: ResourceKind;
  document: WorkspaceDocument;
}

export function actorDocument(actor: Actor): WorkspaceDocument {
  return createEditorResourceDocument({
    type: 'actor',
    id: getSchemaResourceId(actor),
    name: getSchemaResourceName(actor),
  });
}

export function entityDocument(entityType: EntityType): WorkspaceDocument {
  return createEditorResourceDocument({
    type: 'entity',
    id: getSchemaResourceId(entityType),
    name: getSchemaResourceName(entityType),
  });
}

export function itemDocument(item: Item): WorkspaceDocument {
  return createEditorResourceDocument({
    type: 'item',
    id: getSchemaResourceId(item),
    name: getSchemaResourceName(item),
  });
}

export function dialogueDocument(entry: DialogueListEntry): WorkspaceDocument {
  return createEditorResourceDocument({
    type: 'dialogue',
    id: getSchemaResourceId(entry),
    name: getSchemaResourceName(entry),
  });
}

export function variableDocument(variable: GameVariable): WorkspaceDocument {
  return createEditorResourceDocument({
    type: 'variable',
    id: getSchemaResourceId(variable),
    name: getSchemaResourceName(variable),
  });
}

export function locationDocument(map: GameMap): WorkspaceDocument {
  return createEditorResourceDocument({
    type: 'location',
    id: getSchemaResourceId(map),
    name: getSchemaResourceName(map),
  });
}

export function tilesetDocument(tileset: Tileset): WorkspaceDocument {
  return createEditorResourceDocument({
    type: 'tileset',
    id: getSchemaResourceId(tileset),
    name: getSchemaResourceName(tileset),
  });
}

export function listActorDescriptors(actors: Actor[]): ResourceDescriptor[] {
  return actors.map((actor) => ({
    type: 'actor',
    kind: 'actor',
    id: getSchemaResourceId(actor),
    name: getSchemaResourceName(actor),
    folderPath: normalizeFolderPath(actor.folderPath),
    resourceIcon: actor.icon ? { type: 'game-icon', value: actor.icon } : undefined,
    document: actorDocument(actor),
    saveUnitId: getEditorResourceSaveUnitId('actor', actor.id),
  }));
}

export function listEntityDescriptors(entityTypes: EntityType[]): ResourceDescriptor[] {
  return entityTypes.map((entityType) => ({
    type: 'entity',
    kind: 'entity',
    id: getSchemaResourceId(entityType),
    name: getSchemaResourceName(entityType),
    folderPath: normalizeFolderPath(entityType.folderPath),
    resourceIcon: entityType.icon ? { type: 'game-icon', value: entityType.icon } : undefined,
    document: entityDocument(entityType),
    saveUnitId: getEditorResourceSaveUnitId('entity', entityType.id),
  }));
}

export function listItemDescriptors(items: Item[]): ResourceDescriptor[] {
  return items.map((item) => ({
    type: 'item',
    kind: 'item',
    id: getSchemaResourceId(item),
    name: getSchemaResourceName(item),
    folderPath: normalizeFolderPath(item.folderPath),
    resourceIcon: item.icon ? { type: 'asset', value: item.icon } : undefined,
    document: itemDocument(item),
    saveUnitId: getEditorResourceSaveUnitId('item', item.id),
  }));
}

export function listDialogueDescriptors(entries: DialogueListEntry[]): ResourceDescriptor[] {
  return entries.map((entry) => ({
    type: 'dialogue',
    kind: 'dialogue',
    id: getSchemaResourceId(entry),
    name: getSchemaResourceName(entry),
    folderPath: normalizeFolderPath(entry.folderPath),
    document: dialogueDocument(entry),
    saveUnitId: getEditorResourceSaveUnitId('dialogue', entry.id),
  }));
}

export function listVariableDescriptors(variables: GameVariable[]): ResourceDescriptor[] {
  return variables.map((variable) => ({
    type: 'variable',
    kind: 'variable',
    id: getSchemaResourceId(variable),
    name: getSchemaResourceName(variable),
    folderPath: normalizeFolderPath(variable.folderPath),
    document: variableDocument(variable),
    saveUnitId: getEditorResourceSaveUnitId('variable', variable.key),
  }));
}

export function listLocationDescriptors(maps: GameMap[]): ResourceDescriptor[] {
  return maps.map((map) => ({
    type: 'location',
    kind: 'location',
    id: getSchemaResourceId(map),
    name: getSchemaResourceName(map),
    folderPath: normalizeFolderPath(map.folderPath),
    document: locationDocument(map),
    saveUnitId: getEditorResourceSaveUnitId('location', map.id),
  }));
}

export function listTilesetDescriptors(tilesets: Map<string, Tileset>): ResourceDescriptor[] {
  return Array.from(tilesets.values()).map((tileset) => ({
    type: 'tileset',
    kind: 'tileset',
    id: getSchemaResourceId(tileset),
    name: getSchemaResourceName(tileset),
    folderPath: normalizeFolderPath(tileset.folderPath),
    document: tilesetDocument(tileset),
    saveUnitId: getEditorResourceSaveUnitId('tileset', tileset.id),
  }));
}

export interface AllResourceDescriptors {
  locations: ResourceDescriptor[];
  tilesets: ResourceDescriptor[];
  actors: ResourceDescriptor[];
  entities: ResourceDescriptor[];
  items: ResourceDescriptor[];
  dialogues: ResourceDescriptor[];
  variables: ResourceDescriptor[];
}

export function buildAllResourceDescriptors(state: {
  maps: GameMap[];
  tilesets: Map<string, Tileset>;
  actors: Actor[];
  entityTypes: EntityType[];
  items: Item[];
  dialogueIndex: { dialogues: DialogueListEntry[] } | null;
  gameVariables: GameVariable[];
}): AllResourceDescriptors {
  return {
    locations: listLocationDescriptors(state.maps),
    tilesets: listTilesetDescriptors(state.tilesets),
    actors: listActorDescriptors(state.actors),
    entities: listEntityDescriptors(state.entityTypes),
    items: listItemDescriptors(state.items),
    dialogues: listDialogueDescriptors(state.dialogueIndex?.dialogues ?? []),
    variables: listVariableDescriptors(state.gameVariables),
  };
}

export function normalizeFolderPath(folderPath: string | null | undefined): string {
  if (!folderPath) return '';
  return folderPath
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

export function canCreateResourceKind(
  kind: ResourceKind,
): kind is 'location' | 'tileset' | 'actor' | 'entity' | 'item' | 'dialogue' {
  return (
    kind === 'location' ||
    kind === 'tileset' ||
    kind === 'actor' ||
    kind === 'entity' ||
    kind === 'item' ||
    kind === 'dialogue'
  );
}

export async function setResourceFolderPath(
  kind: ResourceKind,
  id: string,
  folderPath: string,
): Promise<void> {
  const normalizedFolderPath = normalizeFolderPath(folderPath);
  const store = useEditorStore.getState();

  switch (kind) {
    case 'actor':
      await store.updateActor(id, { folderPath: normalizedFolderPath });
      break;
    case 'item':
      await store.updateItem(id, { folderPath: normalizedFolderPath });
      break;
    case 'entity':
      await store.updateEntityType(id, { folderPath: normalizedFolderPath });
      break;
    case 'variable':
      await store.updateGameVariable(id, { folderPath: normalizedFolderPath });
      break;
    case 'tileset':
      await store.updateTileset(id, { folderPath: normalizedFolderPath });
      break;
    case 'location':
      await store.updateMapFolderPath(id, normalizedFolderPath);
      break;
    case 'dialogue':
      await store.updateDialogueEntryFolderPath(id, normalizedFolderPath);
      break;
  }
}

export async function renameResourceFolder(
  kind: ResourceKind,
  fromFolderPath: string,
  toFolderPath: string,
): Promise<void> {
  const from = normalizeFolderPath(fromFolderPath);
  const to = normalizeFolderPath(toFolderPath);

  if (!from || from === to) return;

  const descriptors = listDescriptorsForKind(kind, useEditorStore.getState());
  const matches = descriptors.filter(
    (descriptor) => descriptor.folderPath === from || descriptor.folderPath.startsWith(`${from}/`),
  );

  for (const descriptor of matches) {
    const nextFolderPath =
      descriptor.folderPath === from
        ? to
        : [to, descriptor.folderPath.slice(from.length + 1)].filter(Boolean).join('/');
    await setResourceFolderPath(kind, descriptor.id, nextFolderPath);
  }
}

function listDescriptorsForKind(
  kind: ResourceKind,
  state: ReturnType<typeof useEditorStore.getState>,
): ResourceDescriptor[] {
  switch (kind) {
    case 'location':
      return listLocationDescriptors(state.maps);
    case 'tileset':
      return listTilesetDescriptors(state.tilesets);
    case 'actor':
      return listActorDescriptors(state.actors);
    case 'entity':
      return listEntityDescriptors(state.entityTypes);
    case 'item':
      return listItemDescriptors(state.items);
    case 'dialogue':
      return listDialogueDescriptors(state.dialogueIndex?.dialogues ?? []);
    case 'variable':
      return listVariableDescriptors(state.gameVariables);
  }
}
