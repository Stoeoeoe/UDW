import { describe, expect, it } from 'vitest';
import { buildWorkspaceTree } from './workspaceTree';
import {
  Character,
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

function createTreeInput(
  overrides: {
    maps?: GameMap[];
    tilesets?: Map<string, Tileset>;
    characters?: Character[];
    entityTypes?: EntityType[];
    items?: Item[];
    dialogues?: DialogueDocument[];
    gameVariables?: GameVariable[];
  } = {},
) {
  return {
    maps: overrides.maps ?? [],
    tilesets: overrides.tilesets ?? new Map<string, Tileset>(),
    characters: overrides.characters ?? [],
    entityTypes: overrides.entityTypes ?? [],
    items: overrides.items ?? [],
    dialogues: overrides.dialogues ?? [],
    gameVariables: overrides.gameVariables ?? [],
  };
}

describe('buildWorkspaceTree', () => {
  it('renders each location as a direct map entry when there are no variations', () => {
    const tree = buildWorkspaceTree(createTreeInput({ maps: [createMap()] }));
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
    const tree = buildWorkspaceTree(
      createTreeInput({
        maps: [
          createMap({
            variations: [{ id: 'winter', displayName: 'Winter', tilesetSuffix: '' }],
          }),
        ],
      }),
    );
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

  it('groups resources into virtual folders and preserves leaf documents', () => {
    const tree = buildWorkspaceTree(
      createTreeInput({
        maps: [
          createMap({ id: 'village', name: 'Village', folderPath: 'World/Towns' }),
          createMap({ id: 'forest', name: 'Forest' }),
        ],
      }),
    );
    const locations = tree.find((node) => node.id === 'group:locations');
    const worldFolder = locations?.children?.find((node) => node.id === 'folder:location:World');
    const townsFolder = worldFolder?.children?.find(
      (node) => node.id === 'folder:location:World/Towns',
    );

    expect(locations?.children?.map((node) => node.label)).toEqual(['World', 'Forest']);
    expect(townsFolder?.children?.[0]).toMatchObject({
      kind: 'leaf',
      label: 'Village',
      document: {
        kind: 'location',
        mapId: 'village',
      },
    });
  });

  it('keeps scripting as a single overview screen and builds resource sections for the rest', () => {
    const tree = buildWorkspaceTree(
      createTreeInput({
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
        gameVariables: [
          {
            key: 'weather.isRain',
            type: 'boolean',
            category: 'Weather',
            defaultValue: false,
          },
        ],
      }),
    );

    expect(tree.map((node) => node.id)).toEqual([
      'group:locations',
      'group:tilesets',
      'group:characters',
      'group:entities',
      'group:items',
      'group:dialogues',
      'group:cutscenes',
      'scripting',
      'settings',
      'config',
    ]);
    expect(
      tree.find((node) => node.id === 'group:characters')?.children?.[0]?.document,
    ).toMatchObject({
      kind: 'character',
      characterId: 'marcus',
    });
    expect(
      tree.find((node) => node.id === 'group:characters')?.children?.[0]?.resourceIcon,
    ).toEqual({
      type: 'game-icon',
      value: 'GiPerson',
    });
    expect(
      tree.find((node) => node.id === 'group:entities')?.children?.[0]?.resourceIcon,
    ).toBeUndefined();
    expect(
      tree.find((node) => node.id === 'group:entities')?.children?.[0]?.document,
    ).toMatchObject({
      kind: 'entity',
      entityTypeId: 'merchant-stall',
      saveUnitId: 'entity:merchant-stall',
    });
    expect(tree.find((node) => node.id === 'scripting')?.document).toMatchObject({
      kind: 'scripting',
      saveUnitId: 'configuration',
    });
  });
});
