import {
  Character,
  DialogueDocument,
  EntityType,
  Item,
  Map as GameMap,
  Shop,
  Tileset,
} from '../types/schema';
import { WorkspaceDocument } from '../types/workspace';
import { createEditorResourceDocument } from './editorResourceTypes';
import { createLocationDocument } from './workspaceRouting';
import { routineLabel } from './routines';

export type CommandPaletteFilter =
  | 'all'
  | 'locations'
  | 'tilesets'
  | 'entities'
  | 'characters'
  | 'items'
  | 'shops'
  | 'quests'
  | 'buildings'
  | 'routines'
  | 'dialogues'
  | 'cutscenes';

export type CommandPaletteResourceType =
  | 'location'
  | 'tileset'
  | 'entity'
  | 'character'
  | 'item'
  | 'shop'
  | 'quest'
  | 'building-kit'
  | 'building'
  | 'routine'
  | 'dialogue'
  | 'cutscene';

export interface CommandPaletteResource {
  key: string;
  type: CommandPaletteResourceType;
  typeLabel: string;
  label: string;
  document: WorkspaceDocument;
  resourceId?: string;
  secondaryLabel?: string;
}

export interface CommandPaletteMatch {
  resource: CommandPaletteResource;
  matchedField: 'label' | 'secondary';
  labelMatchIndices: number[];
  secondaryMatchIndices: number[];
  score: number;
}

export interface BuildCommandPaletteResourcesOptions {
  maps: GameMap[];
  tilesets: Map<string, Tileset>;
  entityTypes: EntityType[];
  characters: Character[];
  items: Item[];
  shops: Shop[];
  quests?: import('../types/quest').Quest[];
  buildingKits?: import('../types/building').BuildingKit[];
  buildings?: import('../types/building').Building[];
  routines?: import('../types/routine').Routine[];
  dialogues: DialogueDocument[];
  cutscenes?: import('../types/cutscene').Cutscene[];
  cutsceneLabels?: Record<string, string>;
}

const EMPTY_SECONDARY_MATCH: number[] = [];

