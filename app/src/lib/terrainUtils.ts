import { Tileset } from '../types/schema';
import { decodeTileRef } from './tileRef';

/**
 * Corner indices for terrainCorners array:
 * [0: top-left, 1: top-right, 2: bottom-left, 3: bottom-right]
 */
export const CORNER_TOP_LEFT = 0;
export const CORNER_TOP_RIGHT = 1;
export const CORNER_BOTTOM_LEFT = 2;
export const CORNER_BOTTOM_RIGHT = 3;

/**
 * Represents a terrain configuration for a single tile position.
 * Each corner can be null (no terrain) or a terrain type ID string.
 */
export type TerrainCorners = [string | null, string | null, string | null, string | null];

/**
 * Find all tiles in a tileset that match the given corner terrain configuration.
 * Returns an array of tile indices that match exactly.
 */
export function findMatchingTiles(
    tileset: Tileset,
    corners: TerrainCorners
): number[] {
    const matches: number[] = [];

    for (const [indexStr, tileDef] of Object.entries(tileset.tiles)) {
        const index = parseInt(indexStr, 10);
        if (isNaN(index)) continue;

        const tileCorners = tileDef.terrainCorners || [null, null, null, null];

        // Check if all 4 corners match
        if (
            tileCorners[0] === corners[0] &&
            tileCorners[1] === corners[1] &&
            tileCorners[2] === corners[2] &&
            tileCorners[3] === corners[3]
        ) {
            matches.push(index);
        }
    }

    return matches;
}

/**
 * Score how well a tile's terrain corners match the target configuration.
 * Returns a score from 0-4 (number of matching corners).
 * null corners in the target match null corners in the tile.
 */
export function scoreTileMatch(
    tileCorners: (string | null)[],
    targetCorners: TerrainCorners
): number {
    let score = 0;
    for (let i = 0; i < 4; i++) {
        const tileVal = tileCorners[i] ?? null;
        const targetVal = targetCorners[i];
        if (tileVal === targetVal) {
            score++;
        }
    }
    return score;
}

/**
 * Find tiles that have at least one corner matching the target terrain.
 * Useful for finding fallback tiles when no exact match exists.
 * Returns tiles sorted by match score (best first).
 */
export function findFuzzyMatchingTiles(
    tileset: Tileset,
    corners: TerrainCorners,
    minScore: number = 1
): Array<{ index: number; score: number }> {
    const matches: Array<{ index: number; score: number }> = [];

    for (const [indexStr, tileDef] of Object.entries(tileset.tiles)) {
        const index = parseInt(indexStr, 10);
        if (isNaN(index)) continue;

        const tileCorners = tileDef.terrainCorners;
        // Skip tiles without terrain corners defined
        if (!tileCorners) continue;

        const score = scoreTileMatch(tileCorners, corners);
        if (score >= minScore) {
            matches.push({ index, score });
        }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);
    return matches;
}

/**
 * Find the best matching tile, with fallback to fuzzy matching.
 * If an exact match exists, returns it. Otherwise, finds the closest match.
 * 
 * For partial corner configurations (like outer corners with only 1 terrain corner),
 * this will try progressively lower thresholds to find a suitable match.
 * 
 * @param tileset The tileset to search in
 * @param corners The target corner configuration
 * @param fallbackToFuzzy If true, will return a fuzzy match when no exact match exists
 * @returns The tile index, or null if no suitable match found
 */
export function findBestMatchingTileWithFallback(
    tileset: Tileset,
    corners: TerrainCorners,
    fallbackToFuzzy: boolean = true
): number | null {
    // First try exact match
    const exactMatch = findBestMatchingTile(tileset, corners);
    if (exactMatch !== null) return exactMatch;

    if (!fallbackToFuzzy) return null;

    // Count how many non-null corners we have
    const nonNullCount = corners.filter(c => c !== null).length;
    
    // For tiles with very few terrain corners, we need to be more lenient
    // Require at least half the non-null corners to match, but at least 1
    const minScore = Math.max(1, Math.ceil(nonNullCount / 2));
    
    // Try fuzzy matching with calculated minimum score
    const fuzzyMatches = findFuzzyMatchingTiles(tileset, corners, minScore);
    if (fuzzyMatches.length === 0) return null;

    // Get all tiles with the best score
    const bestScore = fuzzyMatches[0].score;
    const bestMatches = fuzzyMatches.filter(m => m.score === bestScore);

    // Use probability weights to select from best matches
    const weights = bestMatches.map(m => {
        const def = tileset.tiles[m.index];
        return def && typeof def.probability === 'number' && def.probability > 0
            ? def.probability
            : 1;
    });

    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;

    for (let i = 0; i < bestMatches.length; i++) {
        r -= weights[i];
        if (r <= 0) return bestMatches[i].index;
    }

    return bestMatches[bestMatches.length - 1].index;
}

