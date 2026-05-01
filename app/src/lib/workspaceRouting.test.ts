import { describe, expect, it } from 'vitest';
import { documentFromHash, documentToHash } from './workspaceRouting';
import {
  Actor,
  DialogueDocument,
  EntityType,
  GameVariable,
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
    actors?: Actor[];
    entityTypes?: EntityType[];
    items?: Item[];
    dialogues?: DialogueDocument[];
    gameVariables?: GameVariable[];
  } = {},
) {
  return {
    maps: overrides.maps ?? [],
    tilesets: overrides.tilesets ?? new Map<string, Tileset>(),
    actors: overrides.actors ?? [],
    entityTypes: overrides.entityTypes ?? [],
    items: overrides.items ?? [],
    dialogues: overrides.dialogues ?? [],
    gameVariables: overrides.gameVariables ?? [],
  };
}

describe('workspaceRouting', () => {
  it('treats a legacy location overview route as a map route', () => {
    const document = documentFromHash(
      '#/?doc=location-overview&id=map-1',
      createSnapshot({ maps: [createMap()] }),
    );

    expect(document).toMatchObject({
      kind: 'location',
      mapId: 'map-1',
      variationId: null,
    });
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

  it('resolves first-class singleton editor routes and preserves legacy screen compatibility', () => {
    const entitiesDocument = documentFromHash('#/?doc=entities', createSnapshot());
    const legacyEntitiesDocument = documentFromHash(
      '#/?doc=legacy&mode=entities',
      createSnapshot(),
    );

    expect(entitiesDocument).toMatchObject({
      kind: 'entities',
      label: 'Entities',
      saveUnitId: 'configuration',
    });
    expect(legacyEntitiesDocument).toMatchObject({
      kind: 'entities',
      label: 'Entities',
      saveUnitId: 'configuration',
    });
  });

  it('round-trips first-class resource routes for non-map documents', () => {
    const snapshot = createSnapshot({
      actors: [{ id: 'marcus', name: 'Marcus', icon: 'GiPerson' }],
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
      gameVariables: [
        {
          key: 'weather.isRain',
          type: 'boolean',
          category: 'Weather',
          defaultValue: false,
        },
      ],
    });

    expect(
      documentFromHash(
        documentToHash({
          kind: 'actor',
          actorId: 'marcus',
          label: 'Marcus',
          saveUnitId: 'actor:marcus',
        }),
        snapshot,
      ),
    ).toMatchObject({ kind: 'actor', actorId: 'marcus' });

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

    expect(
      documentFromHash(
        documentToHash({
          kind: 'variable',
          variableKey: 'weather.isRain',
          label: 'weather.isRain',
          saveUnitId: 'configuration',
        }),
        snapshot,
      ),
    ).toMatchObject({ kind: 'variable', variableKey: 'weather.isRain' });
  });
});
