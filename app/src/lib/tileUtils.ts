/**
 * Tile pattern/stencil utilities
 */

import { Tileset } from '../types/schema';

export interface TilePattern {
    pattern: (number | null)[][];
    patternW: number;
    patternH: number;
    minCol: number;
    minRow: number;
}

/**
 * Build a pattern from selected tile indices.
 * Returns the pattern grid and dimensions, or null if no valid selection.
 */
export function buildPatternFromSelection(
    selectedTileIndices: number[],
    tileset: Tileset
): TilePattern | null {
    if (!selectedTileIndices || selectedTileIndices.length === 0) return null;

    const cols = tileset.columns;
    let minC = Infinity, minR = Infinity, maxC = -Infinity, maxR = -Infinity;

    for (const idx of selectedTileIndices) {
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
    }

    if (minC === Infinity) return null;

    const patternW = maxC - minC + 1;
    const patternH = maxR - minR + 1;
    const pattern: (number | null)[][] = Array.from(
        { length: patternH },
        () => Array(patternW).fill(null)
    );

    for (const idx of selectedTileIndices) {
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        pattern[r - minR][c - minC] = idx;
    }

    return { pattern, patternW, patternH, minCol: minC, minRow: minR };
}

/**
 * Get the tile index from a pattern at a given position.
 * Handles wrapping for positions outside the pattern bounds.
 * @param pattern The tile pattern
 * @param originX The origin X of the pattern placement
 * @param originY The origin Y of the pattern placement
 * @param x The world X position to sample
 * @param y The world Y position to sample
 */
export function samplePatternAt(
    pattern: TilePattern,
    originX: number,
    originY: number,
    x: number,
    y: number
): number | null {
    const dx = x - originX;
    const dy = y - originY;
    const px = ((dx % pattern.patternW) + pattern.patternW) % pattern.patternW;
    const py = ((dy % pattern.patternH) + pattern.patternH) % pattern.patternH;
    return pattern.pattern[py][px];
}
