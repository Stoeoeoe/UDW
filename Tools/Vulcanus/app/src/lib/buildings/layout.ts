import type { Building } from '../../types/building';
import { floorPlan, type FloorPlan } from './plan';
import { buildGrid, isFloor, isWall, wallNeighbourMask, type Grid } from './grid';
import { findRegions, roomsByRegion } from './rooms';

/** Storey height: the front wall's face is this many rows tall. */
export const STOREY_ROWS = 3;
/** Rows of a room taken by its back wall's face. */
export const BACK_WALL_ROWS = 2;

/** A kit piece at a cell of a composed image. Overlays are drawn after every other piece. */
export interface Placement {
  piece: string;
  column: number;
  row: number;
  overlay: boolean;
}

const side = (column: number, width: number) =>
  column === 0 ? 'l' : column === width - 1 ? 'r' : 'm';

/** Rows of roof slope seen from the front: about half the building's depth, so the front dominates. */
export const roofDepthRows = (depth: number) => Math.min(4, Math.max(2, Math.ceil(depth / 2)));

/** The column of the front that a plan column shows in. */
export const frontColumn = (building: Building, x: number) => Math.floor(x / building.scale);

export const frontWidth = (building: Building) => Math.ceil(building.width / building.scale);

/** The ground floor's entrance: its first door in the south wall. */
export const entranceOf = (building: Building) =>
  building.floors[0].openings.find((o) => o.kind === 'door' && o.y === building.depth - 1);

/**
 * The front columns under a front gable, or `null` for none: all of them for a front gable; for a cross gable those of
 * the room behind the entrance, its walls included, widened by one column if needed so the gable has a middle.
 */
export function gableSpan(building: Building): { left: number; right: number } | null {
  const columns = frontWidth(building);
  if (building.roof.kind === 'side-gable') return null;
  if (building.roof.kind === 'front-gable') return { left: 0, right: columns - 1 };
  const entrance = entranceOf(building);
  if (!entrance) return null;
  const { regions, regionAt } = findRegions(buildGrid(floorPlan(building, 0)));
  const region = regions[regionAt[entrance.y - 1]?.[entrance.x] ?? -1];
  if (!region) return null;
  let left = frontColumn(building, region.left - 1);
  let right = frontColumn(building, region.right + 1);
  if ((right - left) % 2 === 1) {
    if (right < columns - 1) right++;
    else left--;
  }
  return { left, right };
}

/** The exterior image's size in tiles; its bottom `footprintRows` rows are the ground it stands on. */
export interface ExteriorShape {
  columns: number;
  rows: number;
  roofRows: number;
  footprintRows: number;
}

export function exteriorShape(building: Building): ExteriorShape {
  const depthRows = roofDepthRows(building.depth);
  const span = gableSpan(building);
  const gableRows = span ? Math.floor((span.right - span.left) / 2) + 1 : 0;
  const roofRows = depthRows + gableRows;
  return {
    columns: frontWidth(building),
    rows: roofRows + STOREY_ROWS * building.floors.length,
    roofRows,
    footprintRows: depthRows,
  };
}

/**
 * The exterior, drawn by readable rules rather than to scale (docs/building-editor.md): the roof, squashed to about
 * half the building's depth, with a front gable for a front or cross gable roof; below it 3 rows of wall per floor, top
 * floor first, with each floor's south windows and the ground floor's door.
 */
export function layoutExterior(building: Building): Placement[] {
  const { columns, roofRows } = exteriorShape(building);
  const depthRows = roofDepthRows(building.depth);
  const span = gableSpan(building);
  const gableRows = roofRows - depthRows;
  const placements: Placement[] = [];
  const place = (piece: string, column: number, row: number, overlay = false) =>
    placements.push({ piece, column, row, overlay });

  // The highest roof row of each column, for the chimney to stand on.
  const roofTop: number[] = [];
  for (let column = 0; column < columns; column++) {
    if (span && column >= span.left && column <= span.right) {
      const mid = Math.floor((span.left + span.right) / 2);
      const d = Math.abs(column - mid);
      const hand = column < mid ? 'l' : 'r';
      roofTop.push(d);
      for (let row = 0; row < roofRows; row++) {
        if (d === 0)
          place(
            row === 0
              ? 'gable_peak'
              : row < depthRows
                ? 'gable_ridge'
                : row === depthRows
                  ? 'gable_apex'
                  : 'gable_wall',
            column,
            row,
          );
        else if (row === d) place(`gable_back_${hand}`, column, row);
        else if (row > d && row < depthRows + d) place(`gable_roof_${hand}`, column, row);
        else if (row === depthRows + d) place(`gable_edge_${hand}`, column, row);
        else if (row > depthRows + d) place('gable_wall', column, row);
      }
    } else {
      roofTop.push(gableRows);
      for (let i = 0; i < depthRows; i++) {
        const kind = i === 0 ? 'roof_ridge' : i === depthRows - 1 ? 'roof_eave' : 'roof_slope';
        place(`${kind}_${side(column, columns)}`, column, gableRows + i);
      }
    }
  }

  const south = building.depth - 1;
  const entrance = entranceOf(building);
  const doorColumn = entrance ? frontColumn(building, entrance.x) : -1;
  const floors = building.floors.length;
  building.floors.forEach((floor, index) => {
    const top = roofRows + (floors - 1 - index) * STOREY_ROWS;
    const windows = new Set(
      floor.openings
        .filter((o) => o.kind === 'window' && o.y === south)
        .map((o) => frontColumn(building, o.x)),
    );
    const rows = [
      index === floors - 1 ? 'wall_top' : 'wall_band',
      'wall_mid',
      index === 0 ? 'wall_base' : 'wall_mid',
    ];
    for (let column = 0; column < columns; column++)
      rows.forEach((kind, i) => {
        let piece = `${kind}_${side(column, columns)}`;
        if (index === 0 && column === doorColumn)
          piece = ['door_lintel', 'door_upper', 'door_lower'][i];
        else if (i === 1 && windows.has(column)) piece = 'window';
        place(piece, column, top + i);
      });
  });

  if (building.chimney) {
    const column = frontColumn(building, building.chimney.column);
    place('chimney_top', column, roofTop[column], true);
    place('chimney_bottom', column, roofTop[column] + 1, true);
  }
  return placements;
}

