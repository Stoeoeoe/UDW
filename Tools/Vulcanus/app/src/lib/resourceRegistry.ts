import { validateStoryValueDeclarations } from './storyValues';
import type {
  Character,
  DialogueDocument,
  DialogueI18nExport,
  DialogueNode,
  EntityInstance,
  EntityType,
  Item,
  Layer,
  Map as GameMap,
  Project,
  Shop,
  Tileset,
  Variation,
} from '../types/schema';
import {
  DEFAULT_ID_PREFIX,
  assertUniqueResourceIds,
  normalizeIdPrefix,
  normalizeLocalId,
  qualifyResourceId,
  resourceIdToFileStem,
} from './resourceIds';
import { splitTileRef } from './tileRef';
import type { Cutscene } from '../types/cutscene';
import type { Routine, RoutineEntry, RoutineGoal, RoutinePlace } from '../types/routine';
import { parseCutscene } from './cutscenes';

export interface ResourceDocuments {
  cutscene: Cutscene;
  project: Project;
  location: GameMap;
  tileset: Tileset;
  character: Character;
  item: Item;
  shop: Shop;
  quest: import('../types/quest').Quest;
  'quest-i18n': import('../types/quest').QuestI18n;
  routine: Routine;
  entity: EntityType;
  dialogue: DialogueDocument;
  'dialogue-runtime': DialogueDocument;
  'dialogue-i18n': DialogueI18nExport;
  object: import('../types/object').ObjectDefinition;
}
export type ResourceDocumentKind = keyof ResourceDocuments;
export type ResourceFolder =
  | ''
  | 'maps'
  | 'tilesets'
  | 'characters'
  | 'npcs'
  | 'items'
  | 'shops'
  | 'quests'
  | 'routines'
  | 'entities'
  | 'dialogues'
  | 'cutscenes'
  | 'objects';

export interface ResourceDefinition<K extends ResourceDocumentKind = ResourceDocumentKind> {
  kind: K;
  folder: ResourceFolder;
  extension: string;
  schemaFile: string;
  idScope: 'resource' | 'local';
  legacyFiles?: readonly { folder: ResourceFolder; extension: string }[];
  sourceKind?: ResourceDocumentKind;
  normalize: (document: ResourceDocuments[K], prefix: string) => ResourceDocuments[K];
}
export type AnyResourceDefinition = {
  [K in ResourceDocumentKind]: ResourceDefinition<K>;
}[ResourceDocumentKind];

// These helpers operate on known fields selected by the typed normalizers below.
const localReference = <T extends string | null | undefined>(id: T): T =>
  (id ? normalizeLocalId(id) : id) as T;
const resourceReference = <T extends string | null | undefined>(id: T, prefix: string): T =>
  (id ? qualifyResourceId(id, prefix) : id) as T;
