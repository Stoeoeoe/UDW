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

/**
 * What stops a building's plan from being built, each naming what it concerns. With the kit, its pieces and floors
 * are checked too. The rules are those of docs/building-editor.md for one storey and one rectangular wing.
 */
export function validateBuildingPlan(building: Building, kit?: ResolvedKit): string[] {
  const errors: string[] = [];
  const { width, depth } = building;
  if (width < 3) errors.push('The building must be at least 3 tiles wide.');
  if (depth < 5) errors.push('The building must be at least 5 tiles deep.');
  if (width < 3 || depth < 5) return errors;

  for (const run of building.innerWalls) {
    if (run.length < 1) errors.push(`The inner wall at (${run.x}, ${run.y}) has no cells.`);
    else if (
      innerWallCells(run).some(({ x, y }) => x < 1 || y < 1 || x > width - 2 || y > depth - 2)
    )
      errors.push(
        `The inner wall at (${run.x}, ${run.y}) reaches beyond the inside of the building.`,
      );
  }

  const grid = buildGrid(building);
  const regions = findRegions(grid);
  const { regionOf, roomsIn } = roomsByRegion(building, regions);

  for (const id of duplicates(building.rooms.map((room) => room.id)))
    errors.push(`The room ID ${id} is used more than once.`);
  for (const id of duplicates(building.openings.map((opening) => opening.id)))
    errors.push(`The opening ID ${id} is used more than once.`);

  for (const room of building.rooms)
    if (!regionOf.has(room.id)) errors.push(`Room ${room.id} is not on a floor cell.`);
  regions.regions.forEach((region, index) => {
    const where = `The floor area at (${region.left}, ${region.top})`;
    if (!isRectangle(region)) errors.push(`${where} is not a rectangle.`);
    const rooms = roomsIn[index];
    if (rooms.length === 0) errors.push(`${where} has no room.`);
    if (rooms.length > 1)
      errors.push(`Rooms ${rooms.map((room) => room.id).join(' and ')} share one floor area.`);
    const rows = region.bottom - region.top + 1;
    if (rooms.length === 1 && rows < MIN_ROOM_ROWS)
      errors.push(
        `Room ${rooms[0].id} is ${rows} row${rows === 1 ? '' : 's'} deep; rooms need at least ${MIN_ROOM_ROWS} ` +
          '(two for the back wall, one to walk on).',
      );
  });

  const cellOwners = new Map<string, BuildingOpening[]>();
  for (const opening of building.openings) {
    const key = `${opening.x},${opening.y}`;
    cellOwners.set(key, [...(cellOwners.get(key) ?? []), opening]);
  }
  for (const owners of cellOwners.values())
    if (owners.length > 1)
      errors.push(`Openings ${owners.map((o) => o.id).join(' and ')} are on the same cell.`);

  const south = depth - 1;
  const entrances: BuildingOpening[] = [];
  for (const opening of building.openings) {
    const { x, y } = opening;
    const name = `${opening.kind === 'door' ? 'Door' : 'Window'} ${opening.id}`;
    if (!isWall(grid, x, y)) {
      errors.push(`${name} is not in a wall.`);
      continue;
    }
    if (isCorner(grid, x, y)) {
      errors.push(`${name} is on a corner.`);
      continue;
    }
    if (opening.kind === 'window') {
      if (y !== south) errors.push(`${name} is not in the south wall; windows go there for now.`);
      continue;
    }
    if (y === south) entrances.push(opening);
    else if (isOuterWall(grid, x, y))
      errors.push(
        `${name} is in an outer wall other than the south wall; only the entrance leads outside.`,
      );
    else {
      const across = (ax: number, ay: number, bx: number, by: number) =>
        isFloor(grid, ax, ay) &&
        isFloor(grid, bx, by) &&
        regions.regionAt[ay][ax] !== regions.regionAt[by][bx];
      if (!across(x - 1, y, x + 1, y) && !across(x, y - 1, x, y + 1))
        errors.push(`${name} does not lead from one room to another.`);
    }
  }
  if (entrances.length === 0)
    errors.push('The building needs an entrance: a door in the south wall.');
  if (entrances.length > 1)
    errors.push(
      `Only one door may be in the south wall; doors ${entrances.map((door) => door.id).join(' and ')} are.`,
    );

  if (building.chimney && (building.chimney.column < 1 || building.chimney.column > width - 2))
    errors.push('The chimney must stand on a column between the outer walls.');

  if (!building.kit) errors.push('Choose a kit.');
  if (kit) {
    if (kit.empty.length) errors.push(`The kit has nothing drawn for: ${kit.empty.join(', ')}.`);
    for (const room of building.rooms)
      if (!kit.floors.includes(room.floor))
        errors.push(`Room ${room.id} uses the floor ${room.floor}, which the kit does not have.`);
  }
  return errors;
}
