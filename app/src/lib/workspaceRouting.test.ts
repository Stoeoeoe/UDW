import { describe, expect, it } from 'vitest';
import { documentFromHash } from './workspaceRouting';
import { Map as GameMap, Tileset } from '../types/schema';

function createMap(overrides: Partial<GameMap>): GameMap {
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

describe('documentFromHash', () => {
  it('treats a legacy location overview route as a map route', () => {
    const document = documentFromHash('#/?doc=location-overview&id=map-1', {
      maps: [createMap({})],
      tilesets: new Map<string, Tileset>(),
    });

    expect(document).toMatchObject({
      kind: 'location',
      mapId: 'map-1',
      variationId: null,
    });
  });

  it('resolves a base-only location route without forcing a base variant', () => {
    const document = documentFromHash('#/?doc=location&id=map-1', {
      maps: [createMap({})],
      tilesets: new Map<string, Tileset>(),
    });

    expect(document).toMatchObject({
      kind: 'location',
      mapId: 'map-1',
      variationId: null,
    });
  });

  it('does not force a base variation when a location has variations but no explicit variant', () => {
    const document = documentFromHash('#/?doc=location&id=map-1', {
      maps: [
        createMap({
          variations: [
            {
              id: 'winter',
              displayName: 'Winter',
              tilesetSuffix: '',
            },
          ],
        }),
      ],
      tilesets: new Map<string, Tileset>(),
    });

    expect(document).toMatchObject({
      kind: 'location',
      mapId: 'map-1',
      variationId: null,
    });
  });

  it('preserves an explicit variation in a legacy location route as initial editor context', () => {
    const document = documentFromHash('#/?doc=location&id=map-1&variant=winter', {
      maps: [
        createMap({
          variations: [
            {
              id: 'winter',
              displayName: 'Winter',
              tilesetSuffix: '',
            },
          ],
        }),
      ],
      tilesets: new Map<string, Tileset>(),
    });

    expect(document).toMatchObject({
      kind: 'location',
      mapId: 'map-1',
      variationId: 'winter',
    });
  });

  it('resolves first-class singleton editor routes and preserves legacy screen compatibility', () => {
    const entitiesDocument = documentFromHash('#/?doc=entities', {
      maps: [],
      tilesets: new Map<string, Tileset>(),
    });
    const legacyEntitiesDocument = documentFromHash('#/?doc=legacy&mode=entities', {
      maps: [],
      tilesets: new Map<string, Tileset>(),
    });

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
});
