import { useEditorStore } from '../store/useEditorStore';
import { ResourceKind, WorkspaceDocument } from '../types/workspace';
import {
  Actor,
  DialogueListEntry,
  EntityType,
  GameVariable,
  Item,
  Map as GameMap,
  Tileset,
} from '../types/schema';

export interface ResourceDescriptor {
  kind: ResourceKind;
  id: string;
  name: string;
  folderPath: string;
  resourceIcon?:
    | {
        type: 'game-icon' | 'asset' | 'emoji';
        value: string;
      }
    | undefined;
  document: WorkspaceDocument;
  saveUnitId: string;
}

export function actorDocument(actor: Actor): WorkspaceDocument {
  return {
    kind: 'actor',
    actorId: actor.id,
    label: actor.name,
    saveUnitId: `actor:${actor.id}`,
  };
}

export function entityDocument(entityType: EntityType): WorkspaceDocument {
  return {
    kind: 'entity',
    entityTypeId: entityType.id,
    label: entityType.displayName,
    saveUnitId: 'configuration',
  };
}

export function itemDocument(item: Item): WorkspaceDocument {
  return {
    kind: 'item',
    itemId: item.id,
    label: item.name,
    saveUnitId: `item:${item.id}`,
  };
}

export function dialogueDocument(entry: DialogueListEntry): WorkspaceDocument {
  return {
    kind: 'dialogue',
    dialogueId: entry.id,
    label: entry.name,
    saveUnitId: `dialogue:${entry.id}`,
  };
}

export function variableDocument(variable: GameVariable): WorkspaceDocument {
  return {
    kind: 'variable',
    variableKey: variable.key,
    label: variable.key,
    saveUnitId: 'configuration',
  };
}

export function locationDocument(map: GameMap): WorkspaceDocument {
  return {
    kind: 'location',
    mapId: map.id,
    variationId: null,
    label: map.name,
    saveUnitId: `location:${map.id}`,
  };
}

export function tilesetDocument(tileset: Tileset): WorkspaceDocument {
  return {
    kind: 'tileset',
    tilesetId: tileset.id,
    label: tileset.name,
    saveUnitId: `tileset:${tileset.id}`,
  };
}

export function listActorDescriptors(actors: Actor[]): ResourceDescriptor[] {
  return actors.map((actor) => ({
    kind: 'actor',
    id: actor.id,
    name: actor.name,
    folderPath: normalizeFolderPath(actor.folderPath),
    resourceIcon: actor.icon ? { type: 'game-icon', value: actor.icon } : undefined,
    document: actorDocument(actor),
    saveUnitId: `actor:${actor.id}`,
  }));
}

export function listEntityDescriptors(entityTypes: EntityType[]): ResourceDescriptor[] {
  return entityTypes.map((entityType) => ({
    kind: 'entity',
    id: entityType.id,
    name: entityType.displayName,
    folderPath: normalizeFolderPath(entityType.folderPath),
    resourceIcon: entityType.icon ? { type: 'game-icon', value: entityType.icon } : undefined,
    document: entityDocument(entityType),
    saveUnitId: 'configuration',
  }));
}

export function listItemDescriptors(items: Item[]): ResourceDescriptor[] {
  return items.map((item) => ({
    kind: 'item',
    id: item.id,
    name: item.name,
    folderPath: normalizeFolderPath(item.folderPath),
    resourceIcon: item.icon ? { type: 'asset', value: item.icon } : undefined,
    document: itemDocument(item),
    saveUnitId: `item:${item.id}`,
  }));
}

export function listDialogueDescriptors(entries: DialogueListEntry[]): ResourceDescriptor[] {
  return entries.map((entry) => ({
    kind: 'dialogue',
    id: entry.id,
    name: entry.name,
    folderPath: normalizeFolderPath(entry.folderPath),
    document: dialogueDocument(entry),
    saveUnitId: `dialogue:${entry.id}`,
  }));
}

export function listVariableDescriptors(variables: GameVariable[]): ResourceDescriptor[] {
  return variables.map((variable) => ({
    kind: 'variable',
    id: variable.key,
    name: variable.key,
    folderPath: normalizeFolderPath(variable.folderPath),
    document: variableDocument(variable),
    saveUnitId: 'configuration',
  }));
}

export function listLocationDescriptors(maps: GameMap[]): ResourceDescriptor[] {
  return maps.map((map) => ({
    kind: 'location',
    id: map.id,
    name: map.name,
    folderPath: normalizeFolderPath(map.folderPath),
    document: locationDocument(map),
    saveUnitId: `location:${map.id}`,
  }));
}

export function listTilesetDescriptors(tilesets: Map<string, Tileset>): ResourceDescriptor[] {
  return Array.from(tilesets.values()).map((tileset) => ({
    kind: 'tileset',
    id: tileset.id,
    name: tileset.name,
    folderPath: normalizeFolderPath(tileset.folderPath),
    document: tilesetDocument(tileset),
    saveUnitId: `tileset:${tileset.id}`,
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
