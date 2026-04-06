/**
 * Tileset serialization helpers — strip redundant default values on save,
 * restore them on load. Old files (with all fields present) load fine because
 * we only add missing defaults, never overwrite existing values.
 */

import { Tileset, TileDefinition } from '../types/schema';

const DEFAULT_TERRAIN_CORNERS: (string | null)[] = [null, null, null, null];

function isTrivialTileDefinition(index: number, def: TileDefinition): boolean {
  // A tile entry is "trivial" if it only has collision:{type:'none'} and/or
  // spriteIndex === key — i.e. no useful data at all.
  const hasId = def.id !== undefined;
  const hasNonDefaultId = hasId && def.id !== `tile_${index}_0` && def.id !== String(index);
  const hasTags = def.tags && def.tags.length > 0;
  const hasNonNoneCollision = def.collision && def.collision.type !== 'none';
  const hasProperties = def.properties && def.properties.length > 0;
  const hasTerrain = def.terrain !== undefined;
  const hasProbability = def.probability !== undefined && def.probability !== 1;
  const hasTerrainCorners =
    def.terrainCorners && def.terrainCorners.some((c, i) => c !== DEFAULT_TERRAIN_CORNERS[i]);

  return (
    !hasNonDefaultId &&
    !hasTags &&
    !hasNonNoneCollision &&
    !hasProperties &&
    !hasTerrain &&
    !hasProbability &&
    !hasTerrainCorners
  );
}

function stripTileDefaults(index: number, def: TileDefinition): TileDefinition | null {
  if (isTrivialTileDefinition(index, def)) return null;

  const stripped: TileDefinition = {};

  if (def.id !== undefined) stripped.id = def.id;
  if (def.tags && def.tags.length > 0) stripped.tags = def.tags;
  if (def.collision && def.collision.type !== 'none') stripped.collision = def.collision;
  if (def.properties && def.properties.length > 0) stripped.properties = def.properties;
  if (def.terrain !== undefined) stripped.terrain = def.terrain;
  if (def.probability !== undefined && def.probability !== 1)
    stripped.probability = def.probability;
  if (def.terrainCorners && def.terrainCorners.some((c, i) => c !== DEFAULT_TERRAIN_CORNERS[i]))
    stripped.terrainCorners = def.terrainCorners;

  return stripped;
}

/** Prepare a tileset for serialization — strips redundant defaults from tile entries. */
export function serializeTileset(tileset: Tileset): Tileset & { $schema: string } {
  const tiles: Record<number, TileDefinition> = {};

  for (const [keyStr, def] of Object.entries(tileset.tiles ?? {})) {
    const index = Number(keyStr);
    const stripped = stripTileDefaults(index, def);
    if (stripped && Object.keys(stripped).length > 0) {
      tiles[index] = stripped;
    }
  }

  return { $schema: '../../schemas/tileset.schema.json', ...tileset, tiles };
}

/** Restore defaults for tile definitions loaded from disk.
 *  This is non-destructive — only fills in fields that are missing. */
export function migrateTilesetOnLoad(tileset: Tileset): Tileset {
  // Nothing to restore at the moment — all optional fields default to undefined
  // which is treated as "default" throughout the codebase. The only side-effect
  // of stripping is reducing disk size. If future code needs explicit defaults,
  // add them here.
  return tileset;
}
