import { describe, it, expect } from 'vitest';
import {
    buildPatternFromSelection,
    samplePatternAt,
    parseTileRef,
    createTileRef,
} from './tileUtils';
import { Tileset } from '../types/schema';

const mockTileset: Tileset = {
    id: 'test',
    name: 'Test',
    version: 1,
    spriteSheet: 'test.png',
    tileWidth: 16,
    tileHeight: 16,
    columns: 4, // 4 tiles per row
    tiles: [],
};

describe('buildPatternFromSelection', () => {
    it('should return null for empty selection', () => {
        const result = buildPatternFromSelection([], mockTileset);
        expect(result).toBeNull();
    });

    it('should build a single tile pattern', () => {
        const result = buildPatternFromSelection([5], mockTileset);
        expect(result).not.toBeNull();
        expect(result!.patternW).toBe(1);
        expect(result!.patternH).toBe(1);
        expect(result!.pattern).toEqual([[5]]);
    });

    it('should build a 2x2 pattern from adjacent tiles', () => {
        // Tiles 0,1,4,5 form a 2x2 square in a 4-column tileset
        const result = buildPatternFromSelection([0, 1, 4, 5], mockTileset);
        expect(result).not.toBeNull();
        expect(result!.patternW).toBe(2);
        expect(result!.patternH).toBe(2);
        expect(result!.pattern).toEqual([
            [0, 1],
            [4, 5],
        ]);
    });

    it('should handle non-contiguous selection with nulls', () => {
        // Tiles 0 and 2 (skipping 1) in a row
        const result = buildPatternFromSelection([0, 2], mockTileset);
        expect(result).not.toBeNull();
        expect(result!.patternW).toBe(3);
        expect(result!.patternH).toBe(1);
        expect(result!.pattern).toEqual([[0, null, 2]]);
    });

    it('should calculate correct minCol and minRow', () => {
        // Select tiles 5 and 6 (second row, columns 1 and 2)
        const result = buildPatternFromSelection([5, 6], mockTileset);
        expect(result).not.toBeNull();
        expect(result!.minCol).toBe(1);
        expect(result!.minRow).toBe(1);
    });
});

describe('samplePatternAt', () => {
    const pattern = {
        pattern: [
            [0, 1],
            [4, 5],
        ],
        patternW: 2,
        patternH: 2,
        minCol: 0,
        minRow: 0,
    };

    it('should sample at origin', () => {
        expect(samplePatternAt(pattern, 0, 0, 0, 0)).toBe(0);
    });

    it('should sample adjacent positions', () => {
        expect(samplePatternAt(pattern, 0, 0, 1, 0)).toBe(1);
        expect(samplePatternAt(pattern, 0, 0, 0, 1)).toBe(4);
        expect(samplePatternAt(pattern, 0, 0, 1, 1)).toBe(5);
    });

    it('should wrap pattern for positions outside bounds', () => {
        expect(samplePatternAt(pattern, 0, 0, 2, 0)).toBe(0); // wraps x: 2 % 2 = 0
        expect(samplePatternAt(pattern, 0, 0, 0, 2)).toBe(0); // wraps y: 2 % 2 = 0
        expect(samplePatternAt(pattern, 0, 0, 3, 3)).toBe(5); // wraps both: (3%2, 3%2) = (1,1)
    });

    it('should handle negative offsets', () => {
        expect(samplePatternAt(pattern, 5, 5, 4, 5)).toBe(1); // -1 in x
        expect(samplePatternAt(pattern, 5, 5, 5, 4)).toBe(4); // -1 in y
    });

    it('should work with different origin', () => {
        expect(samplePatternAt(pattern, 10, 10, 10, 10)).toBe(0);
        expect(samplePatternAt(pattern, 10, 10, 11, 10)).toBe(1);
        expect(samplePatternAt(pattern, 10, 10, 10, 11)).toBe(4);
    });
});

describe('parseTileRef', () => {
    it('should return null for null input', () => {
        expect(parseTileRef(null)).toBeNull();
    });

    it('should return null for empty string', () => {
        expect(parseTileRef('')).toBeNull();
    });

    it('should return null for invalid format', () => {
        expect(parseTileRef('invalid')).toBeNull();
        expect(parseTileRef('noindex:')).toBeNull();
        expect(parseTileRef(':5')).toBeNull();
    });

    it('should parse valid tile reference', () => {
        const result = parseTileRef('village:42');
        expect(result).toEqual({ tilesetId: 'village', tileIndex: 42 });
    });

    it('should handle tilesetId with colons', () => {
        // Uses lastIndexOf, so should handle ids with colons
        const result = parseTileRef('my:tileset:5');
        expect(result).toEqual({ tilesetId: 'my:tileset', tileIndex: 5 });
    });

    it('should return null for non-numeric index', () => {
        expect(parseTileRef('village:abc')).toBeNull();
    });
});

describe('createTileRef', () => {
    it('should create a tile reference string', () => {
        expect(createTileRef('village', 42)).toBe('village:42');
    });

    it('should handle zero index', () => {
        expect(createTileRef('test', 0)).toBe('test:0');
    });

    it('should roundtrip with parseTileRef', () => {
        const ref = createTileRef('myTileset', 123);
        const parsed = parseTileRef(ref);
        expect(parsed).toEqual({ tilesetId: 'myTileset', tileIndex: 123 });
    });
});
