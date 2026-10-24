import { resourceSchemaPath } from './resourceRegistry';
/**
 * Tileset serialization helpers - strip redundant default values on save,
 * restore them on load. Old files (with all fields present) load fine because
 * we only add missing defaults, never overwrite existing values.
 */

import { Tileset, TileDefinition } from '../types/schema';

const DEFAULT_TERRAIN_CORNERS: (string | null)[] = [null, null, null, null];

function normalizePivotY(pivotY: number | undefined): number | undefined {
  if (pivotY === undefined) return undefined;
  if (!Number.isFinite(pivotY)) return 1;
  return Math.max(0, Math.round(pivotY));
}

function normalizeTileDefinition(def: TileDefinition): TileDefinition {
  const pivotY = normalizePivotY(def.pivotY);
  return pivotY === def.pivotY ? def : { ...def, pivotY };
}

function isTrivialTileDefinition(index: number, def: TileDefinition): boolean {
  // A tile entry is "trivial" if it only has collision:{type:'none'} and/or
  // spriteIndex === key - i.e. no useful data at all.
  const hasId = def.id !== undefined;
  const hasNonDefaultId = hasId && def.id !== `tile_${index}_0` && def.id !== String(index);
  const hasTags = def.tags && def.tags.length > 0;
  const hasNonNoneCollision = def.collision && def.collision.type !== 'none';
  const hasProperties = def.properties && def.properties.length > 0;
  const hasTerrain = def.terrain !== undefined;
  const hasProbability = def.probability !== undefined && def.probability !== 1;
  const hasPivotY = def.pivotY !== undefined && def.pivotY !== 1;
  const hasTerrainCorners =
    def.terrainCorners && def.terrainCorners.some((c, i) => c !== DEFAULT_TERRAIN_CORNERS[i]);

  return (
    !hasNonDefaultId &&
    !hasTags &&
    !hasNonNoneCollision &&
    !hasProperties &&
    !hasTerrain &&
    !hasProbability &&
    !hasPivotY &&
    !hasTerrainCorners
  );
}

function normalizeTilesetObjects(tileset: Tileset): Tileset {
  if (!tileset.objects) return tileset;

  const nextObjects = tileset.objects
    .map((objectDefinition) => ({
      ...objectDefinition,
      tiles: [...objectDefinition.tiles]
        .map((tile) => ({
          x: Math.max(0, Math.round(tile.x)),
          y: Math.max(0, Math.round(tile.y)),
          tileIndex: Math.max(0, Math.round(tile.tileIndex)),
        }))
        .sort((a, b) => a.y - b.y || a.x - b.x || a.tileIndex - b.tileIndex),
    }))
    .filter((objectDefinition) => objectDefinition.tiles.length > 0);

  return { ...tileset, objects: nextObjects };
}

function stripTileDefaults(index: number, def: TileDefinition): TileDefinition | null {
  const normalizedDef = normalizeTileDefinition(def);
  if (isTrivialTileDefinition(index, normalizedDef)) return null;

  const stripped: TileDefinition = {};

  if (normalizedDef.id !== undefined) stripped.id = normalizedDef.id;
  if (normalizedDef.tags && normalizedDef.tags.length > 0) stripped.tags = normalizedDef.tags;
  if (normalizedDef.collision && normalizedDef.collision.type !== 'none') {
    stripped.collision = normalizedDef.collision;
  }
  if (normalizedDef.properties && normalizedDef.properties.length > 0) {
    stripped.properties = normalizedDef.properties;
  }
  if (normalizedDef.terrain !== undefined) stripped.terrain = normalizedDef.terrain;
  if (normalizedDef.probability !== undefined && normalizedDef.probability !== 1) {
    stripped.probability = normalizedDef.probability;
  }
  if (normalizedDef.pivotY !== undefined && normalizedDef.pivotY !== 1) {
    stripped.pivotY = normalizedDef.pivotY;
  }
  if (
    normalizedDef.terrainCorners &&
    normalizedDef.terrainCorners.some((c, i) => c !== DEFAULT_TERRAIN_CORNERS[i])
  ) {
    stripped.terrainCorners = normalizedDef.terrainCorners;
  }

  return stripped;
}

/** Prepare a tileset for serialization - strips redundant defaults from tile entries. */
export function serializeTileset(tileset: Tileset): Tileset & { $schema: string } {
  const normalizedTileset = normalizeTilesetObjects(tileset);
  const tiles: Record<number, TileDefinition> = {};

  for (const [keyStr, def] of Object.entries(normalizedTileset.tiles ?? {})) {
    const index = Number(keyStr);
    const stripped = stripTileDefaults(index, def);
    if (stripped && Object.keys(stripped).length > 0) {
      tiles[index] = stripped;
    }
  }

  return { $schema: resourceSchemaPath('tileset'), ...normalizedTileset, tiles };
}

/** Restore defaults for tile definitions loaded from disk. */
export function migrateTilesetOnLoad(tileset: Tileset): Tileset {
  const normalizedTileset = normalizeTilesetObjects(tileset);
  const normalizedTiles: Record<number, TileDefinition> = {};
  let changed = false;

  for (const [keyStr, def] of Object.entries(normalizedTileset.tiles ?? {})) {
    const normalizedDef = normalizeTileDefinition(def);
    normalizedTiles[Number(keyStr)] = normalizedDef;
    if (normalizedDef !== def) changed = true;
  }

  if (changed || normalizedTileset !== tileset) {
    return { ...normalizedTileset, tiles: normalizedTiles };
  }

  return normalizedTileset;
}
