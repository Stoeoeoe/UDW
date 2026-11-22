import type { ObjectDefinition } from '../types/object';
import type { Tileset, TilesetObjectTile } from '../types/schema';

/** An object's tiles from cells of its tileset's sheet: offsets from the top-left cell, in reading order. */
export function objectTilesFromSheet(
  tileIndices: Iterable<number>,
  columns: number,
): TilesetObjectTile[] {
  const cells = [...new Set(tileIndices)].map((tileIndex) => ({
    tileIndex,
    col: tileIndex % columns,
    row: Math.floor(tileIndex / columns),
  }));
  if (!cells.length) return [];
  const left = Math.min(...cells.map((cell) => cell.col));
  const top = Math.min(...cells.map((cell) => cell.row));
  return cells
    .map((cell) => ({ x: cell.col - left, y: cell.row - top, tileIndex: cell.tileIndex }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/** The sheet cells between two corners, inclusive. */
export function sheetRectangle(from: number, to: number, columns: number): number[] {
  const [c0, c1] = [from % columns, to % columns].sort((a, b) => a - b);
  const [r0, r1] = [Math.floor(from / columns), Math.floor(to / columns)].sort((a, b) => a - b);
  const cells: number[] = [];
  for (let row = r0; row <= r1; row++)
    for (let col = c0; col <= c1; col++) cells.push(row * columns + col);
  return cells;
}

/** An object's size in tiles. */
export function objectSize(tiles: TilesetObjectTile[]): { width: number; height: number } {
  if (!tiles.length) return { width: 0, height: 0 };
  return {
    width: Math.max(...tiles.map((tile) => tile.x)) + 1,
    height: Math.max(...tiles.map((tile) => tile.y)) + 1,
  };
}

/** Every tag used in the project, on objects and on tileset tiles, for suggestions; sorted. */
export function projectTags(objects: ObjectDefinition[], tilesets: Iterable<Tileset>): string[] {
  const tags = new Set<string>();
  for (const object of objects) for (const tag of object.tags ?? []) tags.add(tag);
  for (const tileset of tilesets)
    for (const tile of Object.values(tileset.tiles))
      for (const tag of tile.tags ?? []) tags.add(tag);
  return [...tags].sort((a, b) => a.localeCompare(b));
}

/** The object that uses a cell of its tileset's sheet, if any. */
export function objectAtSheetCell(
  objects: ObjectDefinition[],
  tileIndex: number,
): ObjectDefinition | null {
  return (
    objects.find((object) => object.tiles.some((tile) => tile.tileIndex === tileIndex)) ?? null
  );
}

/** The rectangle of sheet cells an object's tiles come from. */
export function objectSheetBounds(
  object: ObjectDefinition,
  columns: number,
): { minCol: number; minRow: number; maxCol: number; maxRow: number } | null {
  if (!object.tiles.length) return null;
  const cols = object.tiles.map((tile) => tile.tileIndex % columns);
  const rows = object.tiles.map((tile) => Math.floor(tile.tileIndex / columns));
  return {
    minCol: Math.min(...cols),
    minRow: Math.min(...rows),
    maxCol: Math.max(...cols),
    maxRow: Math.max(...rows),
  };
}