function localDefinition<T extends { id: string }>(value: T): T {
  return { ...value, id: normalizeLocalId(value.id) };
}
function collection<T extends { id: string }>(values: T[], normalize: (value: T) => T): T[];
function collection<T extends { id: string }>(
  values: T[] | undefined,
  normalize: (value: T) => T,
): T[] | undefined;
function collection<T extends { id: string }>(
  values: T[] | undefined,
  normalize: (value: T) => T,
): T[] | undefined {
  if (!values) return values;
  const result = values.map(normalize);
  assertUniqueResourceIds(result);
  return result;
}
function normalizeEntityInstance<T extends Partial<EntityInstance>>(entity: T, prefix: string): T {
  return {
    ...entity,
    id: entity.id === undefined ? undefined : normalizeLocalId(entity.id),
    typeId: resourceReference(entity.typeId, prefix),
    layerId: localReference(entity.layerId),
  };
}
function normalizeLayer(layer: Layer, prefix: string): Layer {
  // The same normalizer accepts dense editor layers and serialized terrain palettes.
  const wire = layer as Layer & { terrainPalette?: string[] };
  return {
    ...localDefinition(layer),
    definitionId: localReference(layer.definitionId),
    entities: collection(layer.entities, (entity) => normalizeEntityInstance(entity, prefix)),
    objectGroups: collection(layer.objectGroups, (group) => ({
      ...localDefinition(group),
      tiles: group.tiles.map((tile) => ({
        ...tile,
        tilesetId: qualifyResourceId(tile.tilesetId, prefix),
      })),
    })),
    objectInstances: collection(layer.objectInstances, (instance) => ({
      ...localDefinition(instance),
      tilesetId: qualifyResourceId(instance.tilesetId, prefix),
      objectDefinitionId: localReference(instance.objectDefinitionId),
    })),
    terrainData: layer.terrainData?.map((row) =>
      row.map((id) => (typeof id === 'string' ? localReference(id) : id)),
    ),
    ...(wire.terrainPalette ? { terrainPalette: wire.terrainPalette.map(normalizeLocalId) } : {}),
  };
}
function normalizeVariation(variation: Variation, prefix: string): Variation {
  const overrides =
    variation.layerOverrides &&
    Object.entries(variation.layerOverrides).map(
      ([id, override]) =>
        [
          normalizeLocalId(id),
          {
            ...override,
            data: override.data.map((row) =>
              row.map((ref) => {
                if (ref === null) return ref;
                const [tilesetId, index] = splitTileRef(ref);
                return `${qualifyResourceId(tilesetId, prefix)}:${index}`;
              }),
            ),
          },
        ] as const,
    );
  if (overrides) assertUniqueResourceIds(overrides.map(([id]) => ({ id })));
  const metadata = variation.metadata && { ...variation.metadata };
  if (metadata && typeof metadata.baseTilesetIdOverride === 'string')
    metadata.baseTilesetIdOverride = resourceReference(metadata.baseTilesetIdOverride, prefix);
  return {
    ...localDefinition(variation),
    parentId: localReference(variation.parentId),
    tilesetSuffix: variation.tilesetSuffix?.toLowerCase(),
    layerOverrides: overrides && Object.fromEntries(overrides),
    metadata,
    entityOverrides: variation.entityOverrides?.map((override) => ({
      ...override,
      entityId: localReference(override.entityId),
      entity: override.entity && normalizeEntityInstance(override.entity, prefix),
    })),
  };
}
function normalizeMap(map: GameMap, prefix: string): GameMap {
  const spatial = map.spatialPrimitives;
  return {
    ...map,
    id: qualifyResourceId(map.id, prefix),
    baseTilesetId: resourceReference(map.baseTilesetId, prefix),
    tilesetRefs: map.tilesetRefs?.map((id) => qualifyResourceId(id, prefix)),
    layers: collection(map.layers, (layer) => normalizeLayer(layer, prefix)),
    entities: collection(map.entities, (entity) => normalizeEntityInstance(entity, prefix)),
    locationLinks: collection(map.locationLinks, (link) => ({
      ...localDefinition(link),
      triggerId: localReference(link.triggerId),
      targetMapId: resourceReference(link.targetMapId, prefix),
      targetAnchorId: localReference(link.targetAnchorId),
    })),
    variations: collection(map.variations, (variation) => normalizeVariation(variation, prefix)),
    spatialPrimitives: spatial && {
      ...spatial,
      paths: collection(spatial.paths, localDefinition),
      areas: collection(spatial.areas, localDefinition),
      anchors: collection(spatial.anchors, localDefinition),
      triggers: collection(spatial.triggers, (trigger) => ({
        ...localDefinition(trigger),
        cutsceneId: resourceReference(trigger.cutsceneId, prefix),
      })),
      collisions: collection(spatial.collisions, localDefinition),
    },
    metadata: map.metadata && {
      ...map.metadata,
      entryPoints: collection(map.metadata.entryPoints, localDefinition),
      exitPoints: collection(map.metadata.exitPoints, (exit) => ({
        ...localDefinition(exit),
        targetMap: resourceReference(exit.targetMap, prefix),
      })),
    },
  };
}
function normalizeTileset(tileset: Tileset, prefix: string): Tileset {
  return {
    ...tileset,
    id: qualifyResourceId(tileset.id, prefix),
    tiles:
      tileset.tiles &&
      Object.fromEntries(
        Object.entries(tileset.tiles).map(([index, tile]) => [
          index,
          {
            ...tile,
            id: tile.id === undefined ? undefined : normalizeLocalId(tile.id),
            terrainCorners: tile.terrainCorners?.map(localReference),
            collision: tile.collision && {
              ...tile.collision,
              shapes: collection(tile.collision.shapes, localDefinition),
            },
          },
        ]),
      ),
    objects: collection(tileset.objects, localDefinition),
    wangSets: collection(tileset.wangSets, localDefinition),
  };
}
function normalizeDialogueNode(node: DialogueNode, prefix: string): DialogueNode {
  const result = {
    ...localDefinition(node),
    editor: node.editor && {
      ...node.editor,
      branchId: localReference(node.editor.branchId),
      parentChoiceNodeId: localReference(node.editor.parentChoiceNodeId),
      parentOptionId: localReference(node.editor.parentOptionId),
    },
  };
  switch (result.type) {
    case 'line':
      return {
        ...result,
        speaker: resourceReference(result.speaker, prefix),
        next: localReference(result.next),
      };
    case 'action':
      return { ...result, next: localReference(result.next) };
    case 'choice':
      return {
        ...result,
        options: collection(result.options, (option) => ({
          ...localDefinition(option),
          targetNodeId: localReference(option.targetNodeId),
        })),
      };
    case 'jump':
      return {
        ...result,
        targetDialogueId: resourceReference(result.targetDialogueId, prefix),
        targetNodeId: localReference(result.targetNodeId),
      };
    case 'comment':
    case 'end':
      return result;
    default: {
      const unknownNode: never = result;
      throw new Error(`Unsupported dialogue node: ${JSON.stringify(unknownNode)}`);
    }
  }
}
function normalizeDialogue(dialogue: DialogueDocument, prefix: string): DialogueDocument {
  return {
    ...dialogue,
    id: qualifyResourceId(dialogue.id, prefix),
    dialogueTypeId: localReference(dialogue.dialogueTypeId),
    startNodeId: localReference(dialogue.startNodeId),
    nodes: collection(dialogue.nodes, (node) => normalizeDialogueNode(node, prefix)),
  };
}
export function normalizeProject(project: Project): Project {
  if (project.storyValues !== undefined) validateStoryValueDeclarations(project.storyValues);
  const idPrefix = normalizeIdPrefix(project.idPrefix ?? DEFAULT_ID_PREFIX);
  return {
    ...project,
    id: project.id === undefined ? project.id : normalizeLocalId(project.id),
    idPrefix,
    terrainTypes: collection(project.terrainTypes, localDefinition),
    layerDefinitions: collection(project.layerDefinitions, localDefinition),
    itemClasses: collection(project.itemClasses, localDefinition),
    emotions: collection(project.emotions, (emotion) => ({
      ...emotion,
      id: qualifyResourceId(emotion.id, idPrefix),
    })),
    entityTypes: collection(project.entityTypes, (entity) => ({
      ...entity,
      id: qualifyResourceId(entity.id, idPrefix),
    })),
    dialogueTypes: collection(project.dialogueTypes, (type) => ({
      ...localDefinition(type),
    })),
  };
}

