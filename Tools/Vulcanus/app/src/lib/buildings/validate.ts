import type { Building, BuildingOpening } from '../../types/building';
import type { ResolvedKit } from './resolveKit';
import { buildGrid, innerWallCells, isFloor, isWall, type Grid } from './grid';
import { findRegions, isRectangle, roomsByRegion } from './rooms';
import { floorName, floorPlan, type FloorPlan } from './plan';
import { frontWidth, gableSpan } from './layout';

/** Rooms need four rows for the back wall's face and at least two to walk on. */
export const MIN_ROOM_ROWS = 6;

const duplicates = (ids: string[]) => [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];

const isCorner = (grid: Grid, x: number, y: number) =>
  (x === 0 || x === grid.width - 1) && (y === 0 || y === grid.depth - 1);

const isOuterWall = (grid: Grid, x: number, y: number) =>
  x === 0 || y === 0 || x === grid.width - 1 || y === grid.depth - 1;

/** A problem with a building, and the cells it concerns on one of its floors (none for the building as a whole). */
export interface PlanIssue {
  message: string;
  /** The floor the cells are on; `null` for the building as a whole. */
  floor: number | null;
  cells: { x: number; y: number }[];
}

type FloorIssue = Omit<PlanIssue, 'floor'>;

/** One floor's problems; only the ground floor has an entrance. */
function floorIssues(building: FloorPlan, ground: boolean): FloorIssue[] {
  const issues: FloorIssue[] = [];
  const add = (message: string, cells: FloorIssue['cells'] = []) => issues.push({ message, cells });
  const { width, depth } = building;

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
          '(four for the back wall, two to walk on).',
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
      if (y !== south && y !== 0)
        add(`${name} is not in the south or north wall; windows go there.`, [opening]);
      else if (y === 0 && !isFloor(grid, x, 1))
        add(`${name} in the north wall has no room below it to be seen from.`, [opening]);
      continue;
    }
    if (y === south && ground) entrances.push(opening);
    else if (isOuterWall(grid, x, y) && !ground)
      add(`${name} is in an outer wall; only the ground floor has a door to the outside.`, [
        opening,
      ]);
    else if (isOuterWall(grid, x, y) && y !== south)
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
  if (ground && entrances.length === 0)
    add('The building needs an entrance: a door in the south wall.');
  if (entrances.length > 1)
    add(
      `Only one door may be in the south wall; doors ${entrances.map((door) => door.id).join(' and ')} are.`,
      entrances,
    );

  return issues;
}

/**
 * What stops a building's plan from being built, each naming what it concerns. With the kit, its pieces and floors
 * are checked too. The rules are those of docs/building-editor.md.
 */
export function validateBuildingPlan(building: Building, kit?: ResolvedKit): string[] {
  return planIssues(building, kit).map((issue) => issue.message);
}

/** The problems of {@link validateBuildingPlan} with their floors and cells, for outlining them in the plan. */
export function planIssues(building: Building, kit?: ResolvedKit): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const add = (message: string, floor: number | null = null, cells: PlanIssue['cells'] = []) =>
    issues.push({ message, floor, cells });
  const { width, depth, floors } = building;
  if (width < 3) add('The building must be at least 3 tiles wide.');
  if (depth < 5) add('The building must be at least 5 tiles deep.');
  if (floors.length === 0) add('The building needs a floor.');
  if (width < 3 || depth < 5 || floors.length === 0) return issues;

  floors.forEach((_, index) => {
    const prefix = floors.length > 1 ? `${floorName(index)}: ` : '';
    for (const issue of floorIssues(floorPlan(building, index), index === 0))
      add(prefix + issue.message, index, issue.cells);
  });

  floors.forEach((floor, index) => {
    const stairs = floor.stairsUp;
    const top = index === floors.length - 1;
    if (top && stairs)
      add(`${floorName(index)} is the top floor; its stairs lead nowhere.`, index, [stairs]);
    if (!top && !stairs)
      add(`${floorName(index)} needs stairs up to ${floorName(index + 1).toLowerCase()}.`, index);
    if (top || !stairs) return;
    if (!isFloor(buildGrid(floorPlan(building, index)), stairs.x, stairs.y))
      add(`${floorName(index)}: the stairs up are not on a floor cell.`, index, [stairs]);
    if (!isFloor(buildGrid(floorPlan(building, index + 1)), stairs.x, stairs.y))
      add(
        `${floorName(index + 1)}: the stairs down at (${stairs.x}, ${stairs.y}) are not on a floor cell.`,
        index + 1,
        [stairs],
      );
  });

  const span = gableSpan(building);
  const columns = frontWidth(building);
  if (building.roof.kind === 'front-gable' && columns % 2 === 0)
    add(`A front gable needs an odd number of front columns; the front is ${columns} wide.`);
  if (building.roof.kind === 'cross-gable') {
    if (!span)
      add(
        'A cross gable sits over the room behind the entrance; the building has no entrance room.',
      );
    else if (span.left < 2 || span.right > columns - 3)
      add(
        'A cross gable needs at least 2 front columns of wing on each side of the room behind the entrance; ' +
          'make that room narrower or use a front gable.',
      );
  }

  if (building.chimney && (building.chimney.column < 1 || building.chimney.column > width - 2))
    add('The chimney must stand on a column between the outer walls.');

  if (!building.kit) add('Choose a kit.');
  if (kit) {
    if (kit.empty.length) add(`The kit has nothing drawn for: ${kit.empty.join(', ')}.`);
    floors.forEach((floor, index) => {
      for (const room of floor.rooms)
        if (!kit.floors.includes(room.floor))
          add(`Room ${room.id} uses the floor ${room.floor}, which the kit does not have.`, index, [
            room.at,
          ]);
    });
  }
  return issues;
}
