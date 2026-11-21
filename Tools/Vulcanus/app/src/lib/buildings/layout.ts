import type { Building, BuildingOpening, WindowSize } from '../../types/building';
import { floorPlan, type FloorPlan } from './plan';
import { buildGrid, isFloor, isWall, wallNeighbourMask, type Grid } from './grid';
import { findRegions, roomsByRegion } from './rooms';

/** Storey height: each floor's front wall is this many rows tall. */
export const STOREY_ROWS = 4;
/** Rows of a room taken by its back wall's face. */
export const BACK_WALL_ROWS = 4;

/**
 * The rows of a floor's front (0 at its top) and of a back wall's face (1 below the wall) each window size fills, and
 * how many front columns it is wide; a two-column piece has `_l` and `_r` halves.
 */
const FRONT_WINDOW: Record<WindowSize, { rows: string[]; columns: 1 | 2 }> = {
  small: { rows: ['', 'window_small'], columns: 1 },
  medium: { rows: ['', 'window_medium_top', 'window_medium_bottom'], columns: 2 },
  large: { rows: ['window_large_top', 'window_large_middle', 'window_large_bottom'], columns: 2 },
};
const DOOR_PIECES = ['door_lintel', 'door_upper', 'door_middle', 'door_lower'];
const SIZE_RANK: Record<WindowSize, number> = { small: 0, medium: 1, large: 2 };
const halves = (columns: number[]) => (columns.length === 1 ? [''] : ['_l', '_r']);
type Window = Extract<BuildingOpening, { kind: 'window' }>;
const BACK_WINDOW: Record<WindowSize, string[]> = {
  small: ['', 'wall_window_small'],
  medium: ['', 'wall_window_medium_top', 'wall_window_medium_bottom'],
  large: [
    'wall_window_large_1',
    'wall_window_large_2',
    'wall_window_large_3',
    'wall_window_large_4',
  ],
};

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

/**
 * The front columns a door or window shown at front column `column` covers: itself, or for two columns the next one
 * too, or the one before where the next would be the corner.
 */
export function openingColumns(building: Building, column: number, width: 1 | 2): number[] {
  if (width === 1) return [column];
  const columns = frontWidth(building);
  const left = column + 1 >= columns - 1 && column - 1 >= 1 ? column - 1 : column;
  return [left, left + 1];
}

/**
 * A floor's south windows on the front: the door's columns are taken first (on the ground floor), then the largest
 * windows; a window that would overlap one already shown is hidden, which validation reports.
 */
export function frontWindows(
  building: Building,
  floor: number,
): { shown: { window: Window; span: number[] }[]; hidden: Window[] } {
  const taken = new Set(floor === 0 ? doorColumns(building) : []);
  const shown: { window: Window; span: number[] }[] = [];
  const hidden: Window[] = [];
  const windows = building.floors[floor].openings
    .filter((o): o is Window => o.kind === 'window' && o.y === building.depth - 1)
    .sort((a, b) => SIZE_RANK[b.size] - SIZE_RANK[a.size]);
  for (const window of windows) {
    const span = openingColumns(
      building,
      frontColumn(building, window.x),
      FRONT_WINDOW[window.size].columns,
    );
    if (span.some((column) => taken.has(column))) hidden.push(window);
    else {
      span.forEach((column) => taken.add(column));
      shown.push({ window, span });
    }
  }
  return { shown, hidden };
}

/** The front columns of the entrance, two wide; none without an entrance. */
export const doorColumns = (building: Building) => {
  const entrance = entranceOf(building);
  return entrance ? openingColumns(building, frontColumn(building, entrance.x), 2) : [];
};

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

  const door = doorColumns(building);
  const floors = building.floors.length;
  building.floors.forEach((_, index) => {
    const top = roofRows + (floors - 1 - index) * STOREY_ROWS;
    const rows = [
      index === floors - 1 ? 'wall_top' : 'wall_band',
      'wall_mid',
      'wall_mid',
      index === 0 ? 'wall_base' : 'wall_mid',
    ];
    for (let column = 0; column < columns; column++)
      rows.forEach((kind, i) => place(`${kind}_${side(column, columns)}`, column, top + i));
    // Doors and windows are drawn over the wall, so its shadows and mouldings run on around them.
    if (index === 0)
      DOOR_PIECES.forEach((piece, i) =>
        door.forEach((column, h) => place(`${piece}${halves(door)[h]}`, column, top + i, true)),
      );
    for (const { window, span } of frontWindows(building, index).shown)
      FRONT_WINDOW[window.size].rows.forEach((piece, i) => {
        if (piece)
          span.forEach((column, h) => place(`${piece}${halves(span)[h]}`, column, top + i, true));
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
      // The back wall's face: the first rows below a wall, as many as the wall is tall.
      const face = [1, 2, 3, 4].find((n) => isWall(grid, x, y - n));
      if (face) {
        const wallY = y - face;
        if (isHorizontalDoor(x, wallY)) place(`door_face_${face}`, x, y);
        else {
          place(`wall_face_${face}_${faceSide}`, x, y);
          blocked[y][x] = true;
          const window = opening(x, wallY);
          if (window?.kind === 'window' && wallY === 0) {
            const piece = BACK_WINDOW[window.size][face - 1];
            if (piece) placements.push({ piece, column: x, row: y, overlay: true });
          }
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
