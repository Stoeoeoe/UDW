import { describe, it, expect, beforeEach } from 'vitest';
import {
    CORNER_TOP_LEFT,
    CORNER_TOP_RIGHT,
    CORNER_BOTTOM_LEFT,
    CORNER_BOTTOM_RIGHT,
    TerrainCorners,
    findMatchingTiles,
    findBestMatchingTile,
    scoreTileMatch,
    findFuzzyMatchingTiles,
    findBestMatchingTileWithFallback,
    getAffectedCorners,
    getTilesToUpdate,
    getCornerTerrainsForTile,
    buildTerrainGridFromLayer,
    applyTerrainAtCorner,
    applyTerrainToTile,
    isTileEmpty,
} from './terrainUtils';
import { Tileset } from '../types/schema';

// Mock tileset for testing
function createMockTileset(): Tileset {
    return {
        version: 1,
        id: 'test-tileset',
        name: 'Test Tileset',
        spriteSheet: 'test.png',
        tileWidth: 16,
        tileHeight: 16,
        columns: 8,
        tileCount: 64,
        tiles: {
            // Tile 0: All grass
            0: {
                terrainCorners: ['grass', 'grass', 'grass', 'grass'],
                probability: 1,
            },
            // Tile 1: All water
            1: {
                terrainCorners: ['water', 'water', 'water', 'water'],
                probability: 1,
            },
            // Tile 2: Grass top, water bottom (transition)
            2: {
                terrainCorners: ['grass', 'grass', 'water', 'water'],
                probability: 1,
            },
            // Tile 3: Water top, grass bottom (transition)
            3: {
                terrainCorners: ['water', 'water', 'grass', 'grass'],
                probability: 1,
            },
            // Tile 4: Grass left, water right (transition)
            4: {
                terrainCorners: ['grass', 'water', 'grass', 'water'],
                probability: 1,
            },
            // Tile 5: Water left, grass right (transition)
            5: {
                terrainCorners: ['water', 'grass', 'water', 'grass'],
                probability: 1,
            },
            // Tile 6: Grass with water corner (bottom-right)
            6: {
                terrainCorners: ['grass', 'grass', 'grass', 'water'],
                probability: 1,
            },
            // Tile 7: Grass with water corner (bottom-left)
            7: {
                terrainCorners: ['grass', 'grass', 'water', 'grass'],
                probability: 1,
            },
            // Tile 8: All null (empty terrain)
            8: {
                terrainCorners: [null, null, null, null],
                probability: 1,
            },
            // Tile 9: No terrain corners defined
            9: {
                probability: 1,
            },
            // Tile 10: Mixed with null (grass top-left, others null)
            10: {
                terrainCorners: ['grass', null, null, null],
                probability: 1,
            },
            // Tile 11: Duplicate of all grass (for probability testing)
            11: {
                terrainCorners: ['grass', 'grass', 'grass', 'grass'],
                probability: 2, // Higher probability
            },
        },
    };
}

describe('Corner Constants', () => {
    it('should have correct corner indices', () => {
        expect(CORNER_TOP_LEFT).toBe(0);
        expect(CORNER_TOP_RIGHT).toBe(1);
        expect(CORNER_BOTTOM_LEFT).toBe(2);
        expect(CORNER_BOTTOM_RIGHT).toBe(3);
    });
});

