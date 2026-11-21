import { describe, expect, it } from 'vitest';
import type { Building } from '../../types/building';
import { farmhouse as farmhouseBuilding, twoStoreyFarmhouse } from './farmhouse.fixture';
import { floorPlan, type FloorPlan } from './plan';
import { buildGrid, wallNeighbourMask } from './grid';
import { findRegions, isRectangle, roomsByRegion } from './rooms';
import {
  exteriorShape,
  layoutExterior,
  layoutFloor,
  layoutInterior,
  type Placement,
} from './layout';

const farmhouse = () => floorPlan(farmhouseBuilding(), 0);

/** The pieces as rows of names, the last drawn on top, without the chimney and stairs standing on them. */
const asRows = (placements: Placement[], width: number) => {
  const rows: string[][] = [];
  for (const p of placements.filter((p) => !/^(chimney|stairs)/.test(p.piece))) {
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
    expect(grid.wall[0].every(Boolean) && grid.wall[7].every(Boolean)).toBe(true);
    expect(wallNeighbourMask(grid, 0, 0)).toBe(6);
    expect(wallNeighbourMask(grid, 4, 0)).toBe(14);
    const regions = findRegions(grid);
    expect(regions.regions.map((r) => [r.left, r.top, r.right, r.bottom])).toEqual([
      [1, 1, 3, 6],
      [5, 1, 7, 6],
    ]);
    expect(regions.regions.every(isRectangle)).toBe(true);
    expect(roomsByRegion(building, regions).roomsIn.map((rooms) => rooms.map((r) => r.id))).toEqual(
      [['kitchen'], ['bedroom']],
    );
  });
});