/**
 * Find the best matching tile for a given corner configuration.
 * If multiple tiles match, picks one based on probability weights.
 * Returns null if no matching tile is found.
 */
export function findBestMatchingTile(
    tileset: Tileset,
    corners: TerrainCorners
): number | null {
    const matches = findMatchingTiles(tileset, corners);

    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    // Multiple matches - use probability weights to select
    const weights = matches.map(idx => {
        const def = tileset.tiles[idx];
        return def && typeof def.probability === 'number' && def.probability > 0
            ? def.probability
            : 1;
    });

    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;

    for (let i = 0; i < matches.length; i++) {
        r -= weights[i];
        if (r <= 0) return matches[i];
    }

    return matches[matches.length - 1];
}

/**
 * When painting terrain at a corner point (the intersection of 4 tiles),
 * this function returns which tiles and corners are affected.
 * 
 * The corner point (cx, cy) is at the intersection where:
 * - Tile (cx-1, cy-1) has its bottom-right corner
 * - Tile (cx, cy-1) has its bottom-left corner  
 * - Tile (cx-1, cy) has its top-right corner
 * - Tile (cx, cy) has its top-left corner
 * 
 * Returns array of { tileX, tileY, cornerIndex } objects
 */
export function getAffectedCorners(
    cornerX: number,
    cornerY: number
): Array<{ tileX: number; tileY: number; cornerIndex: number }> {
    return [
        { tileX: cornerX - 1, tileY: cornerY - 1, cornerIndex: CORNER_BOTTOM_RIGHT },
        { tileX: cornerX, tileY: cornerY - 1, cornerIndex: CORNER_BOTTOM_LEFT },
        { tileX: cornerX - 1, tileY: cornerY, cornerIndex: CORNER_TOP_RIGHT },
        { tileX: cornerX, tileY: cornerY, cornerIndex: CORNER_TOP_LEFT },
    ];
}

/**
 * Get the tiles that need to be updated when a corner is modified.
 * These are the 4 tiles that share the corner point.
 */
export function getTilesToUpdate(
    cornerX: number,
    cornerY: number
): Array<{ tileX: number; tileY: number }> {
    return [
        { tileX: cornerX - 1, tileY: cornerY - 1 },
        { tileX: cornerX, tileY: cornerY - 1 },
        { tileX: cornerX - 1, tileY: cornerY },
        { tileX: cornerX, tileY: cornerY },
    ];
}

/**
 * Get the corner terrain configuration for a tile position by reading
 * from an existing terrain grid or inferring from current tiles.
 */
export function getCornerTerrainsForTile(
    tileX: number,
    tileY: number,
    terrainGrid: Map<string, string | null> // key = "x,y,corner" -> terrain ID
): TerrainCorners {
    const key = (x: number, y: number, corner: number) => `${x},${y},${corner}`;
    return [
        terrainGrid.get(key(tileX, tileY, CORNER_TOP_LEFT)) ?? null,
        terrainGrid.get(key(tileX, tileY, CORNER_TOP_RIGHT)) ?? null,
        terrainGrid.get(key(tileX, tileY, CORNER_BOTTOM_LEFT)) ?? null,
        terrainGrid.get(key(tileX, tileY, CORNER_BOTTOM_RIGHT)) ?? null,
    ];
}

/**
 * Build a terrain grid from existing tiles in a layer.
 * This extracts the terrainCorners from each tile and builds a lookup map.
 */