describe('findMatchingTiles', () => {
    const tileset = createMockTileset();

    it('should find exact match for all-grass tile', () => {
        const corners: TerrainCorners = ['grass', 'grass', 'grass', 'grass'];
        const matches = findMatchingTiles(tileset, corners);
        expect(matches).toContain(0);
        expect(matches).toContain(11);
        expect(matches).toHaveLength(2);
    });

    it('should find exact match for all-water tile', () => {
        const corners: TerrainCorners = ['water', 'water', 'water', 'water'];
        const matches = findMatchingTiles(tileset, corners);
        expect(matches).toEqual([1]);
    });

    it('should find exact match for transition tile', () => {
        const corners: TerrainCorners = ['grass', 'grass', 'water', 'water'];
        const matches = findMatchingTiles(tileset, corners);
        expect(matches).toEqual([2]);
    });

    it('should return empty array when no match exists', () => {
        const corners: TerrainCorners = ['sand', 'sand', 'sand', 'sand'];
        const matches = findMatchingTiles(tileset, corners);
        expect(matches).toEqual([]);
    });

    it('should find match for all-null corners', () => {
        const corners: TerrainCorners = [null, null, null, null];
        const matches = findMatchingTiles(tileset, corners);
        expect(matches).toContain(8);
    });

    it('should find match for partial null corners', () => {
        const corners: TerrainCorners = ['grass', null, null, null];
        const matches = findMatchingTiles(tileset, corners);
        expect(matches).toEqual([10]);
    });
});

describe('scoreTileMatch', () => {
    it('should return 4 for exact match', () => {
        const tileCorners = ['grass', 'grass', 'grass', 'grass'];
        const targetCorners: TerrainCorners = ['grass', 'grass', 'grass', 'grass'];
        expect(scoreTileMatch(tileCorners, targetCorners)).toBe(4);
    });

    it('should return 0 for no matching corners', () => {
        const tileCorners = ['grass', 'grass', 'grass', 'grass'];
        const targetCorners: TerrainCorners = ['water', 'water', 'water', 'water'];
        expect(scoreTileMatch(tileCorners, targetCorners)).toBe(0);
    });

    it('should return partial score for some matches', () => {
        const tileCorners = ['grass', 'grass', 'water', 'water'];
        const targetCorners: TerrainCorners = ['grass', 'grass', 'grass', 'grass'];
        expect(scoreTileMatch(tileCorners, targetCorners)).toBe(2);
    });

    it('should handle null corners correctly', () => {
        const tileCorners = [null, null, null, null];
        const targetCorners: TerrainCorners = [null, null, null, null];
        expect(scoreTileMatch(tileCorners, targetCorners)).toBe(4);
    });

    it('should count null as different from terrain', () => {
        const tileCorners = ['grass', null, null, null];
        const targetCorners: TerrainCorners = ['grass', 'grass', 'grass', 'grass'];
        expect(scoreTileMatch(tileCorners, targetCorners)).toBe(1);
    });
});

describe('findFuzzyMatchingTiles', () => {
    const tileset = createMockTileset();

    it('should find tiles with matching corners sorted by score', () => {
        // Looking for a corner configuration that doesn't exist exactly
        const corners: TerrainCorners = ['grass', 'grass', 'grass', 'sand'];
        const matches = findFuzzyMatchingTiles(tileset, corners, 2);
        
        // Should find tiles with at least 2 matching corners
        expect(matches.length).toBeGreaterThan(0);
        
        // Tiles 0 and 11 (all grass) should match 3 corners
        const bestMatches = matches.filter(m => m.score === 3);
        expect(bestMatches.some(m => m.index === 0 || m.index === 11)).toBe(true);
    });

    it('should return empty array when minimum score not met', () => {
        const corners: TerrainCorners = ['sand', 'sand', 'sand', 'sand'];
        const matches = findFuzzyMatchingTiles(tileset, corners, 2);
        expect(matches).toEqual([]);
    });

    it('should ignore tiles without terrain corners', () => {
        const corners: TerrainCorners = ['grass', 'grass', 'grass', 'grass'];
        const matches = findFuzzyMatchingTiles(tileset, corners, 1);
        // Tile 9 has no terrain corners, should not be in matches
        expect(matches.find(m => m.index === 9)).toBeUndefined();
    });
});