export function buildCommandPaletteResources(
  options: BuildCommandPaletteResourcesOptions,
): CommandPaletteResource[] {
  const resources: CommandPaletteResource[] = [];

  options.maps
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((map) => {
      resources.push({
        key: `location:${map.id}`,
        type: 'location',
        typeLabel: 'Location',
        label: map.name,
        document: createLocationDocument(map),
      });
    });

  Array.from(options.tilesets.values())
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((tileset) => {
      resources.push({
        key: `tileset:${tileset.id}`,
        type: 'tileset',
        typeLabel: 'Tileset',
        label: tileset.name,
        document: createEditorResourceDocument({
          type: 'tileset',
          id: tileset.id,
          name: tileset.name,
        }),
      });
    });

  options.entityTypes
    .slice()
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .forEach((entityType) => {
      resources.push({
        key: `entity:${entityType.id}`,
        type: 'entity',
        typeLabel: 'Entity',
        label: entityType.displayName,
        secondaryLabel: entityType.folderPath || undefined,
        document: createEditorResourceDocument({
          type: 'entity',
          id: entityType.id,
          name: entityType.displayName,
        }),
        resourceId: entityType.id,
      });
    });

  options.characters
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((character) => {
      resources.push({
        key: `character:${character.id}`,
        type: 'character',
        typeLabel: 'Character',
        label: character.name,
        secondaryLabel: character.folderPath || undefined,
        document: createEditorResourceDocument({
          type: 'character',
          id: character.id,
          name: character.name,
        }),
        resourceId: character.id,
      });
    });

  options.items
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((item) => {
      resources.push({
        key: `item:${item.id}`,
        type: 'item',
        typeLabel: 'Item',
        label: item.name,
        secondaryLabel: item.folderPath || undefined,
        document: createEditorResourceDocument({
          type: 'item',
          id: item.id,
          name: item.name,
        }),
        resourceId: item.id,
      });
    });

  options.shops
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((shop) => {
      resources.push({
        key: `shop:${shop.id}`,
        type: 'shop',
        typeLabel: 'Shop',
        label: shop.name,
        secondaryLabel: shop.folderPath || undefined,
        document: createEditorResourceDocument({
          type: 'shop',
          id: shop.id,
          name: shop.name,
        }),
        resourceId: shop.id,
      });
    });

  (options.quests ?? []).forEach((quest) =>
    resources.push({
      key: `quest:${quest.id}`,
      type: 'quest',
      typeLabel: 'Quest',
      label: quest.title,
      secondaryLabel: quest.folderPath || undefined,
      resourceId: quest.id,
      document: createEditorResourceDocument({ type: 'quest', id: quest.id, name: quest.title }),
    }),
  );

  for (const [type, typeLabel, entries] of [
    ['building', 'Building', options.buildings ?? []],
    ['building-kit', 'Kit', options.buildingKits ?? []],
  ] as const)
    entries.forEach((entry) =>
      resources.push({
        key: `${type}:${entry.id}`,
        type,
        typeLabel,
        label: entry.name,
        secondaryLabel: entry.folderPath || undefined,
        resourceId: entry.id,
        document: createEditorResourceDocument({ type, id: entry.id, name: entry.name }),
      }),
    );

  (options.routines ?? []).forEach((routine) => {
    const label = routineLabel(routine, options.characters);
    resources.push({
      key: `routine:${routine.id}`,
      type: 'routine',
      typeLabel: 'Routine',
      label,
      secondaryLabel: routine.folderPath || undefined,
      document: createEditorResourceDocument({ type: 'routine', id: routine.id, name: label }),
      resourceId: routine.id,
    });
  });

  options.dialogues
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((dialogue) => {
      resources.push({
        key: `dialogue:${dialogue.id}`,
        type: 'dialogue',
        typeLabel: 'Dialogue',
        label: dialogue.name,
        secondaryLabel: dialogue.folderPath || undefined,
        document: createEditorResourceDocument({
          type: 'dialogue',
          id: dialogue.id,
          name: dialogue.name,
        }),
        resourceId: dialogue.id,
      });
    });

  for (const scene of options.cutscenes ?? []) {
    resources.push({
      key: `cutscene:${scene.id}`,
      type: 'cutscene',
      typeLabel: 'Cutscene',
      label: options.cutsceneLabels?.[scene.id] || scene.id,
      secondaryLabel: scene.mapId,
      resourceId: scene.id,
      document: createEditorResourceDocument({
        type: 'cutscene',
        id: scene.id,
        name: options.cutsceneLabels?.[scene.id] || scene.id,
      }),
    });
  }
  return resources;
}

export function searchCommandPaletteResources(
  resources: CommandPaletteResource[],
  query: string,
  filter: CommandPaletteFilter,
): CommandPaletteMatch[] {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = resources.filter((resource) => matchesFilter(resource, filter));

  if (!normalizedQuery) {
    return filtered.map((resource, index) => ({
      resource,
      matchedField: 'label',
      labelMatchIndices: EMPTY_SECONDARY_MATCH,
      secondaryMatchIndices: EMPTY_SECONDARY_MATCH,
      score: 1000 - index,
    }));
  }

  return filtered
    .map((resource) => getCommandPaletteMatch(resource, normalizedQuery))
    .filter((match): match is CommandPaletteMatch => match !== null)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.resource.label.localeCompare(right.resource.label);
    });
}

export function highlightText(
  value: string,
  matchIndices: number[],
): Array<{ text: string; highlighted: boolean }> {
  if (matchIndices.length === 0) {
    return [{ text: value, highlighted: false }];
  }

  const uniqueIndices = Array.from(new Set(matchIndices)).sort((left, right) => left - right);
  const segments: Array<{ text: string; highlighted: boolean }> = [];
  let start = 0;

  for (let index = 0; index < uniqueIndices.length; index += 1) {
    const current = uniqueIndices[index];
    if (current > start) {
      segments.push({ text: value.slice(start, current), highlighted: false });
    }

    let end = current + 1;
    while (index + 1 < uniqueIndices.length && uniqueIndices[index + 1] === end) {
      end += 1;
      index += 1;
    }

    segments.push({ text: value.slice(current, end), highlighted: true });
    start = end;
  }

  if (start < value.length) {
    segments.push({ text: value.slice(start), highlighted: false });
  }

  return segments;
}

