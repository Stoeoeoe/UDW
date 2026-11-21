import type { Building } from '../../types/building';
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

/**
 * The exterior: `width` columns and `depth + 3` rows. The roof fills the first `depth` rows (ridge, slopes, eave) and
 * the front wall the last three; the bottom `depth` rows are the footprint.
 */
export function layoutExterior(building: Building): Placement[] {
  const { width, depth } = building;
  const south = depth - 1;
  const doors = new Set(
    building.openings.filter((o) => o.kind === 'door' && o.y === south).map((o) => o.x),
  );
  const windows = new Set(
    building.openings.filter((o) => o.kind === 'window' && o.y === south).map((o) => o.x),
  );
  const rows = [
    'roof_ridge',
    ...Array.from({ length: depth - 2 }, () => 'roof_slope'),
    'roof_eave',
    'wall_top',
    'wall_mid',
    'wall_base',
  ];
  const placements: Placement[] = [];
  rows.forEach((kind, row) => {
    for (let column = 0; column < width; column++) {
      const wallRow = row - depth;
      let piece = `${kind}_${side(column, width)}`;
      if (doors.has(column) && wallRow >= 0)
        piece = ['door_lintel', 'door_upper', 'door_lower'][wallRow];
      else if (windows.has(column) && wallRow === 1) piece = 'window';
      placements.push({ piece, column, row, overlay: false });
    }
  });
  if (building.chimney) {
    const column = building.chimney.column;
    placements.push({ piece: 'chimney_top', column, row: 0, overlay: true });
    placements.push({ piece: 'chimney_bottom', column, row: 1, overlay: true });
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

/** The interior on the footprint's grid, cell for cell. */
export function layoutInterior(
  building: Building,
  grid: Grid = buildGrid(building),
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
  return { placements, blocked, entrance };
}