describe('findBestMatchingTile', () => {
    const tileset = createMockTileset();

    it('should return exact match when available', () => {
        const corners: TerrainCorners = ['water', 'water', 'water', 'water'];
        const match = findBestMatchingTile(tileset, corners);
        expect(match).toBe(1);
    });

    it('should return null when no exact match exists', () => {
        const corners: TerrainCorners = ['sand', 'sand', 'sand', 'sand'];
        const match = findBestMatchingTile(tileset, corners);
        expect(match).toBeNull();
    });
});

describe('findBestMatchingTileWithFallback', () => {
    const tileset = createMockTileset();

    it('should return exact match when available', () => {
        const corners: TerrainCorners = ['water', 'water', 'water', 'water'];
        const match = findBestMatchingTileWithFallback(tileset, corners, true);
        expect(match).toBe(1);
    });

    it('should return fuzzy match when no exact match exists', () => {
        const corners: TerrainCorners = ['grass', 'grass', 'grass', 'sand'];
        const match = findBestMatchingTileWithFallback(tileset, corners, true);
        // Should find a grass-heavy tile (0 or 11) as fallback
        expect(match === 0 || match === 11 || match === 6 || match === 7).toBe(true);
    });

    it('should return null when fallback disabled and no exact match', () => {
        const corners: TerrainCorners = ['sand', 'sand', 'sand', 'sand'];
        const match = findBestMatchingTileWithFallback(tileset, corners, false);
        expect(match).toBeNull();
    });

    it('should return null when fallback enabled but no matches meet minimum score', () => {
        const corners: TerrainCorners = ['sand', 'sand', 'sand', 'sand'];
        const match = findBestMatchingTileWithFallback(tileset, corners, true);
        expect(match).toBeNull();
    });
});

describe('getAffectedCorners', () => {
    it('should return correct corners for center position', () => {
        const affected = getAffectedCorners(2, 2);
        expect(affected).toEqual([
            { tileX: 1, tileY: 1, cornerIndex: CORNER_BOTTOM_RIGHT },
            { tileX: 2, tileY: 1, cornerIndex: CORNER_BOTTOM_LEFT },
            { tileX: 1, tileY: 2, cornerIndex: CORNER_TOP_RIGHT },
            { tileX: 2, tileY: 2, cornerIndex: CORNER_TOP_LEFT },
        ]);
    });

    it('should include negative coordinates at map edge', () => {
        const affected = getAffectedCorners(0, 0);
        expect(affected).toContainEqual({ tileX: -1, tileY: -1, cornerIndex: CORNER_BOTTOM_RIGHT });
        expect(affected).toContainEqual({ tileX: 0, tileY: 0, cornerIndex: CORNER_TOP_LEFT });
    });
});

describe('getTilesToUpdate', () => {
    it('should return all 4 tiles around a corner', () => {
        const tiles = getTilesToUpdate(2, 2);
        expect(tiles).toEqual([
            { tileX: 1, tileY: 1 },
            { tileX: 2, tileY: 1 },
            { tileX: 1, tileY: 2 },
            { tileX: 2, tileY: 2 },
        ]);
    });
});

describe('getCornerTerrainsForTile', () => {
    it('should return all nulls for empty grid', () => {
        const grid = new Map<string, string | null>();
        const corners = getCornerTerrainsForTile(0, 0, grid);
        expect(corners).toEqual([null, null, null, null]);
    });

    it('should return correct terrain values', () => {
        const grid = new Map<string, string | null>();
        grid.set('1,1,0', 'grass');
        grid.set('1,1,1', 'water');
        grid.set('1,1,2', 'grass');
        grid.set('1,1,3', 'water');
        
        const corners = getCornerTerrainsForTile(1, 1, grid);
        expect(corners).toEqual(['grass', 'water', 'grass', 'water']);
    });

    it('should handle partial terrain assignments', () => {
        const grid = new Map<string, string | null>();
        grid.set('0,0,0', 'grass');
        grid.set('0,0,3', 'water');
        
        const corners = getCornerTerrainsForTile(0, 0, grid);
        expect(corners).toEqual(['grass', null, null, 'water']);
    });
});