function getCommandPaletteMatch(
  resource: CommandPaletteResource,
  query: string,
): CommandPaletteMatch | null {
  const labelPrefixIndex = resource.label.toLowerCase().indexOf(query);
  if (labelPrefixIndex === 0) {
    return {
      resource,
      matchedField: 'label',
      labelMatchIndices: createRange(labelPrefixIndex, query.length),
      secondaryMatchIndices: EMPTY_SECONDARY_MATCH,
      score: 3000 - resource.label.length,
    };
  }

  const labelContainsIndex = resource.label.toLowerCase().indexOf(query);
  if (labelContainsIndex > 0) {
    return {
      resource,
      matchedField: 'label',
      labelMatchIndices: createRange(labelContainsIndex, query.length),
      secondaryMatchIndices: EMPTY_SECONDARY_MATCH,
      score: 2600 - labelContainsIndex - resource.label.length,
    };
  }

  const fuzzyLabelMatch = fuzzyMatch(resource.label, query);
  if (fuzzyLabelMatch) {
    return {
      resource,
      matchedField: 'label',
      labelMatchIndices: fuzzyLabelMatch.indices,
      secondaryMatchIndices: EMPTY_SECONDARY_MATCH,
      score: 2200 - fuzzyLabelMatch.gaps * 5 - resource.label.length,
    };
  }

  if (resource.secondaryLabel) {
    const secondaryPrefixIndex = resource.secondaryLabel.toLowerCase().indexOf(query);
    if (secondaryPrefixIndex === 0) {
      return {
        resource,
        matchedField: 'secondary',
        labelMatchIndices: EMPTY_SECONDARY_MATCH,
        secondaryMatchIndices: createRange(secondaryPrefixIndex, query.length),
        score: 1600 - resource.secondaryLabel.length,
      };
    }

    const secondaryContainsIndex = resource.secondaryLabel.toLowerCase().indexOf(query);
    if (secondaryContainsIndex > 0) {
      return {
        resource,
        matchedField: 'secondary',
        labelMatchIndices: EMPTY_SECONDARY_MATCH,
        secondaryMatchIndices: createRange(secondaryContainsIndex, query.length),
        score: 1400 - secondaryContainsIndex - resource.secondaryLabel.length,
      };
    }

    const fuzzySecondaryMatch = fuzzyMatch(resource.secondaryLabel, query);
    if (fuzzySecondaryMatch) {
      return {
        resource,
        matchedField: 'secondary',
        labelMatchIndices: EMPTY_SECONDARY_MATCH,
        secondaryMatchIndices: fuzzySecondaryMatch.indices,
        score: 1200 - fuzzySecondaryMatch.gaps * 5 - resource.secondaryLabel.length,
      };
    }
  }

  return null;
}

function fuzzyMatch(value: string, query: string): { indices: number[]; gaps: number } | null {
  const normalizedValue = value.toLowerCase();
  const indices: number[] = [];
  let searchStart = 0;
  let gaps = 0;
  let previousIndex = -1;

  for (const char of query) {
    const foundIndex = normalizedValue.indexOf(char, searchStart);
    if (foundIndex === -1) {
      return null;
    }
    if (previousIndex >= 0) {
      gaps += Math.max(0, foundIndex - previousIndex - 1);
    }
    indices.push(foundIndex);
    previousIndex = foundIndex;
    searchStart = foundIndex + 1;
  }

  return { indices, gaps };
}

function createRange(start: number, length: number): number[] {
  return Array.from({ length }, (_, index) => start + index);
}

function matchesFilter(resource: CommandPaletteResource, filter: CommandPaletteFilter): boolean {
  if (filter === 'all') return true;

  switch (filter) {
    case 'locations':
      return resource.type === 'location';
    case 'tilesets':
      return resource.type === 'tileset';
    case 'entities':
      return resource.type === 'entity';
    case 'characters':
      return resource.type === 'character';
    case 'items':
      return resource.type === 'item';
    case 'shops':
      return resource.type === 'shop';
    case 'quests':
      return resource.type === 'quest';
    case 'buildings':
      return resource.type === 'building' || resource.type === 'building-kit';
    case 'routines':
      return resource.type === 'routine';
    case 'cutscenes':
      return resource.type === 'cutscene';
    case 'dialogues':
      return resource.type === 'dialogue';
    default:
      return true;
  }
}