export interface InteriorLayout {
  placements: Placement[];
  /** `blocked[y][x]`: walls and back-wall faces, except where a door lets characters through. */
  blocked: boolean[][];
  /** The entrance cell in the south wall, where the interior links to the exterior door. */
  entrance: { x: number; y: number } | null;
}

/** A floor's interior on the building's grid, cell for cell; `stairsDown` is the stairs up of the floor below. */
export function layoutInterior(
  building: FloorPlan,
  grid: Grid = buildGrid(building),
  stairsDown?: { x: number; y: number },
): InteriorLayout {
  const { width, depth } = grid;
  const south = depth - 1;
  const openingAt = new Map(building.openings.map((o) => [`${o.x},${o.y}`, o]));
  const opening = (x: number, y: number) => openingAt.get(`${x},${y}`);
  const regions = findRegions(grid);
  const { roomsIn } = roomsByRegion(building, regions);
  // A door in a horizontal wall (floor above and below it) cuts through the face of the room below.
  const isHorizontalDoor = (x: number, y: number) =>
    opening(x, y)?.kind === 'door' && isFloor(grid, x, y - 1) && isFloor(grid, x, y + 1);

  const placements: Placement[] = [];
  const blocked = grid.wall.map((row) => row.map(() => false));
  let entrance: InteriorLayout['entrance'] = null;
  const place = (piece: string, x: number, y: number) =>
    placements.push({ piece, column: x, row: y, overlay: false });

  for (let y = 0; y < depth; y++)
    for (let x = 0; x < width; x++) {
      const here = opening(x, y);
      if (isWall(grid, x, y)) {
        if (here?.kind === 'door' && y === south) {
          place('entrance_mat', x, y);
          entrance = { x, y };
        } else if (here?.kind === 'door') place('threshold', x, y);
        else if (here?.kind === 'window') {
          place('window_cap', x, y);
          blocked[y][x] = true;
        } else {
          place(`wall_cap_${String(wallNeighbourMask(grid, x, y)).padStart(2, '0')}`, x, y);
          blocked[y][x] = true;
        }
        continue;
      }
      const faceSide = isWall(grid, x - 1, y) ? 'l' : isWall(grid, x + 1, y) ? 'r' : 'm';
      if (isWall(grid, x, y - 1)) {
        if (isHorizontalDoor(x, y - 1)) place('door_face_upper', x, y);
        else {
          place(`wall_face_upper_${faceSide}`, x, y);
          blocked[y][x] = true;
        }
      } else if (isWall(grid, x, y - BACK_WALL_ROWS)) {
        if (isHorizontalDoor(x, y - BACK_WALL_ROWS)) place('door_face_lower', x, y);
        else {
          place(`wall_face_lower_${faceSide}`, x, y);
          blocked[y][x] = true;
        }
      } else {
        // A region without exactly one room is a validation error; it is drawn without a floor.
        const rooms = roomsIn[regions.regionAt[y][x]];
        if (rooms.length === 1) place(rooms[0].floor, x, y);
      }
    }
  const stairs = [
    [building.stairsUp, 'stairs_up'],
    [stairsDown, 'stairs_down'],
  ] as const;
  for (const [cell, piece] of stairs)
    if (cell && isFloor(grid, cell.x, cell.y))
      placements.push({ piece, column: cell.x, row: cell.y, overlay: true });
  return { placements, blocked, entrance };
}

/** The interior of one of the building's floors. */
export const layoutFloor = (building: Building, floor: number) =>
  layoutInterior(
    floorPlan(building, floor),
    undefined,
    floor > 0 ? building.floors[floor - 1].stairsUp : undefined,
  );
