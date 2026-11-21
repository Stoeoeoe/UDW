import { useEditorStore } from '../store/useEditorStore';
import { ResourceKind, WorkspaceDocument } from '../types/workspace';
import type { MusicCueSummary } from './musicApi';
import { EditorResourceDescriptor } from '../types/editorResource';
import { createEditorResourceDocument, getEditorResourceSaveUnitId } from './editorResourceTypes';
import {
  Character,
  DialogueDocument,
  EntityType,
  Item,
  Shop,
  Map as GameMap,
  Tileset,
  getSchemaResourceId,
  getSchemaResourceName,
} from '../types/schema';
import type { Routine } from '../types/routine';
import { routineLabel } from './routines';

export interface ResourceDescriptor extends EditorResourceDescriptor {
  kind: ResourceKind;
  document: WorkspaceDocument;
}

export function characterDocument(character: Character): WorkspaceDocument {
  return createEditorResourceDocument({
    type: 'character',
    id: getSchemaResourceId(character),
    name: getSchemaResourceName(character),
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

export function shopDocument(shop: Shop): WorkspaceDocument {
  return createEditorResourceDocument({
    type: 'shop',
    id: getSchemaResourceId(shop),
    name: getSchemaResourceName(shop),
  });
}

export function listRoutineDescriptors(
  routines: Routine[],
  characters: Character[],
): ResourceDescriptor[] {
  return routines.map((routine) => {
    const name = routineLabel(routine, characters);
    return {
      type: 'routine',
      kind: 'routine',
      id: routine.id,
      name,
      folderPath: normalizeFolderPath(routine.folderPath),
      document: createEditorResourceDocument({ type: 'routine', id: routine.id, name }),
      saveUnitId: getEditorResourceSaveUnitId('routine', routine.id),
    };
  });
}

export function dialogueDocument(dialogue: DialogueDocument): WorkspaceDocument {
  return createEditorResourceDocument({
    type: 'dialogue',
    id: getSchemaResourceId(dialogue),
    name: getSchemaResourceName(dialogue),
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

export function listCharacterDescriptors(characters: Character[]): ResourceDescriptor[] {
  return characters.map((character) => ({
    type: 'character',
    kind: 'character',
    id: getSchemaResourceId(character),
    name: getSchemaResourceName(character),
    folderPath: normalizeFolderPath(character.folderPath),
    resourceIcon: character.defaultPortrait
      ? { type: 'asset', value: character.defaultPortrait }
      : undefined,
    document: characterDocument(character),
    saveUnitId: getEditorResourceSaveUnitId('character', character.id),
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

export function listDialogueDescriptors(dialogues: DialogueDocument[]): ResourceDescriptor[] {
  return dialogues.map((dialogue) => ({
    type: 'dialogue',
    kind: 'dialogue',
    id: getSchemaResourceId(dialogue),
    name: getSchemaResourceName(dialogue),
    folderPath: normalizeFolderPath(dialogue.folderPath),
    document: dialogueDocument(dialogue),
    saveUnitId: getEditorResourceSaveUnitId('dialogue', dialogue.id),
  }));
}

export function listCutsceneDescriptors(
  cutscenes: import('../types/cutscene').Cutscene[],
  labels: Record<string, string> = {},
  folders: Record<string, string> = {},
): ResourceDescriptor[] {
  return cutscenes.map((scene) => ({
    type: 'cutscene',
    kind: 'cutscene',
    id: scene.id,
    name: labels[scene.id] || scene.id,
    folderPath: normalizeFolderPath(folders[scene.id]),
    saveUnitId: getEditorResourceSaveUnitId('cutscene', scene.id),
    document: createEditorResourceDocument({
      type: 'cutscene',
      id: scene.id,
      name: labels[scene.id] || scene.id,
    }),
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

export function listShopDescriptors(shops: Shop[]): ResourceDescriptor[] {
  return shops.map((shop) => ({
    type: 'shop',
    kind: 'shop',
    id: getSchemaResourceId(shop),
    name: getSchemaResourceName(shop),
    folderPath: normalizeFolderPath(shop.folderPath),
    document: shopDocument(shop),
    saveUnitId: getEditorResourceSaveUnitId('shop', shop.id),
  }));
}

export function listMusicDescriptors(cues: MusicCueSummary[]): ResourceDescriptor[] {
  return cues.map((cue) => ({
    type: 'music',
    kind: 'music',
    id: cue.id,
    name: cue.name,
    folderPath: '',
    document: createEditorResourceDocument({ type: 'music', id: cue.id, name: cue.name }),
    saveUnitId: getEditorResourceSaveUnitId('music', cue.id),
  }));
}

export function listQuestDescriptors(
  quests: import('../types/quest').Quest[],
): ResourceDescriptor[] {
  return quests.map((quest) => ({
    type: 'quest',
    kind: 'quest',
    id: quest.id,
    name: quest.title,
    folderPath: normalizeFolderPath(quest.folderPath),
    document: createEditorResourceDocument({ type: 'quest', id: quest.id, name: quest.title }),
    saveUnitId: getEditorResourceSaveUnitId('quest', quest.id),
  }));
}

export function listBuildingKitDescriptors(
  kits: import('../types/building').BuildingKit[],
): ResourceDescriptor[] {
  return kits.map((kit) => ({
    type: 'building-kit',
    kind: 'building-kit',
    id: kit.id,
    name: kit.name,
    folderPath: normalizeFolderPath(kit.folderPath),
    document: createEditorResourceDocument({ type: 'building-kit', id: kit.id, name: kit.name }),
    saveUnitId: getEditorResourceSaveUnitId('building-kit', kit.id),
  }));
}

export function listBuildingDescriptors(
  buildings: import('../types/building').Building[],
): ResourceDescriptor[] {
  return buildings.map((building) => ({
    type: 'building',
    kind: 'building',
    id: building.id,
    name: building.name,
    folderPath: normalizeFolderPath(building.folderPath),
    document: createEditorResourceDocument({
      type: 'building',
      id: building.id,
      name: building.name,
    }),
    saveUnitId: getEditorResourceSaveUnitId('building', building.id),
  }));
}

export interface AllResourceDescriptors {
  locations: ResourceDescriptor[];
  tilesets: ResourceDescriptor[];
  characters: ResourceDescriptor[];
  entities: ResourceDescriptor[];
  items: ResourceDescriptor[];
  shops: ResourceDescriptor[];
  quests: ResourceDescriptor[];
  buildingKits: ResourceDescriptor[];
  buildings: ResourceDescriptor[];
  routines: ResourceDescriptor[];
  dialogues: ResourceDescriptor[];
  cutscenes: ResourceDescriptor[];
  music: ResourceDescriptor[];
}

export function buildAllResourceDescriptors(state: {
  maps: GameMap[];
  tilesets: Map<string, Tileset>;
  characters: Character[];
  entityTypes: EntityType[];
  items: Item[];
  shops: Shop[];
  quests?: import('../types/quest').Quest[];
  buildingKits?: import('../types/building').BuildingKit[];
  buildings?: import('../types/building').Building[];
  routines: Routine[];
  dialogues: Map<string, DialogueDocument>;
  cutscenes?: import('../types/cutscene').Cutscene[];
  cutsceneLabels?: Record<string, string>;
  cutsceneFolders?: Record<string, string>;
  musicCues?: MusicCueSummary[];
}): AllResourceDescriptors {
  return {
    locations: listLocationDescriptors(state.maps),
    tilesets: listTilesetDescriptors(state.tilesets),
    characters: listCharacterDescriptors(state.characters),
    entities: listEntityDescriptors(state.entityTypes),
    items: listItemDescriptors(state.items),
    shops: listShopDescriptors(state.shops),
    quests: listQuestDescriptors(state.quests ?? []),
    buildingKits: listBuildingKitDescriptors(state.buildingKits ?? []),
    buildings: listBuildingDescriptors(state.buildings ?? []),
    routines: listRoutineDescriptors(state.routines, state.characters),
    dialogues: listDialogueDescriptors(Array.from(state.dialogues.values())),
    cutscenes: listCutsceneDescriptors(
      state.cutscenes ?? [],
      state.cutsceneLabels,
      state.cutsceneFolders,
    ),
    music: listMusicDescriptors(state.musicCues ?? []),
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
): kind is
  | 'location'
  | 'tileset'
  | 'character'
  | 'entity'
  | 'item'
  | 'shop'
  | 'routine'
  | 'quest'
  | 'building-kit'
  | 'building'
  | 'dialogue'
  | 'cutscene'
  | 'music' {
  return (
    kind === 'location' ||
    kind === 'tileset' ||
    kind === 'character' ||
    kind === 'entity' ||
    kind === 'item' ||
    kind === 'shop' ||
    kind === 'routine' ||
    kind === 'quest' ||
    kind === 'building-kit' ||
    kind === 'building' ||
    kind === 'dialogue' ||
    kind === 'cutscene' ||
    kind === 'music'
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
    case 'cutscene':
      store.editCutscenes((_documents, _labels, folders) => {
        folders[id] = normalizedFolderPath;
      });
      break;
    case 'character':
      await store.updateCharacter(id, { folderPath: normalizedFolderPath });
      break;
    case 'item':
      await store.updateItem(id, { folderPath: normalizedFolderPath });
      break;
    case 'shop':
      await store.updateShop(id, { folderPath: normalizedFolderPath });
      break;
    case 'quest':
      store.updateQuest(id, { folderPath: normalizedFolderPath });
      break;
    case 'building-kit':
      store.updateBuildingKit(id, { folderPath: normalizedFolderPath });
      break;
    case 'building':
      store.updateBuilding(id, { folderPath: normalizedFolderPath });
      break;
    case 'routine':
      store.updateRoutine(id, { folderPath: normalizedFolderPath });
      break;
    case 'entity':
      await store.updateEntityType(id, { folderPath: normalizedFolderPath });
      break;
    case 'tileset':
      await store.updateTileset(id, { folderPath: normalizedFolderPath });
      break;
    case 'location':
      await store.updateMapFolderPath(id, normalizedFolderPath);
      break;
    case 'dialogue':
      await store.updateDialogueFolderPath(id, normalizedFolderPath);
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
    case 'cutscene':
      return listCutsceneDescriptors(state.cutscenes, state.cutsceneLabels, state.cutsceneFolders);
    case 'location':
      return listLocationDescriptors(state.maps);
    case 'tileset':
      return listTilesetDescriptors(state.tilesets);
    case 'character':
      return listCharacterDescriptors(state.characters);
    case 'entity':
      return listEntityDescriptors(state.entityTypes);
    case 'item':
      return listItemDescriptors(state.items);
    case 'shop':
      return listShopDescriptors(state.shops);
    case 'quest':
      return listQuestDescriptors(state.quests);
    case 'building-kit':
      return listBuildingKitDescriptors(state.buildingKits);
    case 'building':
      return listBuildingDescriptors(state.buildings);
    case 'routine':
      return listRoutineDescriptors(state.routines, state.characters);
    case 'dialogue':
      return listDialogueDescriptors(Array.from(state.dialogues.values()));
    case 'music':
      return [];
  }
}
