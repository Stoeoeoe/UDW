import { describe, expect, it } from 'vitest';
import type { Building } from '../../types/building';
import { farmhouse } from './farmhouse.fixture';
import { buildGrid, wallNeighbourMask } from './grid';
import { findRegions, isRectangle, roomsByRegion } from './rooms';
import { layoutExterior, layoutInterior, type Placement } from './layout';

/** The non-overlay pieces as rows of names, for comparing with the tables of the rules. */
const asRows = (placements: Placement[], width: number) => {
  const rows: string[][] = [];
  for (const p of placements.filter((p) => !p.overlay)) {
    rows[p.row] ??= Array.from({ length: width }, () => '');
    rows[p.row][p.column] = p.piece;
  }
  return rows;
};

const repeat = (piece: string, width: number) =>
  Array.from(
    { length: width },
    (_, i) => `${piece}_${i === 0 ? 'l' : i === width - 1 ? 'r' : 'm'}`,
  );

describe('grid and rooms', () => {
  it('makes the border and inner walls wall, and finds one rectangular area per room', () => {
    const building = farmhouse();
    const grid = buildGrid(building);
    expect(grid.wall[3].map(Number).join('')).toBe('100010001');
    expect(grid.wall[0].every(Boolean) && grid.wall[6].every(Boolean)).toBe(true);
    expect(wallNeighbourMask(grid, 0, 0)).toBe(6);
    expect(wallNeighbourMask(grid, 4, 0)).toBe(14);
    const regions = findRegions(grid);
    expect(regions.regions.map((r) => [r.left, r.top, r.right, r.bottom])).toEqual([
      [1, 1, 3, 5],
      [5, 1, 7, 5],
    ]);
    expect(regions.regions.every(isRectangle)).toBe(true);
    expect(roomsByRegion(building, regions).roomsIn.map((rooms) => rooms.map((r) => r.id))).toEqual(
      [['kitchen'], ['bedroom']],
    );
  });
});

describe('exterior', () => {
  it('stacks ridge, slopes, eave and the three wall rows, with the door, windows and chimney', () => {
    const placements = layoutExterior(farmhouse());
    const rows = asRows(placements, 9);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toEqual(repeat('roof_ridge', 9));
    for (const row of [1, 2, 3, 4, 5]) expect(rows[row]).toEqual(repeat('roof_slope', 9));
    expect(rows[6]).toEqual(repeat('roof_eave', 9));
    const wall = (kind: string, replaced: Record<number, string>) =>
      repeat(kind, 9).map((piece, column) => replaced[column] ?? piece);
    expect(rows[7]).toEqual(wall('wall_top', { 6: 'door_lintel' }));
    expect(rows[8]).toEqual(wall('wall_mid', { 2: 'window', 6: 'door_upper', 7: 'window' }));
    expect(rows[9]).toEqual(wall('wall_base', { 6: 'door_lower' }));
    expect(placements.filter((p) => p.overlay)).toEqual([
      { piece: 'chimney_top', column: 2, row: 0, overlay: true },
      { piece: 'chimney_bottom', column: 2, row: 1, overlay: true },
    ]);
  });
});

describe('interior', () => {
  it('shows wall tops, back-wall faces, doors, windows and each room floor on the same grid', () => {
    const layout = layoutInterior(farmhouse());
    const rows = asRows(layout.placements, 9);
    const cap = (mask: number) => `wall_cap_${String(mask).padStart(2, '0')}`;
    expect(rows[0]).toEqual([
      cap(6),
      cap(10),
      cap(10),
      cap(10),
      cap(14),
      cap(10),
      cap(10),
      cap(10),
      cap(12),
    ]);
    expect(rows[1]).toEqual([
      cap(5),
      'wall_face_upper_l',
      'wall_face_upper_m',
      'wall_face_upper_r',
      cap(5),
      'wall_face_upper_l',
      'wall_face_upper_m',
      'wall_face_upper_r',
      cap(5),
    ]);
    expect(rows[2]).toEqual([
      cap(5),
      'wall_face_lower_l',
      'wall_face_lower_m',
      'wall_face_lower_r',
      cap(5),
      'wall_face_lower_l',
      'wall_face_lower_m',
      'wall_face_lower_r',
      cap(5),
    ]);
    for (const row of [3, 5])
      expect(rows[row]).toEqual([
        cap(5),
        'floor_tiles',
        'floor_tiles',
        'floor_tiles',
        cap(5),
        'floor_boards',
        'floor_boards',
        'floor_boards',
        cap(5),
      ]);
    expect(rows[4][4]).toBe('threshold');
    expect(rows[6]).toEqual([
      cap(3),
      cap(10),
      'window_cap',
      cap(10),
      cap(11),
      cap(10),
      'entrance_mat',
      'window_cap',
      cap(9),
    ]);
    expect(layout.entrance).toEqual({ x: 6, y: 6 });
  });

  it('blocks walls, windows and back-wall faces, but not doors', () => {
    const { blocked } = layoutInterior(farmhouse());
    expect(blocked.map((row) => row.map(Number).join(''))).toEqual([
      '111111111',
      '111111111',
      '111111111',
      '100010001',
      '100000001',
      '100010001',
      '111111011',
    ]);
  });

  it('cuts a door in a horizontal wall through the face of the room below', () => {
    const building: Building = {
      ...farmhouse(),
      depth: 9,
      innerWalls: [{ x: 1, y: 4, direction: 'east', length: 7 }],
      rooms: [
        { id: 'upstairs', at: { x: 1, y: 1 }, name: 'Back', floor: 'floor_boards' },
        { id: 'front', at: { x: 1, y: 5 }, name: 'Front', floor: 'floor_tiles' },
      ],
      openings: [
        { id: 'entrance', kind: 'door', x: 2, y: 8 },
        { id: 'through', kind: 'door', x: 4, y: 4 },
      ],
    };
    const layout = layoutInterior(building);
    const at = (x: number, y: number) =>
      layout.placements.find((p) => p.column === x && p.row === y)?.piece;
    expect([at(4, 4), at(4, 5), at(4, 6), at(3, 5)]).toEqual([
      'threshold',
      'door_face_upper',
      'door_face_lower',
      'wall_face_upper_m',
    ]);
    expect([layout.blocked[5][4], layout.blocked[6][4], layout.blocked[5][3]]).toEqual([
      false,
      false,
      true,
    ]);
  });
});
