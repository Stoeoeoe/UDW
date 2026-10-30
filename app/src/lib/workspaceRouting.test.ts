import { describe, expect, it } from 'vitest';
import { documentFromHash, documentToHash } from './workspaceRouting';
import {
  Character,
  DialogueDocument,
  EntityType,
  Item,
  Map as GameMap,
  Tileset,
} from '../types/schema';

function createMap(overrides: Partial<GameMap> = {}): GameMap {
  return {
    version: 1,
    id: 'map-1',
    name: 'Map 1',
    width: 10,
    height: 8,
    baseTilesetId: 'tileset-1',
    tilesetRefs: ['tileset-1'],
    layers: [],
    entities: [],
    ...overrides,
  };
}

function createSnapshot(
  overrides: {
    maps?: GameMap[];
    tilesets?: Map<string, Tileset>;
    characters?: Character[];
    entityTypes?: EntityType[];
    items?: Item[];
    dialogues?: DialogueDocument[];
  } = {},
) {
  return {
    maps: overrides.maps ?? [],
    tilesets: overrides.tilesets ?? new Map<string, Tileset>(),
    characters: overrides.characters ?? [],
    entityTypes: overrides.entityTypes ?? [],
    items: overrides.items ?? [],
    dialogues: overrides.dialogues ?? [],
  };
}

describe('workspaceRouting', () => {
  it('restores the cutscene workspace route', () => {
    const scene = documentFromHash('#/?doc=cutscenes', createSnapshot());
    expect(scene).toEqual({ kind: 'cutscenes', label: 'Cutscenes', saveUnitId: 'cutscenes' });
    expect(documentToHash(scene!)).toBe('#/?doc=cutscenes');
  });
  it('does not force a base variation when a location has variations but no explicit variant', () => {
    const document = documentFromHash(
      '#/?doc=location&id=map-1',
      createSnapshot({
        maps: [
          createMap({
            variations: [{ id: 'winter', displayName: 'Winter', tilesetSuffix: '' }],
          }),
        ],
      }),
    );

    expect(document).toMatchObject({
      kind: 'location',
      mapId: 'map-1',
      variationId: null,
    });
  });

  it('resolves first-class singleton editor routes', () => {
    const entitiesDocument = documentFromHash('#/?doc=entities', createSnapshot());

    expect(entitiesDocument).toMatchObject({
      kind: 'entities',
      label: 'Entities',
      saveUnitId: 'configuration',
    });
  });

  it('round-trips first-class resource routes for non-map documents', () => {
    const snapshot = createSnapshot({
      characters: [{ id: 'marcus', name: 'Marcus', icon: 'GiPerson' }],
      entityTypes: [
        {
          id: 'merchant-stall',
          displayName: 'Merchant Stall',
          category: 'object',
          placeholderColor: '#ffffff',
          properties: [],
        },
      ],
      items: [
        {
          id: 'apple',
          name: 'Apple',
          category: 'Food',
          icon: '',
          description: '',
          maxStackSize: 10,
        },
      ],
      dialogues: [
        {
          version: 1,
          id: 'intro',
          name: 'Intro Conversation',
          startNodeId: 'step_1',
          oneShot: false,
          tags: [],
          createdAt: '2026-04-23T00:00:00.000Z',
          updatedAt: '2026-04-23T00:00:00.000Z',
          nodes: [{ id: 'step_1', type: 'line', text: '', msgKey: 'dlg.intro.01', next: null }],
        },
      ],
    });

    expect(
      documentFromHash(
        documentToHash({
          kind: 'character',
          characterId: 'marcus',
          label: 'Marcus',
          saveUnitId: 'character:marcus',
        }),
        snapshot,
      ),
    ).toMatchObject({ kind: 'character', characterId: 'marcus' });

    expect(
      documentFromHash(
        documentToHash({
          kind: 'entity',
          entityTypeId: 'merchant-stall',
          label: 'Merchant Stall',
          saveUnitId: 'entity:merchant-stall',
        }),
        snapshot,
      ),
    ).toMatchObject({
      kind: 'entity',
      entityTypeId: 'merchant-stall',
      saveUnitId: 'entity:merchant-stall',
    });

    expect(
      documentFromHash(
        documentToHash({
          kind: 'item',
          itemId: 'apple',
          label: 'Apple',
          saveUnitId: 'item:apple',
        }),
        snapshot,
      ),
    ).toMatchObject({ kind: 'item', itemId: 'apple' });

    expect(
      documentFromHash(
        documentToHash({
          kind: 'dialogue',
          dialogueId: 'intro',
          label: 'Intro Conversation',
          saveUnitId: 'dialogue:intro',
        }),
        snapshot,
      ),
    ).toMatchObject({ kind: 'dialogue', dialogueId: 'intro' });

  });
});