/** Pure registry shared by Electron, persistence and the UI; no store, browser or schema imports. */
export const resourceRegistry: { [K in ResourceDocumentKind]: ResourceDefinition<K> } = {
  cutscene: {
    kind: 'cutscene',
    folder: 'cutscenes',
    extension: '.runtime.cutscene.json',
    schemaFile: 'cutscene.schema.json',
    idScope: 'resource',
    normalize: parseCutscene,
  },
  project: {
    kind: 'project',
    folder: '',
    extension: '.vproj',
    schemaFile: 'project.schema.json',
    idScope: 'local',
    normalize: normalizeProject,
  },
  location: {
    kind: 'location',
    folder: 'maps',
    extension: '.vmap',
    schemaFile: 'map.schema.json',
    idScope: 'resource',
    normalize: normalizeMap,
  },
  tileset: {
    kind: 'tileset',
    folder: 'tilesets',
    extension: '.vts',
    schemaFile: 'tileset.schema.json',
    idScope: 'resource',
    normalize: normalizeTileset,
  },
  character: {
    kind: 'character',
    folder: 'characters',
    extension: '.character.json',
    schemaFile: 'character.schema.json',
    idScope: 'resource',
    legacyFiles: [{ folder: 'npcs', extension: '.npc.json' }],
    normalize: (character, prefix) => ({
      ...character,
      id: qualifyResourceId(character.id, prefix),
    }),
  },
  item: {
    kind: 'item',
    folder: 'items',
    extension: '.vitm',
    schemaFile: 'item.schema.json',
    idScope: 'resource',
    normalize: (item, prefix) => ({
      ...item,
      id: qualifyResourceId(item.id, prefix),
      classId: localReference(item.classId),
    }),
  },
  shop: {
    kind: 'shop',
    folder: 'shops',
    extension: '.shop.json',
    schemaFile: 'shop.schema.json',
    idScope: 'resource',
    normalize: (shop, prefix) => ({ ...shop, id: qualifyResourceId(shop.id, prefix) }),
  },
  quest: {
    kind: 'quest',
    folder: 'quests',
    extension: '.quest.json',
    schemaFile: 'quest.schema.json',
    idScope: 'resource',
    normalize: (quest, prefix) => ({
      ...quest,
      id: qualifyResourceId(quest.id, prefix),
      giver: resourceReference(quest.giver, prefix),
      steps: collection(quest.steps, (step) => ({
        ...localDefinition(step),
        objectives: collection(step.objectives, (objective) => ({
          ...localDefinition(objective),
          ...('character' in objective
            ? { character: resourceReference(objective.character, prefix) }
            : {}),
          ...('item' in objective ? { item: resourceReference(objective.item, prefix) } : {}),
          ...('dialogue' in objective
            ? { dialogue: resourceReference(objective.dialogue, prefix) }
            : {}),
          ...('map' in objective ? { map: resourceReference(objective.map, prefix) } : {}),
        })),
      })),
    }),
  },
  object: {
    kind: 'object',
    folder: 'objects',
    extension: '.object.json',
    schemaFile: 'object.schema.json',
    idScope: 'resource',
    normalize: (object, prefix) => ({
      ...object,
      id: qualifyResourceId(object.id, prefix),
      tilesetId: resourceReference(object.tilesetId, prefix),
    }),
  },
  'quest-i18n': {
    kind: 'quest-i18n',
    folder: 'quests',
    extension: '.i18n.json',
    schemaFile: 'quest-i18n.schema.json',
    idScope: 'resource',
    sourceKind: 'quest',
    normalize: (document, prefix) => ({
      ...document,
      questId: qualifyResourceId(document.questId, prefix),
    }),
  },
  routine: {
    kind: 'routine',
    folder: 'routines',
    extension: '.routine.json',
    schemaFile: 'routine.schema.json',
    idScope: 'resource',
    normalize: (routine, prefix) => {
      const place = (p: RoutinePlace): RoutinePlace => ({
        ...p,
        map: resourceReference(p.map, prefix),
      });
      const dialogue = <T extends { dialogue?: string | null }>(value: T): T =>
        value.dialogue ? { ...value, dialogue: resourceReference(value.dialogue, prefix) } : value;
      const goals = (list: RoutineGoal[]) =>
        list.map((goal) => {
          const placed =
            goal.destination === 'home' ? goal : { ...goal, destination: place(goal.destination) };
          const walking = goal.walkingDialogue
            ? { ...placed, walkingDialogue: resourceReference(goal.walkingDialogue, prefix) }
            : placed;
          return dialogue(walking);
        });
      const entry = (e: RoutineEntry): RoutineEntry => ({
        ...e,
        ...(e.goals ? { goals: goals(e.goals) } : {}),
        ...(e.pickOne ? { pickOne: e.pickOne.map((c) => ({ ...c, goals: goals(c.goals) })) } : {}),
      });
      return {
        ...dialogue(routine),
        id: qualifyResourceId(routine.id, prefix),
        character: resourceReference(routine.character, prefix),
        home: place(routine.home),
        ...(routine.overrides ? { overrides: routine.overrides.map(entry) } : {}),
        variants: routine.variants.map(entry),
      };
    },
  },
  entity: {
    kind: 'entity',
    folder: 'entities',
    extension: '.entity.json',
    schemaFile: 'entity-type.schema.json',
    idScope: 'resource',
    normalize: (entity, prefix) => ({ ...entity, id: qualifyResourceId(entity.id, prefix) }),
  },
  dialogue: {
    kind: 'dialogue',
    folder: 'dialogues',
    extension: '.dialogue.json',
    schemaFile: 'dialogue.schema.json',
    idScope: 'resource',
    normalize: normalizeDialogue,
  },
  'dialogue-runtime': {
    kind: 'dialogue-runtime',
    folder: 'dialogues',
    extension: '.runtime.dialogue.json',
    schemaFile: 'dialogue.schema.json',
    idScope: 'resource',
    sourceKind: 'dialogue',
    normalize: normalizeDialogue,
  },
  'dialogue-i18n': {
    kind: 'dialogue-i18n',
    folder: 'dialogues',
    extension: '.i18n.json',
    schemaFile: 'dialogue-i18n.schema.json',
    idScope: 'resource',
    sourceKind: 'dialogue',
    normalize: (exported, prefix) => ({
      ...exported,
      dialogueId: resourceReference(exported.dialogueId, prefix),
      messages: exported.messages?.map((message) => ({
        ...message,
        nodeId: localReference(message.nodeId),
        optionId: localReference(message.optionId),
      })),
    }),
  },
};