describe('buildTerrainGridFromLayer', () => {
    const tileset = createMockTileset();
    const tilesets = new Map<string, Tileset>();
    tilesets.set('test-tileset', tileset);

    it('should build empty grid from empty layer', () => {
        const layerData: (string | null)[][] = [
            [null, null],
            [null, null],
        ];
        const grid = buildTerrainGridFromLayer(layerData, tilesets);
        expect(grid.size).toBe(0);
    });

    it('should extract terrain corners from tiles', () => {
        const layerData: (string | null)[][] = [
            ['test-tileset:0', null], // All grass tile at (0,0)
            [null, null],
        ];
        const grid = buildTerrainGridFromLayer(layerData, tilesets);
        
        expect(grid.get('0,0,0')).toBe('grass');
        expect(grid.get('0,0,1')).toBe('grass');
        expect(grid.get('0,0,2')).toBe('grass');
        expect(grid.get('0,0,3')).toBe('grass');
    });

    it('should handle multiple tiles', () => {
        const layerData: (string | null)[][] = [
            ['test-tileset:0', 'test-tileset:1'], // Grass, Water
            [null, null],
        ];
        const grid = buildTerrainGridFromLayer(layerData, tilesets);
        
        // Tile (0,0) should be all grass
        expect(grid.get('0,0,0')).toBe('grass');
        
        // Tile (1,0) should be all water
        expect(grid.get('1,0,0')).toBe('water');
        expect(grid.get('1,0,1')).toBe('water');
    });
});

describe('applyTerrainAtCorner', () => {
    let grid: Map<string, string | null>;

    beforeEach(() => {
        grid = new Map();
    });

    it('should update terrain grid at corner point', () => {
        const tiles = applyTerrainAtCorner(1, 1, 'grass', grid, 5, 5);
        
        // Should affect 4 tiles
        expect(tiles.length).toBe(4);
        
        // Check grid was updated
        expect(grid.get('0,0,3')).toBe('grass'); // bottom-right of (0,0)
        expect(grid.get('1,0,2')).toBe('grass'); // bottom-left of (1,0)
        expect(grid.get('0,1,1')).toBe('grass'); // top-right of (0,1)
        expect(grid.get('1,1,0')).toBe('grass'); // top-left of (1,1)
    });

    it('should skip tiles outside map bounds', () => {
        const tiles = applyTerrainAtCorner(0, 0, 'grass', grid, 5, 5);
        
        // Only tile (0,0) is in bounds
        expect(tiles.length).toBe(1);
        expect(tiles[0]).toEqual({ tileX: 0, tileY: 0 });
    });

    it('should handle null terrain (erasing)', () => {
        // First set some terrain
        grid.set('1,1,0', 'grass');
        
        // Then erase it
        applyTerrainAtCorner(2, 2, null, grid, 5, 5);
        
        expect(grid.get('1,1,3')).toBe(null);
    });
});

