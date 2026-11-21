import type { FloorPlan } from './plan';

/** The building's footprint, cell by cell: the outer border and inner walls are wall, the rest floor. */
export interface Grid {
  width: number;
  depth: number;
  /** `wall[y][x]` */
  wall: boolean[][];
}

/** The cells of an inner wall run, in order. */
export function innerWallCells(wall: FloorPlan['innerWalls'][number]): { x: number; y: number }[] {
  return Array.from({ length: wall.length }, (_, i) =>
    wall.direction === 'east' ? { x: wall.x + i, y: wall.y } : { x: wall.x, y: wall.y + i },
  );
}

export function buildGrid(building: FloorPlan): Grid {
  const { width, depth } = building;
  const wall = Array.from({ length: depth }, (_, y) =>
    Array.from(
      { length: width },
      (_, x) => x === 0 || y === 0 || x === width - 1 || y === depth - 1,
    ),
  );
  // Cells outside the footprint are left to validation to report.
  for (const run of building.innerWalls)
    for (const { x, y } of innerWallCells(run))
      if (x >= 0 && y >= 0 && x < width && y < depth) wall[y][x] = true;
  return { width, depth, wall };
}

export const isInside = (grid: Grid, x: number, y: number) =>
  x >= 0 && y >= 0 && x < grid.width && y < grid.depth;

export const isWall = (grid: Grid, x: number, y: number) => isInside(grid, x, y) && grid.wall[y][x];

export const isFloor = (grid: Grid, x: number, y: number) =>
  isInside(grid, x, y) && !grid.wall[y][x];

/** Which neighbours of a wall cell are wall too: north 1, east 2, south 4, west 8. */
export function wallNeighbourMask(grid: Grid, x: number, y: number): number {
  return (
    (isWall(grid, x, y - 1) ? 1 : 0) |
    (isWall(grid, x + 1, y) ? 2 : 0) |
    (isWall(grid, x, y + 1) ? 4 : 0) |
    (isWall(grid, x - 1, y) ? 8 : 0)
  );
}
