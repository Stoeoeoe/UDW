import { describe, it, expect } from 'vitest';
import { getVariationChain, resolveTileAt, resolveEntities, resolveMapContext } from './mapUtils';
import type { Map } from '../types/schema';

describe('mapUtils', () => {
  const mockMap: Map = {
    version: 1,
    id: 'test-map',
    name: 'Test Map',
    width: 2,
    height: 2,
    baseTilesetId: 'ts1',
    tilesetRefs: ['ts1'],
    layers: [
      {
        id: 'l1',
        name: 'Layer 1',
        kind: 'visual',
        visible: true,
        locked: false,
        opacity: 1,
        zOrder: 0,
        data: [
          [0, 1],
          [2, 3],
        ],
      },
    ],
    entities: [{ id: 'e1', typeId: 'npc', position: [0, 0], properties: {} }],
    variations: [
      {
        id: 'v1',
        displayName: 'Variation 1',
        kind: 'generic',
        layerOverrides: {
          l1: {
            mode: 'merge',
            data: [
              ['v1:0', null],
              [null, null],
            ],
          },
        },
        entityOverrides: [
          { action: 'add', entity: { id: 'e2', typeId: 'item', position: [1, 1], properties: {} } },
        ],
      },
      {
        id: 'v2',
        parentId: 'v1',
        displayName: 'Variation 2',
        kind: 'generic',
        layerOverrides: {
          l1: {
            mode: 'merge',
            data: [
              [null, 'v2:1'],
              [null, null],
            ],
          },
        },
        entityOverrides: [{ action: 'remove', entityId: 'e1' }],
      },
      {
        id: 'v3',
        displayName: 'Variation 3 Replace',
        kind: 'generic',
        layerOverrides: {
          l1: {
            mode: 'replace',
            data: [
              [null, 'v3:1'],
              ['v3:2', null],
            ],
          },
        },
      },
    ],
  };

  describe('getVariationChain', () => {
    it('should return only base if no variation id provided', () => {
      const chain = getVariationChain(mockMap, null);
      expect(chain).toEqual(['base']);
    });

    it('should return simple chain for root variation', () => {
      const chain = getVariationChain(mockMap, 'v1');
      expect(chain).toEqual(['base', mockMap.variations![0]]);
    });

    it('should return full inheritance chain for nested variation', () => {
      const chain = getVariationChain(mockMap, 'v2');
      expect(chain).toEqual(['base', mockMap.variations![0], mockMap.variations![1]]);
    });
  });

  describe('resolveTileAt', () => {
    it('should resolve base tiles correctly', () => {
      expect(resolveTileAt(mockMap, 'l1', 0, 0, null)).toBe('ts1:0');
      expect(resolveTileAt(mockMap, 'l1', 1, 1, null)).toBe('ts1:3');
    });

    it('should resolve direct overrides', () => {
      expect(resolveTileAt(mockMap, 'l1', 0, 0, 'v1')).toBe('v1:0');
    });

    it('should fall back to base for null overrides', () => {
      expect(resolveTileAt(mockMap, 'l1', 1, 0, 'v1')).toBe('ts1:1');
    });

    it('should resolve nested overrides', () => {
      // v2 overrides (0,1), v1 overrides (0,0), others are base
      expect(resolveTileAt(mockMap, 'l1', 0, 0, 'v2')).toBe('v1:0');
      expect(resolveTileAt(mockMap, 'l1', 1, 0, 'v2')).toBe('v2:1');
      expect(resolveTileAt(mockMap, 'l1', 1, 1, 'v2')).toBe('ts1:3');
    });

    it('should treat replace override null as explicit clear (no fallback)', () => {
      expect(resolveTileAt(mockMap, 'l1', 0, 0, 'v3')).toBeNull();
      expect(resolveTileAt(mockMap, 'l1', 1, 0, 'v3')).toBe('v3:1');
      expect(resolveTileAt(mockMap, 'l1', 0, 1, 'v3')).toBe('v3:2');
      expect(resolveTileAt(mockMap, 'l1', 1, 1, 'v3')).toBeNull();
    });

    it('should resolve object-layer tiles from objectGroups', () => {
      const objectMap: Map = {
        ...mockMap,
        layers: [
          {
            id: 'objects',
            name: 'Objects',
            kind: 'object',
            visible: true,
            locked: false,
            opacity: 1,
            zOrder: 1,
            objectGroups: [
              {
                id: 'obj_tree',
                tiles: [
                  { x: 1, y: 1, tilesetId: 'ts1', tileIndex: 7 },
                  { x: 1, y: 0, tilesetId: 'ts1', tileIndex: 3 },
                ],
              },
            ],
          },
        ],
      };

      expect(resolveTileAt(objectMap, 'objects', 1, 1, null)).toBe('ts1:7');
      expect(resolveTileAt(objectMap, 'objects', 1, 0, null)).toBe('ts1:3');
      expect(resolveTileAt(objectMap, 'objects', 0, 0, null)).toBeNull();
    });

    it('should resolve object-layer tiles from objectInstances', () => {
      const objectMap: Map = {
        ...mockMap,
        layers: [
          {
            id: 'objects',
            name: 'Objects',
            kind: 'object',
            visible: true,
            locked: false,
            opacity: 1,
            zOrder: 1,
            objectInstances: [
              {
                id: 'inst_tree',
                tilesetId: 'ts1',
                objectDefinitionId: 'tree',
                x: 64,
                y: 80,
              },
            ],
          },
        ],
      };

      const tilesets = new globalThis.Map([
        [
          'ts1',
          {
            version: 1,
            id: 'ts1',
            name: 'Tileset',
            spriteSheet: 'ts1.png',
            columns: 4,
            tileCount: 16,
            tiles: {},
            objects: [
              {
                id: 'tree',
                name: 'Tree',
                tiles: [
                  { x: 0, y: 0, tileIndex: 1 },
                  { x: 0, y: 1, tileIndex: 5 },
                ],
              },
            ],
          },
        ],
      ]);

      expect(resolveTileAt(objectMap, 'objects', 4, 5, null, tilesets)).toBe('ts1:1');
      expect(resolveTileAt(objectMap, 'objects', 4, 6, null, tilesets)).toBe('ts1:5');
      expect(resolveTileAt(objectMap, 'objects', 5, 5, null, tilesets)).toBeNull();
    });
  });

  describe('resolveEntities', () => {
    it('should return base entities when no variation', () => {
      const entities = resolveEntities(mockMap, null);
      expect(entities).toHaveLength(1);
      expect(entities[0].id).toBe('e1');
    });

    it('should resolve additive entity overrides', () => {
      const entities = resolveEntities(mockMap, 'v1');
      expect(entities).toHaveLength(2);
      expect(entities.find((e) => e.id === 'e1')).toBeDefined();
      expect(entities.find((e) => e.id === 'e2')).toBeDefined();
    });

    it('should resolve removal entity overrides in inheritance', () => {
      const entities = resolveEntities(mockMap, 'v2');
      expect(entities).toHaveLength(1);
      expect(entities[0].id).toBe('e2'); // e1 removed in v2, e2 added in v1
    });

    it('should apply modify entity overrides', () => {
      const mapWithModify: Map = {
        ...mockMap,
        variations: [
          {
            id: 'vmod',
            displayName: 'Modify Variation',
            kind: 'generic',
            entityOverrides: [
              {
                action: 'modify',
                entityId: 'e1',
                entity: { label: 'Modified Label', properties: { hp: 100 } },
              },
            ],
          },
        ],
      };
      const entities = resolveEntities(mapWithModify, 'vmod');
      expect(entities).toHaveLength(1);
      expect(entities[0].id).toBe('e1');
      expect(entities[0].label).toBe('Modified Label');
      expect(entities[0].properties.hp).toBe(100);
    });

    it('should collect entities from entity-kind layers', () => {
      const mapWithEntityLayer: Map = {
        ...mockMap,
        layers: [
          ...mockMap.layers,
          {
            id: 'entities-layer',
            name: 'Entities',
            kind: 'entity',
            visible: true,
            locked: false,
            opacity: 1,
            zOrder: 1,
            entities: [{ id: 'layer-e1', typeId: 'npc', position: [5, 5], properties: {} }],
          },
        ],
      };
      const entities = resolveEntities(mapWithEntityLayer, null);
      expect(entities.find((e) => e.id === 'e1')).toBeDefined();
      expect(entities.find((e) => e.id === 'layer-e1')).toBeDefined();
    });
  });

  describe('resolveMapContext', () => {
    it('returns base map name and tilesetId when no variation', () => {
      const ctx = resolveMapContext(mockMap, null);
      expect(ctx.name).toBe('Test Map');
      expect(ctx.baseTilesetId).toBe('ts1');
      expect(ctx.description).toBeUndefined();
    });

    it('returns base context when variation has no metadata overrides', () => {
      const ctx = resolveMapContext(mockMap, 'v1');
      expect(ctx.name).toBe('Test Map');
      expect(ctx.baseTilesetId).toBe('ts1');
    });

    it('applies mapNameOverride from a variation', () => {
      const mapWithMeta: Map = {
        ...mockMap,
        variations: [
          {
            id: 'vsummer',
            displayName: 'Summer',
            kind: 'season',
            metadata: { mapNameOverride: 'Summer Map' },
          },
        ],
      };
      const ctx = resolveMapContext(mapWithMeta, 'vsummer');
      expect(ctx.name).toBe('Summer Map');
    });

    it('ignores blank mapNameOverride', () => {
      const mapWithBlank: Map = {
        ...mockMap,
        variations: [
          {
            id: 'vblank',
            displayName: 'Blank Override',
            kind: 'generic',
            metadata: { mapNameOverride: '   ' },
          },
        ],
      };
      const ctx = resolveMapContext(mapWithBlank, 'vblank');
      expect(ctx.name).toBe('Test Map');
    });

    it('applies baseTilesetIdOverride from a variation', () => {
      const mapWithTilesetOverride: Map = {
        ...mockMap,
        variations: [
          {
            id: 'vwinter',
            displayName: 'Winter',
            kind: 'season',
            metadata: { baseTilesetIdOverride: 'ts1_winter' },
          },
        ],
      };
      const ctx = resolveMapContext(mapWithTilesetOverride, 'vwinter');
      expect(ctx.baseTilesetId).toBe('ts1_winter');
    });

    it('applies descriptionOverride from a variation', () => {
      const mapWithDesc: Map = {
        ...mockMap,
        metadata: { description: 'Base description' },
        variations: [
          {
            id: 'vdesc',
            displayName: 'Desc Override',
            kind: 'generic',
            metadata: { descriptionOverride: 'Overridden description' },
          },
        ],
      };
      const ctx = resolveMapContext(mapWithDesc, 'vdesc');
      expect(ctx.description).toBe('Overridden description');
    });

    it('clears description when descriptionOverride is empty string', () => {
      const mapWithDesc: Map = {
        ...mockMap,
        metadata: { description: 'Base description' },
        variations: [
          {
            id: 'vclear',
            displayName: 'Clear Desc',
            kind: 'generic',
            metadata: { descriptionOverride: '' },
          },
        ],
      };
      const ctx = resolveMapContext(mapWithDesc, 'vclear');
      expect(ctx.description).toBeUndefined();
    });

    it('child variation metadata takes precedence over parent', () => {
      const mapWithChain: Map = {
        ...mockMap,
        variations: [
          {
            id: 'vparent',
            displayName: 'Parent',
            kind: 'generic',
            metadata: { mapNameOverride: 'Parent Name' },
          },
          {
            id: 'vchild',
            displayName: 'Child',
            kind: 'generic',
            parentId: 'vparent',
            metadata: { mapNameOverride: 'Child Name' },
          },
        ],
      };
      const ctx = resolveMapContext(mapWithChain, 'vchild');
      expect(ctx.name).toBe('Child Name');
    });
  });
});