describe('exterior', () => {
  const wall = (kind: string, width: number, replaced: Record<number, string>) =>
    repeat(kind, width).map((piece, column) => replaced[column] ?? piece);

  it('squashes a side gable roof to half the depth above one floor of wall', () => {
    const placements = layoutExterior(farmhouseBuilding());
    const rows = asRows(placements, 9);
    expect(exteriorShape(farmhouseBuilding())).toEqual({
      columns: 9,
      rows: 8,
      roofRows: 4,
      footprintRows: 4,
    });
    expect(rows.slice(0, 4)).toEqual([
      repeat('roof_ridge', 9),
      repeat('roof_slope', 9),
      repeat('roof_slope', 9),
      repeat('roof_eave', 9),
    ]);
    // Four rows of wall; the medium windows fill the middle two, the door all four.
    expect(rows[4]).toEqual(wall('wall_top', 9, { 6: 'door_lintel' }));
    expect(rows[5]).toEqual(
      wall('wall_mid', 9, { 2: 'window_medium_top', 6: 'door_upper', 7: 'window_medium_top' }),
    );
    expect(rows[6]).toEqual(
      wall('wall_mid', 9, {
        2: 'window_medium_bottom',
        6: 'door_middle',
        7: 'window_medium_bottom',
      }),
    );
    expect(rows[7]).toEqual(wall('wall_base', 9, { 6: 'door_lower' }));
    expect(placements.filter((p) => p.piece.startsWith('chimney'))).toEqual([
      { piece: 'chimney_top', column: 2, row: 0, overlay: true },
      { piece: 'chimney_bottom', column: 2, row: 1, overlay: true },
    ]);
    // The door is drawn over the wall, so the wall's shadow under the eave runs on behind it.
    expect(placements.filter((p) => p.column === 6 && p.row === 4).map((p) => p.piece)).toEqual([
      'wall_top_m',
      'door_lintel',
    ]);
  });

  it('stacks the floors, top floor first, each with its own windows', () => {
    const rows = asRows(layoutExterior(twoStoreyFarmhouse()), 9);
    expect(rows).toHaveLength(12);
    expect(rows[4]).toEqual(repeat('wall_top', 9));
    expect(rows[5]).toEqual(wall('wall_mid', 9, { 4: 'window_small' }));
    expect(rows[6]).toEqual(repeat('wall_mid', 9));
    expect(rows[7]).toEqual(repeat('wall_mid', 9));
    expect(rows[8]).toEqual(wall('wall_band', 9, { 6: 'door_lintel' }));
    expect(rows[9]).toEqual(
      wall('wall_mid', 9, { 2: 'window_medium_top', 6: 'door_upper', 7: 'window_medium_top' }),
    );
  });

  it('shows two plan columns in one front column at scale 2', () => {
    const building: Building = { ...farmhouseBuilding(), scale: 2 };
    const rows = asRows(layoutExterior(building), 5);
    expect(rows[0]).toEqual(repeat('roof_ridge', 5));
    // Windows at plan columns 2 and 7 and the door at 6 land in front columns 1, 3 and 3: the door wins.
    expect(rows[5]).toEqual(wall('wall_mid', 5, { 1: 'window_medium_top', 3: 'door_upper' }));
  });

  it('shows each window size over its rows, the larger of two in one column', () => {
    const building = farmhouseBuilding();
    const [ground] = building.floors;
    building.floors = [
      {
        ...ground,
        openings: [
          ground.openings[0],
          { id: 'slit', kind: 'window', size: 'small', x: 1, y: 7 },
          { id: 'big', kind: 'window', size: 'large', x: 3, y: 7 },
          { id: 'a', kind: 'window', size: 'small', x: 7, y: 7 },
          { id: 'b', kind: 'window', size: 'large', x: 7, y: 7 },
        ],
      },
    ];
    const rows = asRows(layoutExterior({ ...building, scale: 1 }), 9);
    const column = (x: number) => rows.slice(4, 8).map((row) => row[x]);
    expect(column(1)).toEqual(['wall_top_m', 'window_small', 'wall_mid_m', 'wall_base_m']);
    expect(column(3)).toEqual([
      'window_large_top',
      'window_large_middle',
      'window_large_bottom',
      'wall_base_m',
    ]);
    expect(column(7)).toEqual(column(3));
  });

  it('draws a front gable as a triangle with the slopes going back beside it', () => {
    const building: Building = { ...farmhouseBuilding(), roof: { kind: 'front-gable' } };
    const rows = asRows(layoutExterior(building), 9);
    expect(exteriorShape(building).roofRows).toBe(9);
    const column = (x: number) => rows.slice(0, 9).map((row) => row[x]);
    expect(column(4)).toEqual([
      'gable_peak',
      ...Array(3).fill('gable_ridge'),
      'gable_apex',
      ...Array(4).fill('gable_wall'),
    ]);
    expect(column(2)).toEqual([
      '',
      '',
      'gable_back_l',
      ...Array(3).fill('gable_roof_l'),
      'gable_edge_l',
      'gable_wall',
      'gable_wall',
    ]);
    expect(column(8)).toEqual([
      ...Array(4).fill(''),
      'gable_back_r',
      ...Array(3).fill('gable_roof_r'),
      'gable_edge_r',
    ]);
    expect(rows[9]).toEqual(wall('wall_top', 9, { 6: 'door_lintel' }));
  });

  it('puts a cross gable over the room behind the entrance, with side gable wings', () => {
    const building: Building = {
      ...farmhouseBuilding(),
      width: 13,
      roof: { kind: 'cross-gable' },
      chimney: { column: 1 },
      floors: [
        {
          innerWalls: [
            { x: 4, y: 1, direction: 'south', length: 6 },
            { x: 8, y: 1, direction: 'south', length: 6 },
          ],
          rooms: [
            { id: 'west', at: { x: 1, y: 1 }, name: 'West', floor: 'floor_boards' },
            { id: 'hall', at: { x: 5, y: 1 }, name: 'Hall', floor: 'floor_boards' },
            { id: 'east', at: { x: 9, y: 1 }, name: 'East', floor: 'floor_boards' },
          ],
          openings: [{ id: 'entrance', kind: 'door', x: 6, y: 7 }],
        },
      ],
    };
    const placements = layoutExterior(building);
    const rows = asRows(placements, 13);
    expect(exteriorShape(building).roofRows).toBe(7);
    expect(rows.slice(0, 7).map((row) => row[0])).toEqual([
      '',
      '',
      '',
      'roof_ridge_l',
      'roof_slope_l',
      'roof_slope_l',
      'roof_eave_l',
    ]);
    expect(rows.slice(0, 7).map((row) => row[6])).toEqual([
      'gable_peak',
      ...Array(3).fill('gable_ridge'),
      'gable_apex',
      'gable_wall',
      'gable_wall',
    ]);
    expect(rows[6].slice(3, 10)).toEqual([
      'roof_eave_m',
      'gable_edge_l',
      'gable_wall',
      'gable_wall',
      'gable_wall',
      'gable_edge_r',
      'roof_eave_m',
    ]);
    // The chimney stands on the wing's ridge.
    expect(
      placements
        .filter((p) => p.piece.startsWith('chimney'))
        .map((p) => [p.piece, p.column, p.row]),
    ).toEqual([
      ['chimney_top', 1, 3],
      ['chimney_bottom', 1, 4],
    ]);
  });
});

