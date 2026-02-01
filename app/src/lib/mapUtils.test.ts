import { describe, it, expect } from 'vitest';
import { getVariationChain, resolveTileAt, resolveEntities } from './mapUtils';
import { Map } from '../types/schema';

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
                    [2, 3]
                ]
            }
        ],
        entities: [
            { id: 'e1', typeId: 'npc', position: [0, 0], properties: {} }
        ],
        variations: [
            {
                id: 'v1',
                displayName: 'Variation 1',
                kind: 'generic',
                layerOverrides: {
                    'l1': {
                        mode: 'merge',
                        data: [
                            ['v1:0', null],
                            [null, null]
                        ]
                    }
                },
                entityOverrides: [
                    { action: 'add', entity: { id: 'e2', typeId: 'item', position: [1, 1], properties: {} } }
                ]
            },
            {
                id: 'v2',
                parentId: 'v1',
                displayName: 'Variation 2',
                kind: 'generic',
                layerOverrides: {
                    'l1': {
                        mode: 'merge',
                        data: [
                            [null, 'v2:1'],
                            [null, null]
                        ]
                    }
                },
                entityOverrides: [
                    { action: 'remove', entityId: 'e1' }
                ]
            }
        ]
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
            expect(entities.find(e => e.id === 'e1')).toBeDefined();
            expect(entities.find(e => e.id === 'e2')).toBeDefined();
        });

        it('should resolve removal entity overrides in inheritance', () => {
            const entities = resolveEntities(mockMap, 'v2');
            expect(entities).toHaveLength(1);
            expect(entities[0].id).toBe('e2'); // e1 removed in v2, e2 added in v1
        });
    });
});