describe('applyTerrainToTile', () => {
    let grid: Map<string, string | null>;

    beforeEach(() => {
        grid = new Map();
    });

    it('should set all 4 corners of the target tile', () => {
        const tiles = applyTerrainToTile(2, 2, 'grass', grid, 5, 5);
        
        expect(grid.get('2,2,0')).toBe('grass');
        expect(grid.get('2,2,1')).toBe('grass');
        expect(grid.get('2,2,2')).toBe('grass');
        expect(grid.get('2,2,3')).toBe('grass');
        
        // Should include the target tile
        expect(tiles.some(t => t.tileX === 2 && t.tileY === 2)).toBe(true);
    });

    it('should NOT update empty edge neighbors', () => {
        // When painting on empty canvas, edge neighbors should NOT be updated
        const tiles = applyTerrainToTile(2, 2, 'grass', grid, 5, 5);
        
        // Edge neighbors should NOT have their corners set since they're empty
        expect(grid.get('2,1,2')).toBeUndefined(); // Top neighbor's bottom-left
        expect(grid.get('2,1,3')).toBeUndefined(); // Top neighbor's bottom-right
        expect(grid.get('2,3,0')).toBeUndefined(); // Bottom neighbor's top-left
        expect(grid.get('2,3,1')).toBeUndefined(); // Bottom neighbor's top-right
        expect(grid.get('1,2,1')).toBeUndefined(); // Left neighbor's top-right
        expect(grid.get('1,2,3')).toBeUndefined(); // Left neighbor's bottom-right
        expect(grid.get('3,2,0')).toBeUndefined(); // Right neighbor's top-left
        expect(grid.get('3,2,2')).toBeUndefined(); // Right neighbor's bottom-left
    });
    
    it('should update edge neighbors that have existing terrain', () => {
        // Set up a neighbor with existing terrain
        grid.set('2,1,0', 'water'); // Top neighbor has some terrain
        
        const tiles = applyTerrainToTile(2, 2, 'grass', grid, 5, 5);
        
        // Top neighbor should be updated (it has existing terrain)
        expect(grid.get('2,1,2')).toBe('grass');
        expect(grid.get('2,1,3')).toBe('grass');
        expect(tiles.some(t => t.tileX === 2 && t.tileY === 1)).toBe(true);
        
        // Other neighbors without terrain should NOT be updated
        expect(grid.get('2,3,0')).toBeUndefined();
    });

    it('should NOT update empty diagonal neighbors', () => {
        const tiles = applyTerrainToTile(2, 2, 'grass', grid, 5, 5);
        
        // Diagonal neighbors should NOT have their corners set since they're empty
        expect(grid.get('1,1,3')).toBeUndefined(); // Top-left's bottom-right
        expect(grid.get('3,1,2')).toBeUndefined(); // Top-right's bottom-left
        expect(grid.get('1,3,1')).toBeUndefined(); // Bottom-left's top-right
        expect(grid.get('3,3,0')).toBeUndefined(); // Bottom-right's top-left
    });

    it('should return only target tile when painting on empty canvas', () => {
        const tiles = applyTerrainToTile(2, 2, 'grass', grid, 5, 5);
        
        // Should only include target tile (no neighbors have terrain)
        expect(tiles.length).toBe(1);
        expect(tiles[0].tileX).toBe(2);
        expect(tiles[0].tileY).toBe(2);
    });

    it('should handle corner position correctly', () => {
        const tiles = applyTerrainToTile(0, 0, 'grass', grid, 5, 5);
        
        // At (0,0) with no existing terrain, only the target tile is returned
        expect(tiles.length).toBe(1);
        expect(tiles[0].tileX).toBe(0);
        expect(tiles[0].tileY).toBe(0);
    });

    it('should return empty array for out-of-bounds tile', () => {
        const tiles = applyTerrainToTile(-1, 0, 'grass', grid, 5, 5);
        expect(tiles.length).toBe(0);
    });
});

describe('isTileEmpty', () => {
    it('should return true for tile with no terrain set', () => {
        const grid = new Map<string, string | null>();
        expect(isTileEmpty(0, 0, grid)).toBe(true);
    });

    it('should return false for tile with terrain set', () => {
        const grid = new Map<string, string | null>();
        grid.set('0,0,0', 'grass');
        expect(isTileEmpty(0, 0, grid)).toBe(false);
    });

    it('should return true if all corners are explicitly null', () => {
        const grid = new Map<string, string | null>();
        grid.set('0,0,0', null);
        grid.set('0,0,1', null);
        grid.set('0,0,2', null);
        grid.set('0,0,3', null);
        expect(isTileEmpty(0, 0, grid)).toBe(true);
    });

    it('should return false if any corner has terrain', () => {
        const grid = new Map<string, string | null>();
        grid.set('0,0,0', null);
        grid.set('0,0,1', null);
        grid.set('0,0,2', null);
        grid.set('0,0,3', 'water');
        expect(isTileEmpty(0, 0, grid)).toBe(false);
    });
});

