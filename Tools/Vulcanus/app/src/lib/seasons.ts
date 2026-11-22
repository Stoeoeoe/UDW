import type { Season, Tileset } from '../types/schema';

export type { Season };

/** The game's seasons, in calendar order. */
export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

export const SEASON_NAMES: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};

/** Whether a tileset is a season twin of another tileset, which maps never place directly. */
export function isSeasonTwin(tileset: Tileset): boolean {
  return tileset.baseTilesetId !== undefined;
}

/** The season twin of a tileset for a season, if the project has one. */
export function findSeasonTwin(
  tilesets: Iterable<Tileset>,
  baseTilesetId: string,
  season: Season,
): Tileset | undefined {
  for (const tileset of tilesets)
    if (tileset.baseTilesetId === baseTilesetId && tileset.season === season) return tileset;
  return undefined;
}

/** Why a tileset cannot be the season twin of a base tileset, or null when it can: both need the same grid. */
export function seasonTwinMismatch(
  twin: Pick<Tileset, 'columns' | 'tileCount'>,
  base: Tileset,
): string | null {
  if (twin.columns !== base.columns || twin.tileCount !== base.tileCount)
    return `A season twin needs the same grid as ${base.name}: ${base.columns} columns and ${base.tileCount} tiles.`;
  return null;
}

/**
 * The tiles of a sheet that have any visible pixel. A season twin's fully transparent tiles fall back to the base.
 * `pixels` is RGBA, row by row, `width` pixels wide.
 */
export function opaqueTileIndices(
  pixels: ArrayLike<number>,
  width: number,
  columns: number,
  tileCount: number,
  tileSize: number,
): Set<number> {
  const opaque = new Set<number>();
  for (let index = 0; index < tileCount; index++) {
    const left = (index % columns) * tileSize;
    const top = Math.floor(index / columns) * tileSize;
    search: for (let y = top; y < top + tileSize; y++)
      for (let x = left; x < left + tileSize; x++)
        if (pixels[(y * width + x) * 4 + 3] > 0) {
          opaque.add(index);
          break search;
        }
  }
  return opaque;
}

const opaqueBySheet = new WeakMap<HTMLImageElement, Set<number>>();

/** {@link opaqueTileIndices} of a loaded sheet image, computed once per image. */
export function opaqueTilesOfImage(
  image: HTMLImageElement,
  tileset: Tileset,
  tileSize: number,
): Set<number> {
  let opaque = opaqueBySheet.get(image);
  if (!opaque) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    opaque = opaqueTileIndices(data, image.width, tileset.columns, tileset.tileCount, tileSize);
    opaqueBySheet.set(image, opaque);
  }
  return opaque;
}

/**
 * The tileset to draw a tile from in a season: the season twin when its tile has visible pixels, otherwise the
 * tileset itself. Collision, cost and terrain always come from the tileset itself.
 */
export function seasonalTileset(
  tilesets: ReadonlyMap<string, Tileset>,
  tileset: Tileset,
  tileIndex: number,
  season: Season | null,
  sprites: ReadonlyMap<string, HTMLImageElement>,
  tileSize: number,
): Tileset {
  if (!season) return tileset;
  const twin = findSeasonTwin(tilesets.values(), tileset.id, season);
  const image = twin && sprites.get(twin.spriteSheet);
  return image && opaqueTilesOfImage(image, twin, tileSize).has(tileIndex) ? twin : tileset;
}