describe('interior', () => {
  const cap = (mask: number) => `wall_cap_${String(mask).padStart(2, '0')}`;

  it('shows wall tops, four rows of back-wall face, doors, windows and each room floor on the same grid', () => {
    const layout = layoutInterior(farmhouse());
    const rows = asRows(layout.placements, 9);
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
    for (const n of [1, 2, 3, 4])
      expect(rows[n]).toEqual([
        cap(5),
        `wall_face_${n}_l`,
        `wall_face_${n}_m`,
        `wall_face_${n}_r`,
        cap(5),
        `wall_face_${n}_l`,
        `wall_face_${n}_m`,
        `wall_face_${n}_r`,
        cap(5),
      ]);
    expect(rows[6]).toEqual([
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
    expect(rows[5][4]).toBe('threshold');
    expect(rows[7]).toEqual([
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
    expect(layout.entrance).toEqual({ x: 6, y: 7 });
  });

  it('blocks walls, windows and back-wall faces, but not doors', () => {
    const { blocked } = layoutInterior(farmhouse());
    expect(blocked.map((row) => row.map(Number).join(''))).toEqual([
      '111111111',
      '111111111',
      '111111111',
      '111111111',
      '111111111',
      '100000001',
      '100010001',
      '111111011',
    ]);
  });

  it('shows a window in the north wall on the back wall below it, over the rows of its size', () => {
    const building = farmhouse();
    building.openings = [
      ...building.openings,
      { id: 'north-1', kind: 'window', size: 'large', x: 2, y: 0 },
      { id: 'north-2', kind: 'window', size: 'medium', x: 6, y: 0 },
    ];
    const windows = layoutInterior(building)
      .placements.filter((p) => p.piece.startsWith('wall_window'))
      .map((p) => [p.piece, p.column, p.row]);
    expect(windows).toEqual([
      ['wall_window_large_1', 2, 1],
      ['wall_window_large_2', 2, 2],
      ['wall_window_medium_top', 6, 2],
      ['wall_window_large_3', 2, 3],
      ['wall_window_medium_bottom', 6, 3],
      ['wall_window_large_4', 2, 4],
    ]);
  });

  it('shows the stairs up on a floor and the stairs down on the floor above', () => {
    const at = (layout: ReturnType<typeof layoutFloor>, x: number, y: number) =>
      layout.placements.filter((p) => p.column === x && p.row === y).map((p) => p.piece);
    expect(at(layoutFloor(twoStoreyFarmhouse(), 0), 2, 6)).toEqual(['floor_tiles', 'stairs_up']);
    expect(at(layoutFloor(twoStoreyFarmhouse(), 1), 2, 6)).toEqual(['floor_boards', 'stairs_down']);
  });

  it('cuts a door in a horizontal wall through the face of the room below', () => {
    const building: FloorPlan = {
      ...farmhouse(),
      depth: 14,
      innerWalls: [{ x: 1, y: 6, direction: 'east', length: 7 }],
      rooms: [
        { id: 'upstairs', at: { x: 1, y: 1 }, name: 'Back', floor: 'floor_boards' },
        { id: 'front', at: { x: 1, y: 7 }, name: 'Front', floor: 'floor_tiles' },
      ],
      openings: [
        { id: 'entrance', kind: 'door', x: 2, y: 13 },
        { id: 'through', kind: 'door', x: 4, y: 6 },
      ],
    };
    const layout = layoutInterior(building);
    const at = (x: number, y: number) =>
      layout.placements.find((p) => p.column === x && p.row === y)?.piece;
    expect([6, 7, 8, 9, 10].map((y) => at(4, y))).toEqual([
      'threshold',
      'door_face_1',
      'door_face_2',
      'door_face_3',
      'door_face_4',
    ]);
    expect(at(3, 7)).toBe('wall_face_1_m');
    expect([7, 8, 9, 10].map((y) => layout.blocked[y][4])).toEqual([false, false, false, false]);
    expect(layout.blocked[7][3]).toBe(true);
  });
});
