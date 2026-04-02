/**
 * Tile Reference Encoding/Decoding Utilities
 *
 * To optimize storage, tile references are encoded as numbers:
 * - High 16 bits: tileset index in map.tilesetRefs
 * - Low 16 bits: tile index within the tileset
 *
 * This reduces JSON size significantly compared to "tilesetId:index" strings.
 */

import { Map as GameMap } from '../types/schema';

/**
 * Encode a tile reference string to a number
 */
export function encodeTileRef(
  tileRef: string | null,
  tilesetRefs: string[],
): number | null {
  if (tileRef === null) return null;

  const [tilesetId, tileIndexStr] = tileRef.split(':');
  const tileIndex = parseInt(tileIndexStr, 10);
  const tilesetIndex = tilesetRefs.indexOf(tilesetId);

  if (tilesetIndex === -1) {
    throw new Error(`Tileset ${tilesetId} not found in tilesetRefs`);
  }

  return (tilesetIndex << 16) | tileIndex;
}

/**
 * Decode a tile reference number to a string
 */
export function decodeTileRef(
  encoded: number | null,
  tilesetRefs: string[],
): string | null {
  if (encoded === null) return null;

  const tilesetIndex = encoded >>> 16;
  const tileIndex = encoded & 0xffff;

  if (tilesetIndex >= tilesetRefs.length) {
    throw new Error(`Invalid tileset index ${tilesetIndex}`);
  }

  return `${tilesetRefs[tilesetIndex]}:${tileIndex}`;
}

/**
 * Convert layer data from string format to encoded number format
 */
export function convertLayerDataToEncoded(
  data: (string | null)[][],
  tilesetRefs: string[],
): (number | null)[][] {
  return data.map((row) => row.map((cell) => encodeTileRef(cell, tilesetRefs)));
}

/**
 * Convert layer data from encoded number format to string format
 */
export function convertLayerDataToStrings(
  data: (number | null)[][],
  tilesetRefs: string[],
): (string | null)[][] {
  return data.map((row) => row.map((cell) => decodeTileRef(cell, tilesetRefs)));
}

/**
 * Build tilesetRefs from existing string-based layer data
 */
export function buildTilesetRefsFromData(
  layers: { data?: (string | null)[][] }[],
): string[] {
  const tilesetSet = new Set<string>();

  for (const layer of layers) {
    if (!layer.data) continue;
    for (const row of layer.data) {
      for (const cell of row) {
        if (cell !== null) {
          const [tilesetId] = cell.split(':');
          tilesetSet.add(tilesetId);
        }
      }
    }
  }

  return Array.from(tilesetSet).sort(); // Sort for consistency
}

/**
 * Migrate a map from string-based data to encoded data
 */
export function migrateMapToEncodedData(map: any): GameMap {
  if (!map.tilesetRefs) {
    // Build tilesetRefs from data
    map.tilesetRefs = buildTilesetRefsFromData(map.layers);
  }

  // Convert layer data
  for (const layer of map.layers) {
    if (layer.data && typeof layer.data[0]?.[0] === 'string') {
      layer.data = convertLayerDataToEncoded(
        layer.data as (string | null)[][],
        map.tilesetRefs,
      );
    }
  }

  return map as GameMap;
}