// Extended tileset with outer corner tiles for edge case testing
function createExtendedTileset(): Tileset {
    return {
        version: 1,
        id: 'extended-tileset',
        name: 'Extended Tileset',
        spriteSheet: 'test.png',
        tileWidth: 16,
        tileHeight: 16,
        columns: 8,
        tileCount: 64,
        tiles: {
            // Full terrain tiles
            0: { terrainCorners: ['grass', 'grass', 'grass', 'grass'], probability: 1 },
            1: { terrainCorners: ['water', 'water', 'water', 'water'], probability: 1 },
            
            // Edge transitions (2 corners each terrain)
            10: { terrainCorners: ['grass', 'grass', null, null], probability: 1 },  // top edge
            11: { terrainCorners: [null, null, 'grass', 'grass'], probability: 1 },  // bottom edge
            12: { terrainCorners: ['grass', null, 'grass', null], probability: 1 },  // left edge
            13: { terrainCorners: [null, 'grass', null, 'grass'], probability: 1 },  // right edge
            
            // Inner corners (3 corners grass, 1 null)
            20: { terrainCorners: ['grass', 'grass', 'grass', null], probability: 1 },  // missing bottom-right
            21: { terrainCorners: ['grass', 'grass', null, 'grass'], probability: 1 },  // missing bottom-left
            22: { terrainCorners: ['grass', null, 'grass', 'grass'], probability: 1 },  // missing top-right
            23: { terrainCorners: [null, 'grass', 'grass', 'grass'], probability: 1 },  // missing top-left
            
            // Outer corners (1 corner grass, 3 null)
            30: { terrainCorners: ['grass', null, null, null], probability: 1 },  // top-left only
            31: { terrainCorners: [null, 'grass', null, null], probability: 1 },  // top-right only
            32: { terrainCorners: [null, null, 'grass', null], probability: 1 },  // bottom-left only
            33: { terrainCorners: [null, null, null, 'grass'], probability: 1 },  // bottom-right only
            
            // All null (empty)
            99: { terrainCorners: [null, null, null, null], probability: 1 },
        },
    };
}

describe('findBestMatchingTileWithFallback - Edge Cases', () => {
    const tileset = createExtendedTileset();

    it('should find exact match for outer corner (single terrain corner)', () => {
        const corners: TerrainCorners = ['grass', null, null, null];
        const match = findBestMatchingTileWithFallback(tileset, corners, true);
        expect(match).toBe(30);
    });

    it('should find exact match for edge transition (two terrain corners)', () => {
        const corners: TerrainCorners = ['grass', 'grass', null, null];
        const match = findBestMatchingTileWithFallback(tileset, corners, true);
        expect(match).toBe(10);
    });

    it('should find exact match for inner corner (three terrain corners)', () => {
        const corners: TerrainCorners = ['grass', 'grass', 'grass', null];
        const match = findBestMatchingTileWithFallback(tileset, corners, true);
        expect(match).toBe(20);
    });

    it('should fallback appropriately when exact outer corner not available', () => {
        // Create tileset without outer corner tiles
        const limitedTileset: Tileset = {
            ...tileset,
            tiles: {
                0: { terrainCorners: ['grass', 'grass', 'grass', 'grass'], probability: 1 },
                10: { terrainCorners: ['grass', 'grass', null, null], probability: 1 },
            }
        };
        
        // Looking for outer corner - should fallback to best available match
        const corners: TerrainCorners = ['grass', null, null, null];
        const match = findBestMatchingTileWithFallback(limitedTileset, corners, true);
        // With only 1 non-null corner and requiring minScore = ceil(1/2) = 1,
        // tile 10 has grass at top-left, so it matches 1 corner
        expect(match).toBe(10);
    });
    
    it('should handle mixed terrain transitions', () => {
        const mixedTileset: Tileset = {
            version: 1,
            id: 'mixed',
            name: 'Mixed',
            spriteSheet: 'test.png',
            tileWidth: 16,
            tileHeight: 16,
            columns: 8,
            tileCount: 64,
            tiles: {
                0: { terrainCorners: ['grass', 'grass', 'water', 'water'], probability: 1 },
                1: { terrainCorners: ['water', 'water', 'grass', 'grass'], probability: 1 },
            }
        };
        
        const corners: TerrainCorners = ['grass', 'grass', 'water', 'water'];
        const match = findBestMatchingTileWithFallback(mixedTileset, corners, true);
        expect(match).toBe(0);
    });
});

