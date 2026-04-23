import { Tileset, TilesetObjectDefinition } from '../types/schema';

export function createTilesetObjectId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `obj_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  return `obj_${Math.random().toString(36).slice(2, 14)}`;
}

export function buildObjectDefinitionFromTileSelection(
  name: string,
  selectedTileIndices: number[],
  tileset: Tileset,
  existingId?: string,
): TilesetObjectDefinition | null {
  if (!selectedTileIndices.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  const coords = selectedTileIndices.map((tileIndex) => {
    const x = tileIndex % tileset.columns;
    const y = Math.floor(tileIndex / tileset.columns);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    return { x, y, tileIndex };
  });

  return {
    id: existingId ?? createTilesetObjectId(),
    name,
    tiles: coords
      .map((tile) => ({
        x: tile.x - minX,
        y: tile.y - minY,
        tileIndex: tile.tileIndex,
      }))
      .sort((a, b) => a.y - b.y || a.x - b.x || a.tileIndex - b.tileIndex),
  };
}

export function buildPatternFromObjectDefinition(
  objectDefinition: TilesetObjectDefinition,
): { pattern: (number | null)[][]; width: number; height: number } | null {
  if (!objectDefinition.tiles.length) return null;

  let maxX = 0;
  let maxY = 0;
  for (const tile of objectDefinition.tiles) {
    maxX = Math.max(maxX, tile.x);
    maxY = Math.max(maxY, tile.y);
  }

  const width = maxX + 1;
  const height = maxY + 1;
  const pattern = Array.from({ length: height }, () => Array<number | null>(width).fill(null));

  for (const tile of objectDefinition.tiles) {
    pattern[tile.y][tile.x] = tile.tileIndex;
  }

  return { pattern, width, height };
}

export function getTileIndicesForObjectDefinition(
  objectDefinition: TilesetObjectDefinition,
  tileset: Tileset,
): number[] {
  const minCol = Math.min(
    ...objectDefinition.tiles.map((tile) => tile.tileIndex % tileset.columns),
  );
  const minRow = Math.min(
    ...objectDefinition.tiles.map((tile) => Math.floor(tile.tileIndex / tileset.columns)),
  );

  return objectDefinition.tiles
    .map((tile) => {
      const col = tile.tileIndex % tileset.columns;
      const row = Math.floor(tile.tileIndex / tileset.columns);
      return {
        tileIndex: tile.tileIndex,
        sortX: col - minCol,
        sortY: row - minRow,
      };
    })
    .sort((a, b) => a.sortY - b.sortY || a.sortX - b.sortX || a.tileIndex - b.tileIndex)
    .map((tile) => tile.tileIndex);
}

export function getTilesetObjectBounds(
  objectDefinition: TilesetObjectDefinition,
  tileset: Tileset,
): {
  minCol: number;
  minRow: number;
  maxCol: number;
  maxRow: number;
} | null {
  if (!objectDefinition.tiles.length) return null;

  let minCol = Infinity;
  let minRow = Infinity;
  let maxCol = -Infinity;
  let maxRow = -Infinity;

  for (const tile of objectDefinition.tiles) {
    const col = tile.tileIndex % tileset.columns;
    const row = Math.floor(tile.tileIndex / tileset.columns);
    minCol = Math.min(minCol, col);
    minRow = Math.min(minRow, row);
    maxCol = Math.max(maxCol, col);
    maxRow = Math.max(maxRow, row);
  }

  return { minCol, minRow, maxCol, maxRow };
}

export function findObjectDefinitionAtTileIndex(
  tileset: Tileset,
  tileIndex: number,
): TilesetObjectDefinition | null {
  return (
    (tileset.objects ?? []).find((objectDefinition) =>
      objectDefinition.tiles.some((tile) => tile.tileIndex === tileIndex),
    ) ?? null
  );
}

export function matchObjectDefinitionByPattern(
  tileset: Tileset,
  pattern: (number | null)[][],
): TilesetObjectDefinition | null {
  const height = pattern.length;
  const width = pattern[0]?.length ?? 0;
  if (!width || !height) return null;

  for (const objectDefinition of tileset.objects ?? []) {
    const objectPattern = buildPatternFromObjectDefinition(objectDefinition);
    if (!objectPattern) continue;
    if (objectPattern.width !== width || objectPattern.height !== height) continue;

    let matches = true;
    for (let y = 0; y < height && matches; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (objectPattern.pattern[y][x] !== pattern[y][x]) {
          matches = false;
          break;
        }
      }
    }

    if (matches) return objectDefinition;
  }

  return null;
}
