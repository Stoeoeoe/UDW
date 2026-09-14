/**
 * Tile Reference Encoding/Decoding Utilities
 * 
 * To optimize storage, tile references are encoded as numbers:
 * - High 16 bits: tileset index in map.tilesetRefs
 * - Low 16 bits: tile index within the tileset
 * 
 * This reduces JSON size significantly compared to "tilesetId:index" strings.
 */

export interface ParsedTileRef {
    tilesetId: string;
    tileIndex: number;
}

/** Parse a tile reference in the form "tilesetId:tileIndex". */
export function parseTileRef(tileRef: string | null): ParsedTileRef | null {
    if (!tileRef) return null;

    const colonIndex = tileRef.lastIndexOf(':');
    if (colonIndex <= 0) return null;

    const tileIndexText = tileRef.slice(colonIndex + 1);
    if (!/^\d+$/.test(tileIndexText)) return null;

    return {
        tilesetId: tileRef.slice(0, colonIndex),
        tileIndex: Number(tileIndexText),
    };
}

/** Create a tile reference string. */
export function createTileRef(tilesetId: string, tileIndex: number): string {
    return `${tilesetId}:${tileIndex}`;
}

/**
 * Encode a tile reference string to a number
 */
export function encodeTileRef(tileRef: string | null, tilesetRefs: string[]): number | null {
    if (tileRef === null) return null;

    const parsed = parseTileRef(tileRef);
    if (!parsed) {
        throw new Error(`Invalid tile reference format: "${tileRef}" (expected "tilesetId:tileIndex")`);
    }

    const { tilesetId, tileIndex } = parsed;
    if (tileIndex > 0xFFFF) {
        throw new Error(`Tile index ${tileIndex} exceeds maximum of 65535 per tileset`);
    }

    const tilesetIndex = tilesetRefs.indexOf(tilesetId);
    if (tilesetIndex === -1) {
        throw new Error(`Tileset ${tilesetId} not found in tilesetRefs`);
    }
    if (tilesetIndex > 0xFFFF) {
        throw new Error(`Tileset index ${tilesetIndex} exceeds maximum of 65535`);
    }

    return (tilesetIndex << 16) | tileIndex;
}

/**
 * Decode a tile reference number to a string
 */
export function decodeTileRef(encoded: number | null, tilesetRefs: string[]): string | null {
    if (encoded === null) return null;
    
    const tilesetIndex = encoded >>> 16;
    const tileIndex = encoded & 0xFFFF;
    
    if (tilesetIndex >= tilesetRefs.length) {
        throw new Error(`Invalid tileset index ${tilesetIndex}`);
    }
    
    return `${tilesetRefs[tilesetIndex]}:${tileIndex}`;
}
