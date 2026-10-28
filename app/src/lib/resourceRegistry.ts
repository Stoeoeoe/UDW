import { validateStoryValueDeclarations } from './storyValues';
import type {
  Character,
  DialogueDocument,
  DialogueI18nExport,
  DialogueNode,
  EntityInstance,
  EntityType,
  GameVariable,
  Item,
  Layer,
  Map as GameMap,
  Project,
  ScriptFunction,
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
import { parseCutscene } from './cutscenes';

export interface ResourceDocuments {
  cutscene: Cutscene;
  project: Project;
  location: GameMap;
  tileset: Tileset;
  character: Character;
  item: Item;
  entity: EntityType;
  dialogue: DialogueDocument;
  'dialogue-runtime': DialogueDocument;
  'dialogue-i18n': DialogueI18nExport;
}
export type ResourceDocumentKind = keyof ResourceDocuments;
export type ResourceFolder =
  | ''
  | 'maps'
  | 'tilesets'
  | 'characters'
  | 'npcs'
  | 'items'
  | 'entities'
  | 'dialogues'
  | 'cutscenes';

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
const normalizeVariable = (variable: GameVariable): GameVariable => ({
  ...variable,
  tableId: localReference(variable.tableId),
});
const normalizeFunction = (fn: ScriptFunction): ScriptFunction => ({
  ...localDefinition(fn),
  returnTableId: localReference(fn.returnTableId),
});
export function normalizeProject(project: Project): Project {
  if (project.storyValues !== undefined) validateStoryValueDeclarations(project.storyValues);
  const idPrefix = normalizeIdPrefix(project.idPrefix ?? DEFAULT_ID_PREFIX);
  const normalizeScriptScope = <
    T extends { id: string; fields: GameVariable[]; functions: ScriptFunction[] },
  >(
    scope: T,
  ): T => ({
    ...localDefinition(scope),
    fields: scope.fields?.map(normalizeVariable),
    functions: collection(scope.functions, normalizeFunction),
  });
  return {
    ...project,
    id: project.id === undefined ? project.id : normalizeLocalId(project.id),
    idPrefix,
    terrainTypes: collection(project.terrainTypes, localDefinition),
    layerDefinitions: collection(project.layerDefinitions, localDefinition),
    itemClasses: collection(project.itemClasses, localDefinition),
    entityTypes: collection(project.entityTypes, (entity) => ({
      ...entity,
      id: qualifyResourceId(entity.id, idPrefix),
    })),
    gameVariables: project.gameVariables?.map(normalizeVariable),
    scriptTables: collection(project.scriptTables, localDefinition),
    scriptFunctions: collection(project.scriptFunctions, normalizeFunction),
    scriptNamespaces: collection(project.scriptNamespaces, normalizeScriptScope),
    scriptContextTypes: collection(project.scriptContextTypes, normalizeScriptScope),
    defaultDialogueContextTypeId: localReference(project.defaultDialogueContextTypeId),
    dialogueTypes: collection(project.dialogueTypes, (type) => ({
      ...localDefinition(type),
      contextTypeId: localReference(type.contextTypeId),
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
export function resourceSchemaPath(kind: ResourceDocumentKind): string {
  const definition = resourceRegistry[kind];
  return `${definition.folder ? '../' : ''}schemas/${definition.schemaFile}`;
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
