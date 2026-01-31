import { Tileset } from '../types/schema';

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
    layerData: (string | null)[][],
    tilesets: Map<string, Tileset>
): Map<string, string | null> {
    const grid = new Map<string, string | null>();
    const key = (x: number, y: number, corner: number) => `${x},${y},${corner}`;

    for (let y = 0; y < layerData.length; y++) {
        const row = layerData[y];
        if (!row) continue;

        for (let x = 0; x < row.length; x++) {
            const tileRef = row[x];
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
