/**
 * Map serialization helpers:
 *
 * Fix 2 — Sparse layer data:
 *   Dense layers with many nulls are stored as a sparse entry list on save,
 *   decoded back to 2D arrays on load. Dense layers (few nulls) use the existing
 *   2D array format. Threshold: encode as sparse when > 50% of cells are null.
 *
 * Fix 5 — Terrain palette compression:
 *   terrainData: (string|null)[][] → terrainPalette: string[] + terrainData: (number|null)[][]
 *   Old string-array format is migrated on load.
 */

import { Layer, Map as GameMap } from '../types/schema';
import { migrateLegacyObjectLayerToObjectGroups } from './objectGroups';

// ─── Sparse layer encoding ────────────────────────────────────────────────────

/**
 * Wire format for a sparse layer.
 * Cells not listed are implicitly null.
 */
export interface SparseLayerData {
  sparse: true;
  width: number;
  height: number;
  entries: { x: number; y: number; v: number }[];
}

type StoredLayerData = (number | null)[][] | SparseLayerData;

function isSparseLayerData(data: unknown): data is SparseLayerData {
  return typeof data === 'object' && data !== null && (data as SparseLayerData).sparse === true;
}

const SPARSE_THRESHOLD = 0.5; // encode as sparse when fraction of nulls exceeds this

function encodeLayerData(data: (number | null)[][]): StoredLayerData {
  if (data.length === 0) return data;
  const height = data.length;
  const width = data[0].length;
  const total = width * height;
  if (total === 0) return data;

  const entries: { x: number; y: number; v: number }[] = [];
  let nullCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = data[y][x];
      if (v === null) {
        nullCount++;
      } else {
        entries.push({ x, y, v });
      }
    }
  }

  if (nullCount / total > SPARSE_THRESHOLD) {
    return { sparse: true, width, height, entries };
  }

  return data;
}

function decodeLayerData(stored: StoredLayerData): (number | null)[][] {
  if (!isSparseLayerData(stored)) return stored;

  const { width, height, entries } = stored;
  const data: (number | null)[][] = Array.from({ length: height }, () =>
    new Array<number | null>(width).fill(null),
  );

  for (const { x, y, v } of entries) {
    if (y >= 0 && y < height && x >= 0 && x < width) {
      data[y][x] = v;
    }
  }

  return data;
}

// ─── Terrain palette compression ─────────────────────────────────────────────

type RawTerrainData = (string | number | null)[][];

function isStringTerrainData(data: RawTerrainData): boolean {
  for (const row of data) {
    for (const cell of row) {
      if (cell !== null) return typeof cell === 'string';
    }
  }
  return true; // all null — doesn't matter, treat as string format
}

function encodeTerrainData(data: (string | null)[][]): {
  palette: string[];
  encoded: (number | null)[][];
} {
  const paletteSet = new Set<string>();
  for (const row of data) {
    for (const cell of row) {
      if (cell !== null) paletteSet.add(cell);
    }
  }

  const palette = Array.from(paletteSet).sort();
  const indexMap = new Map(palette.map((id, i) => [id, i]));

  const encoded: (number | null)[][] = data.map((row) =>
    row.map((cell) => (cell === null ? null : (indexMap.get(cell) ?? null))),
  );

  return { palette, encoded };
}

function decodeTerrainData(data: (number | null)[][], palette: string[]): (string | null)[][] {
  return data.map((row) => row.map((cell) => (cell === null ? null : (palette[cell] ?? null))));
}

// ─── Serializable layer type (wire format) ────────────────────────────────────

type WireLayer = Omit<Layer, 'data' | 'terrainData'> & {
  data?: StoredLayerData;
  terrainPalette?: string[];
  terrainData?: (number | null)[][] | (string | null)[][];
};

// ─── Public API ───────────────────────────────────────────────────────────────

type WireMap = Omit<GameMap, 'layers'> & { layers: WireLayer[] };

/** Prepare a map for JSON serialization. Applies sparse encoding and terrain palette compression. */
export function serializeMap(map: GameMap): WireMap {
  const layers: WireLayer[] = map.layers.map((layer) => {
    const wire: WireLayer = { ...layer } as WireLayer;

    if (wire.sortingLayer === 'objects') {
      migrateLegacyObjectLayerToObjectGroups(wire as Layer, map.tilesetRefs);
    }

    // Sparse encode tile data
    if (Array.isArray(wire.data)) {
      wire.data = encodeLayerData(wire.data);
    }

    // Terrain palette compression
    if (wire.terrainData && wire.terrainData.length > 0) {
      const { palette, encoded } = encodeTerrainData(wire.terrainData as (string | null)[][]);
      wire.terrainPalette = palette;
      wire.terrainData = encoded;
    }

    return wire;
  });

  return { ...map, layers };
}

/** Restore a map loaded from JSON. Decodes sparse layers and terrain palettes. */
export function deserializeMap(raw: WireMap): GameMap {
  const layers: Layer[] = raw.layers.map((wireLayer) => {
    const layer = { ...wireLayer } as Layer & { terrainPalette?: string[] };

    // Decode sparse tile data
    if (wireLayer.data) {
      (layer as Layer).data = decodeLayerData(wireLayer.data as StoredLayerData);
    }

    // Decode terrain palette
    if (wireLayer.terrainData && wireLayer.terrainData.length > 0) {
      const palette = (wireLayer as WireLayer).terrainPalette;
      if (palette && palette.length > 0) {
        // New format: numeric indices + palette
        layer.terrainData = decodeTerrainData(
          wireLayer.terrainData as (number | null)[][],
          palette,
        );
      } else if (isStringTerrainData(wireLayer.terrainData as RawTerrainData)) {
        // Old format: string arrays — pass through as-is
        layer.terrainData = wireLayer.terrainData as (string | null)[][];
      }
      // Remove wire-only field
      delete (layer as unknown as Record<string, unknown>).terrainPalette;
    }

    return layer;
  });

  return { ...(raw as unknown as GameMap), layers };
}