export function buildTerrainGridFromLayer(
    layerData: (number | null)[][],
    tilesets: Map<string, Tileset>,
    tilesetRefs: string[]
): Map<string, string | null> {
    const grid = new Map<string, string | null>();
    const key = (x: number, y: number, corner: number) => `${x},${y},${corner}`;

    for (let y = 0; y < layerData.length; y++) {
        const row = layerData[y];
        if (!row) continue;

        for (let x = 0; x < row.length; x++) {
            const encoded = row[x];
            if (encoded === null) continue;

            // Decode tile reference
            const tileRef = typeof encoded === 'string' ? encoded : decodeTileRef(encoded, tilesetRefs);
            if (!tileRef) continue;

            // Parse tile reference "tilesetId:tileIndex"
            const colonIdx = tileRef.lastIndexOf(':');
            if (colonIdx <= 0) continue;

            const tilesetId = tileRef.substring(0, colonIdx);
            const tileIndex = parseInt(tileRef.substring(colonIdx + 1), 10);
            if (isNaN(tileIndex)) continue;

            const tileset = tilesets.get(tilesetId);
            if (!tileset) continue;

            const tileDef = tileset.tiles[tileIndex];
            if (!tileDef?.terrainCorners) continue;

            // Store each corner's terrain
            for (let corner = 0; corner < 4; corner++) {
                const terrainId = tileDef.terrainCorners[corner];
                if (terrainId !== undefined) {
                    grid.set(key(x, y, corner), terrainId);
                }
            }
        }
    }

    return grid;
}

/**
 * Apply terrain paint at a corner point and update the terrain grid.
 * Returns the list of tiles that need to be re-resolved and painted.
 */
export function applyTerrainAtCorner(
    cornerX: number,
    cornerY: number,
    terrainId: string | null,
    terrainGrid: Map<string, string | null>,
    mapWidth: number,
    mapHeight: number
): Array<{ tileX: number; tileY: number }> {
    const key = (x: number, y: number, corner: number) => `${x},${y},${corner}`;
    const affectedCorners = getAffectedCorners(cornerX, cornerY);
    const tilesToUpdate: Array<{ tileX: number; tileY: number }> = [];

    for (const { tileX, tileY, cornerIndex } of affectedCorners) {
        // Skip tiles outside map bounds
        if (tileX < 0 || tileX >= mapWidth || tileY < 0 || tileY >= mapHeight) continue;

        // Update the terrain grid
        terrainGrid.set(key(tileX, tileY, cornerIndex), terrainId);
        tilesToUpdate.push({ tileX, tileY });
    }

    // Remove duplicates
    const unique = new Map<string, { tileX: number; tileY: number }>();
    for (const tile of tilesToUpdate) {
        unique.set(`${tile.tileX},${tile.tileY}`, tile);
    }

    return Array.from(unique.values());
}

/**
 * Apply terrain paint to an entire tile (setting all 4 corners).
 * This is useful when painting on empty tiles where we want to fill the whole tile.
 * Also updates adjacent tiles' shared corners to maintain consistency.
 * 
 * IMPORTANT: Only updates neighbors that already have terrain set.
 * When painting on an empty canvas, this will only paint the target tile.
 * This prevents creating partial corner configurations on empty neighbors.
 * 
 * Returns the list of tiles that need to be re-resolved and painted.
 */