describe('applyTerrainToTile - Diagonal Neighbor Behavior', () => {
    let grid: Map<string, string | null>;

    beforeEach(() => {
        grid = new Map();
    });

    it('should NOT update empty diagonal neighbors', () => {
        // Apply terrain to tile at (2,2) with empty neighbors
        const tiles = applyTerrainToTile(2, 2, 'grass', grid, 5, 5);
        
        // Diagonal neighbors should NOT be in the update list
        // because they have no existing terrain
        const diagonals = [
            { tileX: 1, tileY: 1 },
            { tileX: 3, tileY: 1 },
            { tileX: 1, tileY: 3 },
            { tileX: 3, tileY: 3 },
        ];
        
        for (const diag of diagonals) {
            const inList = tiles.some(t => t.tileX === diag.tileX && t.tileY === diag.tileY);
            expect(inList).toBe(false);
        }
    });

    it('should update diagonal neighbors that have existing terrain', () => {
        // Set up a diagonal neighbor with existing terrain
        grid.set('1,1,0', 'water'); // top-left neighbor has terrain
        
        const tiles = applyTerrainToTile(2, 2, 'grass', grid, 5, 5);
        
        // The top-left diagonal (1,1) should now be in the update list
        const hasTopLeft = tiles.some(t => t.tileX === 1 && t.tileY === 1);
        expect(hasTopLeft).toBe(true);
        
        // Other empty diagonals should NOT be in the list
        const hasTopRight = tiles.some(t => t.tileX === 3 && t.tileY === 1);
        const hasBottomLeft = tiles.some(t => t.tileX === 1 && t.tileY === 3);
        const hasBottomRight = tiles.some(t => t.tileX === 3 && t.tileY === 3);
        expect(hasTopRight).toBe(false);
        expect(hasBottomLeft).toBe(false);
        expect(hasBottomRight).toBe(false);
    });

    it('should only update edge neighbors that have existing terrain', () => {
        // On empty canvas, no edge neighbors should be updated
        const tiles = applyTerrainToTile(2, 2, 'grass', grid, 5, 5);
        
        // Edge neighbors should NOT be updated (they're empty)
        const edges = [
            { tileX: 2, tileY: 1 }, // top
            { tileX: 2, tileY: 3 }, // bottom
            { tileX: 1, tileY: 2 }, // left
            { tileX: 3, tileY: 2 }, // right
        ];
        
        for (const edge of edges) {
            const inList = tiles.some(t => t.tileX === edge.tileX && t.tileY === edge.tileY);
            expect(inList).toBe(false);
        }
    });
    
    it('should update edge neighbors when they have existing terrain', () => {
        // Set up edge neighbors with terrain
        grid.set('2,1,0', 'water'); // top neighbor
        grid.set('1,2,0', 'water'); // left neighbor
        
        const tiles = applyTerrainToTile(2, 2, 'grass', grid, 5, 5);
        
        // Top and left should be updated
        expect(tiles.some(t => t.tileX === 2 && t.tileY === 1)).toBe(true);
        expect(tiles.some(t => t.tileX === 1 && t.tileY === 2)).toBe(true);
        
        // Bottom and right should NOT be updated (no terrain)
        expect(tiles.some(t => t.tileX === 2 && t.tileY === 3)).toBe(false);
        expect(tiles.some(t => t.tileX === 3 && t.tileY === 2)).toBe(false);
    });
    
    it('should produce correct corner config for center tile after painting', () => {
        applyTerrainToTile(2, 2, 'grass', grid, 5, 5);
        
        // The center tile should have all 4 corners set to grass
        expect(grid.get('2,2,0')).toBe('grass');
        expect(grid.get('2,2,1')).toBe('grass');
        expect(grid.get('2,2,2')).toBe('grass');
        expect(grid.get('2,2,3')).toBe('grass');
    });
    
    it('should NOT set corner config for empty edge neighbors', () => {
        applyTerrainToTile(2, 2, 'grass', grid, 5, 5);
        
        // Top neighbor should NOT have any corners set (it's empty)
        expect(grid.get('2,1,0')).toBeUndefined();
        expect(grid.get('2,1,1')).toBeUndefined();
        expect(grid.get('2,1,2')).toBeUndefined();
        expect(grid.get('2,1,3')).toBeUndefined();
    });
});

