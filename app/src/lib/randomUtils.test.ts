import { describe, it, expect } from 'vitest';
import {
    sampleWeightedTile,
    getTileWeight,
    sampleRandomTile,
    seededRandom,
    sampleSeededTile,
} from './randomUtils';
import { Tileset } from '../types/schema';

describe('sampleWeightedTile', () => {
    it('should return null for empty indices', () => {
        const result = sampleWeightedTile([], () => 1);
        expect(result).toBeNull();
    });

    it('should return the only index for single element', () => {
        const result = sampleWeightedTile([5], () => 1);
        expect(result).toBe(5);
    });

    it('should respect weights when sampling', () => {
        // With a deterministic "random" that always returns 0, should pick first
        const result = sampleWeightedTile([1, 2, 3], () => 1, () => 0);
        expect(result).toBe(1);
    });

    it('should pick last element when random is near 1', () => {
        const result = sampleWeightedTile([1, 2, 3], () => 1, () => 0.99);
        expect(result).toBe(3);
    });

    it('should handle zero weights gracefully', () => {
        const result = sampleWeightedTile([1, 2, 3], () => 0);
        expect(result).toBe(1); // Falls back to first
    });
});

describe('getTileWeight', () => {
    it('should return 1 for undefined tileset', () => {
        const result = getTileWeight(undefined, 0);
        expect(result).toBe(1);
    });

    it('should return 1 for tile without probability', () => {
        const tileset: Tileset = {
            id: 'test',
            name: 'Test',
            version: 1,
            spriteSheet: 'test.png',
            tileWidth: 16,
            tileHeight: 16,
            columns: 4,
            tiles: [{ collision: false }],
        };
        const result = getTileWeight(tileset, 0);
        expect(result).toBe(1);
    });

    it('should return tile probability when defined', () => {
        const tileset: Tileset = {
            id: 'test',
            name: 'Test',
            version: 1,
            spriteSheet: 'test.png',
            tileWidth: 16,
            tileHeight: 16,
            columns: 4,
            tiles: [{ collision: false, probability: 0.5 }],
        };
        const result = getTileWeight(tileset, 0);
        expect(result).toBe(0.5);
    });

    it('should return 1 for zero probability', () => {
        const tileset: Tileset = {
            id: 'test',
            name: 'Test',
            version: 1,
            spriteSheet: 'test.png',
            tileWidth: 16,
            tileHeight: 16,
            columns: 4,
            tiles: [{ collision: false, probability: 0 }],
        };
        const result = getTileWeight(tileset, 0);
        expect(result).toBe(1);
    });
});

describe('sampleRandomTile', () => {
    it('should return null for empty indices', () => {
        const result = sampleRandomTile([], undefined);
        expect(result).toBeNull();
    });

    it('should sample from indices using tileset weights', () => {
        const tileset: Tileset = {
            id: 'test',
            name: 'Test',
            version: 1,
            spriteSheet: 'test.png',
            tileWidth: 16,
            tileHeight: 16,
            columns: 4,
            tiles: [
                { collision: false, probability: 10 },
                { collision: false, probability: 1 },
            ],
        };
        // With random = 0, should pick the first (highest weight doesn't matter, order does)
        const result = sampleRandomTile([0, 1], tileset, () => 0);
        expect(result).toBe(0);
    });
});

describe('seededRandom', () => {
    it('should return deterministic values for same inputs', () => {
        const val1 = seededRandom(5, 10, 42);
        const val2 = seededRandom(5, 10, 42);
        expect(val1).toBe(val2);
    });

    it('should return different values for different positions', () => {
        const val1 = seededRandom(5, 10, 42);
        const val2 = seededRandom(6, 10, 42);
        expect(val1).not.toBe(val2);
    });

    it('should return different values for different seeds', () => {
        const val1 = seededRandom(5, 10, 42);
        const val2 = seededRandom(5, 10, 43);
        expect(val1).not.toBe(val2);
    });

    it('should return values between 0 and 1', () => {
        for (let i = 0; i < 100; i++) {
            const val = seededRandom(i, i * 2, i * 3);
            expect(val).toBeGreaterThanOrEqual(0);
            expect(val).toBeLessThan(1);
        }
    });
});

describe('sampleSeededTile', () => {
    it('should return deterministic tiles for same position', () => {
        const tileset: Tileset = {
            id: 'test',
            name: 'Test',
            version: 1,
            spriteSheet: 'test.png',
            tileWidth: 16,
            tileHeight: 16,
            columns: 4,
            tiles: [{ collision: false }, { collision: false }, { collision: false }],
        };

        const tile1 = sampleSeededTile(5, 10, [0, 1, 2], tileset, 42);
        const tile2 = sampleSeededTile(5, 10, [0, 1, 2], tileset, 42);
        expect(tile1).toBe(tile2);
    });

    it('should return different tiles for different positions', () => {
        const tileset: Tileset = {
            id: 'test',
            name: 'Test',
            version: 1,
            spriteSheet: 'test.png',
            tileWidth: 16,
            tileHeight: 16,
            columns: 4,
            tiles: [{ collision: false }, { collision: false }, { collision: false }],
        };

        // Different positions should likely give different tiles (not guaranteed but very probable)
        const results = new Set<number | null>();
        for (let x = 0; x < 10; x++) {
            for (let y = 0; y < 10; y++) {
                results.add(sampleSeededTile(x, y, [0, 1, 2], tileset, 42));
            }
        }
        // Should have at least 2 different values across 100 samples
        expect(results.size).toBeGreaterThan(1);
    });
});