export function applyTerrainToTile(
    tileX: number,
    tileY: number,
    terrainId: string | null,
    terrainGrid: Map<string, string | null>,
    mapWidth: number,
    mapHeight: number
): Array<{ tileX: number; tileY: number }> {
    const key = (x: number, y: number, corner: number) => `${x},${y},${corner}`;
    const tilesToUpdate: Array<{ tileX: number; tileY: number }> = [];

    // Skip if outside map bounds
    if (tileX < 0 || tileX >= mapWidth || tileY < 0 || tileY >= mapHeight) {
        return [];
    }

    // Set all 4 corners of the target tile
    terrainGrid.set(key(tileX, tileY, CORNER_TOP_LEFT), terrainId);
    terrainGrid.set(key(tileX, tileY, CORNER_TOP_RIGHT), terrainId);
    terrainGrid.set(key(tileX, tileY, CORNER_BOTTOM_LEFT), terrainId);
    terrainGrid.set(key(tileX, tileY, CORNER_BOTTOM_RIGHT), terrainId);
    tilesToUpdate.push({ tileX, tileY });

    // Only update neighbors that already have terrain set
    // This prevents creating partial corner configs on empty tiles
    
    // Top neighbor: update its bottom corners if it has existing terrain
    if (tileY > 0 && hasAnyTerrain(tileX, tileY - 1, terrainGrid)) {
        terrainGrid.set(key(tileX, tileY - 1, CORNER_BOTTOM_LEFT), terrainId);
        terrainGrid.set(key(tileX, tileY - 1, CORNER_BOTTOM_RIGHT), terrainId);
        tilesToUpdate.push({ tileX, tileY: tileY - 1 });
    }

    // Bottom neighbor: update its top corners if it has existing terrain
    if (tileY < mapHeight - 1 && hasAnyTerrain(tileX, tileY + 1, terrainGrid)) {
        terrainGrid.set(key(tileX, tileY + 1, CORNER_TOP_LEFT), terrainId);
        terrainGrid.set(key(tileX, tileY + 1, CORNER_TOP_RIGHT), terrainId);
        tilesToUpdate.push({ tileX, tileY: tileY + 1 });
    }

    // Left neighbor: update its right corners if it has existing terrain
    if (tileX > 0 && hasAnyTerrain(tileX - 1, tileY, terrainGrid)) {
        terrainGrid.set(key(tileX - 1, tileY, CORNER_TOP_RIGHT), terrainId);
        terrainGrid.set(key(tileX - 1, tileY, CORNER_BOTTOM_RIGHT), terrainId);
        tilesToUpdate.push({ tileX: tileX - 1, tileY });
    }

    // Right neighbor: update its left corners if it has existing terrain
    if (tileX < mapWidth - 1 && hasAnyTerrain(tileX + 1, tileY, terrainGrid)) {
        terrainGrid.set(key(tileX + 1, tileY, CORNER_TOP_LEFT), terrainId);
        terrainGrid.set(key(tileX + 1, tileY, CORNER_BOTTOM_LEFT), terrainId);
        tilesToUpdate.push({ tileX: tileX + 1, tileY });
    }

    // Corner neighbors (diagonals) - only update if they already have terrain
    
    // Top-left neighbor
    if (tileX > 0 && tileY > 0 && hasAnyTerrain(tileX - 1, tileY - 1, terrainGrid)) {
        terrainGrid.set(key(tileX - 1, tileY - 1, CORNER_BOTTOM_RIGHT), terrainId);
        tilesToUpdate.push({ tileX: tileX - 1, tileY: tileY - 1 });
    }

    // Top-right neighbor
    if (tileX < mapWidth - 1 && tileY > 0 && hasAnyTerrain(tileX + 1, tileY - 1, terrainGrid)) {
        terrainGrid.set(key(tileX + 1, tileY - 1, CORNER_BOTTOM_LEFT), terrainId);
        tilesToUpdate.push({ tileX: tileX + 1, tileY: tileY - 1 });
    }

    // Bottom-left neighbor
    if (tileX > 0 && tileY < mapHeight - 1 && hasAnyTerrain(tileX - 1, tileY + 1, terrainGrid)) {
        terrainGrid.set(key(tileX - 1, tileY + 1, CORNER_TOP_RIGHT), terrainId);
        tilesToUpdate.push({ tileX: tileX - 1, tileY: tileY + 1 });
    }

    // Bottom-right neighbor
    if (tileX < mapWidth - 1 && tileY < mapHeight - 1 && hasAnyTerrain(tileX + 1, tileY + 1, terrainGrid)) {
        terrainGrid.set(key(tileX + 1, tileY + 1, CORNER_TOP_LEFT), terrainId);
        tilesToUpdate.push({ tileX: tileX + 1, tileY: tileY + 1 });
    }

    // Remove duplicates
    const unique = new Map<string, { tileX: number; tileY: number }>();
    for (const tile of tilesToUpdate) {
        unique.set(`${tile.tileX},${tile.tileY}`, tile);
    }

    return Array.from(unique.values());
}

/**
 * Check if a tile has any terrain corners set (non-null).
 */
function hasAnyTerrain(
    tileX: number,
    tileY: number,
    terrainGrid: Map<string, string | null>
): boolean {
    const key = (x: number, y: number, corner: number) => `${x},${y},${corner}`;
    for (let corner = 0; corner < 4; corner++) {
        const val = terrainGrid.get(key(tileX, tileY, corner));
        if (val !== undefined && val !== null) {
            return true;
        }
    }
    return false;
}

/**
 * Determine if terrain should be applied as a tile fill vs corner paint.
 * Returns true if the target tile is "empty" (has no terrain corners set).
 */
export function isTileEmpty(
    tileX: number,
    tileY: number,
    terrainGrid: Map<string, string | null>
): boolean {
    const key = (x: number, y: number, corner: number) => `${x},${y},${corner}`;
    
    // Check if any corner has terrain set
    for (let corner = 0; corner < 4; corner++) {
        if (terrainGrid.has(key(tileX, tileY, corner)) && terrainGrid.get(key(tileX, tileY, corner)) !== null) {
            return false;
        }
    }
    return true;
}
