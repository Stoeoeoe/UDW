import { Actor, DialogueIndex, EntityType, Item, Map as GameMap, Tileset } from '../types/schema';
import { WorkspaceDocument } from '../types/workspace';
import { createEditorResourceDocument } from './editorResourceTypes';
import { createLocationDocument } from './workspaceRouting';

export type CommandPaletteFilter =
  | 'all'
  | 'locations'
  | 'tilesets'
  | 'entities'
  | 'actors'
  | 'items'
  | 'dialogues';

export type CommandPaletteResourceType =
  | 'location'
  | 'tileset'
  | 'entity'
  | 'actor'
  | 'item'
  | 'dialogue';

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
  actors: Actor[];
  items: Item[];
  dialogueIndex: DialogueIndex | null;
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

  options.actors
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((actor) => {
      resources.push({
        key: `actor:${actor.id}`,
        type: 'actor',
        typeLabel: 'Actor',
        label: actor.name,
        secondaryLabel: actor.folderPath || undefined,
        document: createEditorResourceDocument({
          type: 'actor',
          id: actor.id,
          name: actor.name,
        }),
        resourceId: actor.id,
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

  (options.dialogueIndex?.dialogues ?? [])
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
    case 'actors':
      return resource.type === 'actor';
    case 'items':
      return resource.type === 'item';
    case 'dialogues':
      return resource.type === 'dialogue';
    case 'quests':
      return resource.type === 'quest';
    case 'audio':
      return resource.type === 'audio';
    default:
      return true;
  }
}
