import type { Building, BuildingRoom } from '../../types/building';
import { isFloor, type Grid } from './grid';

/** A connected floor area. */
export interface Region {
  cells: { x: number; y: number }[];
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Regions {
  regions: Region[];
  /** `regionAt[y][x]`: the region of a floor cell, -1 for walls. */
  regionAt: number[][];
}

/** The floor areas between walls, found row by row from the top left. */
export function findRegions(grid: Grid): Regions {
  const regionAt = grid.wall.map((row) => row.map(() => -1));
  const regions: Region[] = [];
  for (let y = 0; y < grid.depth; y++)
    for (let x = 0; x < grid.width; x++) {
      if (!isFloor(grid, x, y) || regionAt[y][x] >= 0) continue;
      const index = regions.length;
      const region: Region = { cells: [], left: x, top: y, right: x, bottom: y };
      const open = [{ x, y }];
      regionAt[y][x] = index;
      while (open.length) {
        const cell = open.pop()!;
        region.cells.push(cell);
        region.left = Math.min(region.left, cell.x);
        region.right = Math.max(region.right, cell.x);
        region.top = Math.min(region.top, cell.y);
        region.bottom = Math.max(region.bottom, cell.y);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const next = { x: cell.x + dx, y: cell.y + dy };
          if (isFloor(grid, next.x, next.y) && regionAt[next.y][next.x] < 0) {
            regionAt[next.y][next.x] = index;
            open.push(next);
          }
        }
      }
      regions.push(region);
    }
  return { regions, regionAt };
}

export const isRectangle = (region: Region) =>
  region.cells.length === (region.right - region.left + 1) * (region.bottom - region.top + 1);

/** Which region each room is in (by its `at` cell), and the rooms of each region. */
export function roomsByRegion(
  building: Building,
  { regions, regionAt }: Regions,
): { regionOf: Map<string, number>; roomsIn: BuildingRoom[][] } {
  const regionOf = new Map<string, number>();
  const roomsIn: BuildingRoom[][] = regions.map(() => []);
  for (const room of building.rooms) {
    const index = regionAt[room.at.y]?.[room.at.x] ?? -1;
    if (index < 0) continue;
    regionOf.set(room.id, index);
    roomsIn[index].push(room);
  }
  return { regionOf, roomsIn };
}
