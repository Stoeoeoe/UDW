import type {
  Building,
  BuildingInnerWall,
  BuildingOpening,
  BuildingRoom,
} from '../../types/building';
import { buildGrid, innerWallCells, isFloor, isWall } from './grid';
import { findRegions } from './rooms';
import { floorPlan, withFloor, type FloorPlan } from './plan';

type Cell = { x: number; y: number };

const nextId = (taken: readonly { id: string }[], base: string) => {
  let index = 1;
  while (taken.some((entry) => entry.id === `${base}-${index}`)) index++;
  return `${base}-${index}`;
};

/**
 * The straight line of inside cells from `start` towards `end`: along whichever axis the drag moved further, clipped
 * to the inside of the outer walls.
 */
export function wallLine(building: FloorPlan, start: Cell, end: Cell): Cell[] {
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const from = horizontal ? Math.min(start.x, end.x) : Math.min(start.y, end.y);
  const to = horizontal ? Math.max(start.x, end.x) : Math.max(start.y, end.y);
  const cells: Cell[] = [];
  for (let i = from; i <= to; i++) {
    const cell = horizontal ? { x: i, y: start.y } : { x: start.x, y: i };
    if (cell.x >= 1 && cell.y >= 1 && cell.x <= building.width - 2 && cell.y <= building.depth - 2)
      cells.push(cell);
  }
  return cells;
}

/** A run of consecutive cells along one axis as an inner wall; a single cell keeps the given direction. */
const asRun = (
  cells: Cell[],
  direction: BuildingInnerWall['direction'] = 'east',
): BuildingInnerWall => ({
  x: cells[0].x,
  y: cells[0].y,
  direction: cells.length > 1 ? (cells[1].y > cells[0].y ? 'south' : 'east') : direction,
  length: cells.length,
});

/**
 * Keeps the rest of the plan in step with its walls: openings whose cell is no longer wall go; a room whose cell became
 * wall moves to a neighbouring floor cell; a floor area keeps its first room only; an area without a room gets one.
 */
export function reconcile(building: FloorPlan, defaultFloor: string): FloorPlan {
  const grid = buildGrid(building);
  const openings = building.openings.filter((opening) => isWall(grid, opening.x, opening.y));
  const moved = building.rooms.flatMap((room) => {
    if (isFloor(grid, room.at.x, room.at.y)) return [room];
    const next = [
      { x: room.at.x, y: room.at.y - 1 },
      { x: room.at.x + 1, y: room.at.y },
      { x: room.at.x, y: room.at.y + 1 },
      { x: room.at.x - 1, y: room.at.y },
    ].find((cell) => isFloor(grid, cell.x, cell.y));
    return next ? [{ ...room, at: next }] : [];
  });
  const { regions, regionAt } = findRegions(grid);
  const claimed = new Set<number>();
  const rooms: BuildingRoom[] = [];
  for (const room of moved) {
    const region = regionAt[room.at.y][room.at.x];
    if (claimed.has(region)) continue;
    claimed.add(region);
    rooms.push(room);
  }
  regions.forEach((region, index) => {
    if (claimed.has(index)) return;
    const id = nextId(rooms, 'room');
    rooms.push({
      id,
      at: { x: region.left, y: region.top },
      name: `Room ${id.slice('room-'.length)}`,
      floor: defaultFloor,
    });
  });
  return { ...building, openings, rooms };
}

/** Adds a wall along the cells (consecutive, along one axis). */
export function addWall(building: FloorPlan, cells: Cell[], defaultFloor: string): FloorPlan {
  if (!cells.length) return building;
  return reconcile(
    { ...building, innerWalls: [...building.innerWalls, asRun(cells)] },
    defaultFloor,
  );
}

/** Removes inner wall from the cells, splitting the runs they cut. Outer walls stay. */
export function eraseWall(building: FloorPlan, cells: Cell[], defaultFloor: string): FloorPlan {
  const erased = new Set(cells.map(({ x, y }) => `${x},${y}`));
  const innerWalls = building.innerWalls.flatMap((run) => {
    const pieces: Cell[][] = [[]];
    for (const cell of innerWallCells(run)) {
      if (erased.has(`${cell.x},${cell.y}`)) pieces.push([]);
      else pieces[pieces.length - 1].push(cell);
    }
    return pieces.filter((piece) => piece.length).map((piece) => asRun(piece, run.direction));
  });
  return reconcile({ ...building, innerWalls }, defaultFloor);
}

