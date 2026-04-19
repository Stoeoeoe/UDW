import { describe, expect, it } from 'vitest';
import { buildWorkspaceTree } from './workspaceTree';
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

describe('buildWorkspaceTree', () => {
  it('renders each location as a direct map entry when there are no variations', () => {
    const map = createMap({});
    const tree = buildWorkspaceTree([map], new Map<string, Tileset>());
    const locations = tree.find((node) => node.id === 'group:locations');

    expect(locations?.children).toHaveLength(1);
    expect(locations?.children?.[0]).toMatchObject({
      kind: 'leaf',
      label: 'Map 1',
      document: {
        kind: 'location',
        mapId: 'map-1',
        variationId: null,
      },
    });
  });

  it('keeps the tree flat even when a location has variations', () => {
    const map = createMap({
      variations: [
        {
          id: 'winter',
          displayName: 'Winter',
          tilesetSuffix: '',
        },
      ],
    });
    const tree = buildWorkspaceTree([map], new Map<string, Tileset>());
    const locations = tree.find((node) => node.id === 'group:locations');

    expect(locations?.children?.[0]).toMatchObject({
      kind: 'leaf',
      label: 'Map 1',
      document: {
        kind: 'location',
        mapId: 'map-1',
        variationId: null,
      },
    });
    expect(locations?.children?.[0]?.children).toBeUndefined();
  });

  it('includes the remaining singleton editor screens under Game Data', () => {
    const tree = buildWorkspaceTree([], new Map<string, Tileset>());
    const gameData = tree.find((node) => node.id === 'group:game-data');

    expect(gameData?.children?.map((node) => node.label)).toEqual([
      'Entities',
      'Actors',
      'Items',
      'Dialogues',
      'Scripting',
    ]);
    expect(gameData?.children?.[0]?.document).toMatchObject({
      kind: 'entities',
      saveUnitId: 'configuration',
    });
    expect(gameData?.children?.[4]?.document).toMatchObject({
      kind: 'scripting',
      saveUnitId: 'configuration',
    });
  });
});