describe('Painting on Empty Canvas Simulation', () => {
    const tileset = createExtendedTileset();

    it('should only paint target tile when painting on empty canvas', () => {
        const grid = new Map<string, string | null>();
        
        // Simulate painting at (5, 5) on a 10x10 map
        const tiles = applyTerrainToTile(5, 5, 'grass', grid, 10, 10);
        
        // Should only return the target tile
        expect(tiles.length).toBe(1);
        expect(tiles[0]).toEqual({ tileX: 5, tileY: 5 });
        
        // Check that center tile is fully grass
        const centerCorners: TerrainCorners = [
            grid.get('5,5,0') ?? null,
            grid.get('5,5,1') ?? null,
            grid.get('5,5,2') ?? null,
            grid.get('5,5,3') ?? null,
        ];
        expect(centerCorners).toEqual(['grass', 'grass', 'grass', 'grass']);
        
        // Center should find full grass tile
        const centerMatch = findBestMatchingTileWithFallback(tileset, centerCorners, true);
        expect(centerMatch).toBe(0); // Full grass tile
        
        // Edge neighbors should NOT have any corners set
        const topCorners: TerrainCorners = [
            grid.get('5,4,0') ?? null,
            grid.get('5,4,1') ?? null,
            grid.get('5,4,2') ?? null,
            grid.get('5,4,3') ?? null,
        ];
        expect(topCorners).toEqual([null, null, null, null]);
    });
    
    it('should correctly handle adjacent paintings and update neighbors', () => {
        const grid = new Map<string, string | null>();
        
        // Paint first tile
        applyTerrainToTile(5, 5, 'grass', grid, 10, 10);
        
        // Paint adjacent tile - now the first tile has terrain, so it will be updated
        const tiles = applyTerrainToTile(6, 5, 'grass', grid, 10, 10);
        
        // Should return target + the neighbor that now has terrain
        expect(tiles.length).toBe(2);
        expect(tiles.some(t => t.tileX === 6 && t.tileY === 5)).toBe(true);
        expect(tiles.some(t => t.tileX === 5 && t.tileY === 5)).toBe(true);
        
        // The original tile (5,5) should still be fully grass
        const firstCorners: TerrainCorners = [
            grid.get('5,5,0') ?? null,
            grid.get('5,5,1') ?? null,
            grid.get('5,5,2') ?? null,
            grid.get('5,5,3') ?? null,
        ];
        expect(firstCorners).toEqual(['grass', 'grass', 'grass', 'grass']);
        
        // The second tile (6,5) should also be fully grass
        const secondCorners: TerrainCorners = [
            grid.get('6,5,0') ?? null,
            grid.get('6,5,1') ?? null,
            grid.get('6,5,2') ?? null,
            grid.get('6,5,3') ?? null,
        ];
        expect(secondCorners).toEqual(['grass', 'grass', 'grass', 'grass']);
    });
});