export function normalizeResourceDocument<K extends ResourceDocumentKind>(
  document: ResourceDocuments[K],
  kind: K,
  prefix = DEFAULT_ID_PREFIX,
): ResourceDocuments[K] {
  return resourceRegistry[kind].normalize(document, normalizeIdPrefix(prefix));
}
/** Relative path from the open project's folder to the game repo's Schemas folder. */
let schemaRoot = '../../../Schemas';

/**
 * Projects live inside the game's Unity Assets folder, and the Schemas folder sits next to it.
 * Outside a game repo there is no Schemas folder, so the default stays.
 */
export function setSchemaRootFromProjectPath(projectPath: string): void {
  const segments = projectPath.split(/[\\/]/).filter(Boolean);
  const assets = segments.lastIndexOf('Assets');
  if (assets >= 0) schemaRoot = [...segments.slice(assets).map(() => '..'), 'Schemas'].join('/');
}

export function resourceSchemaPath(kind: ResourceDocumentKind): string {
  const definition = resourceRegistry[kind];
  return `${definition.folder ? '../' : ''}${schemaRoot}/${definition.schemaFile}`;
}
/** Logical filename used for original-file lookup; physical filenames are resolved separately. */
export function resourceFileKey(kind: ResourceDocumentKind, id: string): string {
  return `${id}${resourceRegistry[kind].extension}`;
}
export function resourceFilename(
  kind: ResourceDocumentKind,
  id: string,
  prefix = DEFAULT_ID_PREFIX,
): string {
  const definition = resourceRegistry[kind];
  return `${definition.idScope === 'resource' ? resourceIdToFileStem(id, prefix) : normalizeLocalId(id)}${definition.extension}`;
}
export function getResourceDefinition(
  folder: string,
  filename: string,
): AnyResourceDefinition | undefined {
  return Object.values(resourceRegistry)
    .sort((a, b) => b.extension.length - a.extension.length)
    .find(
      (definition) =>
        (definition.folder === folder && filename.endsWith(definition.extension)) ||
        definition.legacyFiles?.some(
          (legacy) => legacy.folder === folder && filename.endsWith(legacy.extension),
        ),
    );
}
export function getResourceDocumentExtension(filename: string): string | undefined {
  return Object.values(resourceRegistry)
    .flatMap((definition) => [
      definition.extension,
      ...(definition.legacyFiles?.map((legacy) => legacy.extension) ?? []),
    ])
    .sort((a, b) => b.length - a.length)
    .find((extension) => filename.endsWith(extension));
}
