import { describe, expect, it } from 'vitest';
import {
  buildCommandPaletteResources,
  highlightText,
  searchCommandPaletteResources,
} from './workspaceCommandPalette';

describe('workspaceCommandPalette', () => {
  const resources = buildCommandPaletteResources({
    maps: [
      {
        version: 1,
        id: 'village',
        name: 'Village',
        width: 10,
        height: 10,
        baseTilesetId: 'village-tiles',
        tilesetRefs: ['village-tiles'],
        layers: [],
        entities: [],
      },
    ],
    tilesets: new Map([
      [
        'village-tiles',
        {
          version: 1,
          id: 'village-tiles',
          name: 'Village Tileset',
          spriteSheet: 'village.png',
          columns: 8,
          tileCount: 64,
          tiles: {},
        },
      ],
    ]),
    entityTypes: [
      {
        id: 'merchant-stall',
        displayName: 'Merchant Stall',
        category: 'object',
        placeholderColor: '#ffffff',
        properties: [],
      },
    ],
    actors: [{ id: 'marcus', name: 'Marcus', icon: 'GiPerson' }],
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
        oneShot: false,
        startNodeId: 'step_1',
        tags: [],
        createdAt: '2026-04-23T00:00:00.000Z',
        updatedAt: '2026-04-23T00:00:00.000Z',
        nodes: [{ id: 'step_1', type: 'line', text: '', msgKey: 'dlg.intro.01', next: null }],
      },
    ],
  });

  it('prefers prefix matches ahead of fuzzy matches', () => {
    const matches = searchCommandPaletteResources(resources, 'vi', 'all');

    expect(matches[0]?.resource.label).toBe('Village');
    expect(matches[1]?.resource.label).toBe('Village Tileset');
  });

  it('filters by resource type chip', () => {
    const matches = searchCommandPaletteResources(resources, 'mar', 'actors');

    expect(matches).toHaveLength(1);
    expect(matches[0]?.resource.type).toBe('actor');
    expect(matches[0]?.resource.label).toBe('Marcus');
  });

  it('returns fuzzy name matches when the query is non-contiguous', () => {
    const matches = searchCommandPaletteResources(resources, 'mrs', 'all');

    expect(matches[0]?.resource.label).toBe('Marcus');
    expect(matches[0]?.labelMatchIndices).toEqual([0, 2, 5]);
  });

  it('exposes per-resource documents and folder paths for non-map resources', () => {
    const actor = resources.find((resource) => resource.key === 'actor:marcus');
    const entity = buildCommandPaletteResources({
      maps: [],
      tilesets: new Map(),
      entityTypes: [
        {
          id: 'merchant-stall',
          displayName: 'Merchant Stall',
          category: 'object',
          placeholderColor: '#ffffff',
          properties: [],
          folderPath: 'World/Town',
        },
      ],
      actors: [{ id: 'marcus', name: 'Marcus', icon: 'GiPerson', folderPath: 'NPCs/Villagers' }],
      items: [],
      dialogues: [],
    });

    expect(actor).toMatchObject({
      document: {
        kind: 'actor',
        actorId: 'marcus',
      },
    });
    expect(entity[0]).toMatchObject({
      secondaryLabel: 'World/Town',
      document: {
        kind: 'entity',
        entityTypeId: 'merchant-stall',
        saveUnitId: 'entity:merchant-stall',
      },
    });
  });

  it('splits highlighted text into emphasized and plain segments', () => {
    expect(highlightText('Marcus', [0, 1, 4])).toEqual([
      { text: 'Ma', highlighted: true },
      { text: 'rc', highlighted: false },
      { text: 'u', highlighted: true },
      { text: 's', highlighted: false },
    ]);
  });
});