/** Why an opening of this kind cannot go on the cell, or null if it can. */
export function openingRefusal(
  building: FloorPlan,
  kind: BuildingOpening['kind'],
  x: number,
  y: number,
  ground: boolean,
): string | null {
  const grid = buildGrid(building);
  const south = building.depth - 1;
  const outer = x === 0 || y === 0 || x === building.width - 1 || y === south;
  if (!isWall(grid, x, y)) return `${kind === 'door' ? 'Doors' : 'Windows'} go in a wall.`;
  if ((x === 0 || x === building.width - 1) && (y === 0 || y === south)) return 'Not on a corner.';
  if (building.openings.some((opening) => opening.x === x && opening.y === y))
    return 'There is already an opening here.';
  if (kind === 'window' && y !== south) return 'Windows go in the south wall for now.';
  if (kind === 'door' && outer && !ground)
    return 'Only the ground floor has a door to the outside.';
  if (kind === 'door' && outer && y !== south)
    return 'Only the south wall has a door to the outside.';
  return null;
}

/** Adds an opening; the ground floor's first door in the south wall is the entrance. */
export function addOpening(
  building: FloorPlan,
  kind: BuildingOpening['kind'],
  x: number,
  y: number,
): FloorPlan {
  const entrance =
    kind === 'door' &&
    y === building.depth - 1 &&
    !building.openings.some((opening) => opening.id === 'entrance');
  const id = entrance ? 'entrance' : nextId(building.openings, kind);
  return { ...building, openings: [...building.openings, { id, kind, x, y }] };
}

/** One floor at a new size, and what that removes; see {@link resize}. */
function resizeFloor(
  building: FloorPlan,
  width: number,
  depth: number,
  defaultFloor: string,
): { building: FloorPlan; removed: string[] } {
  const removed: string[] = [];
  const oldSouth = building.depth - 1;
  const inside = (cell: Cell) =>
    cell.x >= 1 && cell.y >= 1 && cell.x <= width - 2 && cell.y <= depth - 2;
  const innerWalls = building.innerWalls.flatMap((run) => {
    const pieces: Cell[][] = [[]];
    for (const cell of innerWallCells(run)) {
      if (inside(cell)) pieces[pieces.length - 1].push(cell);
      else pieces.push([]);
    }
    const kept = pieces.filter((piece) => piece.length);
    if (kept.reduce((sum, piece) => sum + piece.length, 0) < run.length)
      removed.push(`part of the inner wall at (${run.x}, ${run.y})`);
    return kept.map((piece) => asRun(piece, run.direction));
  });
  const openings = building.openings.flatMap((opening) => {
    const moved = opening.y === oldSouth ? { ...opening, y: depth - 1 } : opening;
    const fits = moved.y === depth - 1 ? moved.x >= 1 && moved.x <= width - 2 : inside(moved);
    if (!fits) removed.push(`${opening.kind} ${opening.id}`);
    return fits ? [moved] : [];
  });
  let stairsUp = building.stairsUp;
  if (stairsUp && !inside(stairsUp)) {
    removed.push('the stairs');
    stairsUp = undefined;
  }
  const resized = reconcile(
    { ...building, width, depth, innerWalls, openings, stairsUp },
    defaultFloor,
  );
  for (const room of building.rooms)
    if (!resized.rooms.some((kept) => kept.id === room.id)) removed.push(`room ${room.id}`);
  return { building: resized, removed };
}

/**
 * The building at a new size, and what that removes on any floor. Openings in the south wall move with it; inner walls
 * are cut to the new inside; stairs and a chimney outside it go.
 */
export function resize(
  building: Building,
  width: number,
  depth: number,
  defaultFloor: string,
): { building: Building; removed: string[] } {
  const removed: string[] = [];
  let resized: Building = { ...building, width, depth };
  building.floors.forEach((_, index) => {
    const floor = resizeFloor(floorPlan(building, index), width, depth, defaultFloor);
    const where =
      building.floors.length > 1
        ? ` on ${index === 0 ? 'the ground floor' : `floor ${index + 1}`}`
        : '';
    removed.push(...floor.removed.map((entry) => entry + where));
    resized = withFloor(resized, index, floor.building);
  });
  if (resized.chimney && resized.chimney.column > width - 2) {
    removed.push('the chimney');
    resized = { ...resized, chimney: undefined };
  }
  return { building: resized, removed };
}
