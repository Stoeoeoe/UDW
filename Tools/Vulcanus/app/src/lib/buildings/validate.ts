import type { Building, BuildingOpening } from '../../types/building';
import type { ResolvedKit } from './resolveKit';
import { buildGrid, innerWallCells, isFloor, isWall, type Grid } from './grid';
import { findRegions, isRectangle, roomsByRegion } from './rooms';

/** Rooms need two rows for the back wall's face and at least one to walk on. */
export const MIN_ROOM_ROWS = 3;

const duplicates = (ids: string[]) => [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];

const isCorner = (grid: Grid, x: number, y: number) =>
  (x === 0 || x === grid.width - 1) && (y === 0 || y === grid.depth - 1);

const isOuterWall = (grid: Grid, x: number, y: number) =>
  x === 0 || y === 0 || x === grid.width - 1 || y === grid.depth - 1;

/** A problem with a plan, and the cells it concerns (none for the building as a whole). */
export interface PlanIssue {
  message: string;
  cells: { x: number; y: number }[];
}

/**
 * What stops a building's plan from being built, each naming what it concerns. With the kit, its pieces and floors
 * are checked too. The rules are those of docs/building-editor.md for one storey and one rectangular wing.
 */
export function validateBuildingPlan(building: Building, kit?: ResolvedKit): string[] {
  return planIssues(building, kit).map((issue) => issue.message);
}

/** The problems of {@link validateBuildingPlan} with their cells, for outlining them in the plan. */
export function planIssues(building: Building, kit?: ResolvedKit): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const add = (message: string, cells: PlanIssue['cells'] = []) => issues.push({ message, cells });
  const { width, depth } = building;
  if (width < 3) add('The building must be at least 3 tiles wide.');
  if (depth < 5) add('The building must be at least 5 tiles deep.');
  if (width < 3 || depth < 5) return issues;

  for (const run of building.innerWalls) {
    if (run.length < 1) add(`The inner wall at (${run.x}, ${run.y}) has no cells.`);
    else if (
      innerWallCells(run).some(({ x, y }) => x < 1 || y < 1 || x > width - 2 || y > depth - 2)
    )
      add(
        `The inner wall at (${run.x}, ${run.y}) reaches beyond the inside of the building.`,
        innerWallCells(run),
      );
  }

  const grid = buildGrid(building);
  const regions = findRegions(grid);
  const { regionOf, roomsIn } = roomsByRegion(building, regions);

  for (const id of duplicates(building.rooms.map((room) => room.id)))
    add(`The room ID ${id} is used more than once.`);
  for (const id of duplicates(building.openings.map((opening) => opening.id)))
    add(`The opening ID ${id} is used more than once.`);

  for (const room of building.rooms)
    if (!regionOf.has(room.id)) add(`Room ${room.id} is not on a floor cell.`, [room.at]);
  regions.regions.forEach((region, index) => {
    const where = `The floor area at (${region.left}, ${region.top})`;
    if (!isRectangle(region)) add(`${where} is not a rectangle.`, region.cells);
    const rooms = roomsIn[index];
    if (rooms.length === 0) add(`${where} has no room.`, region.cells);
    if (rooms.length > 1)
      add(
        `Rooms ${rooms.map((room) => room.id).join(' and ')} share one floor area.`,
        region.cells,
      );
    const rows = region.bottom - region.top + 1;
    if (rooms.length === 1 && rows < MIN_ROOM_ROWS)
      add(
        `Room ${rooms[0].id} is ${rows} row${rows === 1 ? '' : 's'} deep; rooms need at least ${MIN_ROOM_ROWS} ` +
          '(two for the back wall, one to walk on).',
        region.cells,
      );
  });

  const cellOwners = new Map<string, BuildingOpening[]>();
  for (const opening of building.openings) {
    const key = `${opening.x},${opening.y}`;
    cellOwners.set(key, [...(cellOwners.get(key) ?? []), opening]);
  }
  for (const owners of cellOwners.values())
    if (owners.length > 1)
      add(`Openings ${owners.map((o) => o.id).join(' and ')} are on the same cell.`, [owners[0]]);

  const south = depth - 1;
  const entrances: BuildingOpening[] = [];
  for (const opening of building.openings) {
    const { x, y } = opening;
    const name = `${opening.kind === 'door' ? 'Door' : 'Window'} ${opening.id}`;
    if (!isWall(grid, x, y)) {
      add(`${name} is not in a wall.`, [opening]);
      continue;
    }
    if (isCorner(grid, x, y)) {
      add(`${name} is on a corner.`, [opening]);
      continue;
    }
    if (opening.kind === 'window') {
      if (y !== south)
        add(`${name} is not in the south wall; windows go there for now.`, [opening]);
      continue;
    }
    if (y === south) entrances.push(opening);
    else if (isOuterWall(grid, x, y))
      add(
        `${name} is in an outer wall other than the south wall; only the entrance leads outside.`,
        [opening],
      );
    else {
      const across = (ax: number, ay: number, bx: number, by: number) =>
        isFloor(grid, ax, ay) &&
        isFloor(grid, bx, by) &&
        regions.regionAt[ay][ax] !== regions.regionAt[by][bx];
      if (!across(x - 1, y, x + 1, y) && !across(x, y - 1, x, y + 1))
        add(`${name} does not lead from one room to another.`, [opening]);
    }
  }
  if (entrances.length === 0) add('The building needs an entrance: a door in the south wall.');
  if (entrances.length > 1)
    add(
      `Only one door may be in the south wall; doors ${entrances.map((door) => door.id).join(' and ')} are.`,
      entrances,
    );

  if (building.chimney && (building.chimney.column < 1 || building.chimney.column > width - 2))
    add('The chimney must stand on a column between the outer walls.');

  if (!building.kit) add('Choose a kit.');
  if (kit) {
    if (kit.empty.length) add(`The kit has nothing drawn for: ${kit.empty.join(', ')}.`);
    for (const room of building.rooms)
      if (!kit.floors.includes(room.floor))
        add(`Room ${room.id} uses the floor ${room.floor}, which the kit does not have.`, [
          room.at,
        ]);
  }
  return issues;
}
