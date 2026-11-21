import { describe, expect, it } from 'vitest';
import type { Building } from '../../types/building';
import { validateBuildingPlan } from './validate';
import { farmhouse, twoStoreyFarmhouse } from './farmhouse.fixture';
import type { ResolvedKit } from './resolveKit';

const check = (change: (building: Building) => void) => {
  const building = farmhouse();
  change(building);
  return validateBuildingPlan(building);
};

describe('building plan validation', () => {
  it('accepts the example farmhouse', () => {
    expect(validateBuildingPlan(farmhouse())).toEqual([]);
  });

  it('needs a minimum size and inner walls inside the building', () => {
    expect(check((b) => (b.depth = 4))).toEqual(['The building must be at least 5 tiles deep.']);
    expect(check((b) => (b.floors[0].innerWalls[0].length = 7))).toContain(
      'The inner wall at (4, 1) reaches beyond the inside of the building.',
    );
  });

  it('needs rectangular floor areas, each with exactly one room that is deep enough', () => {
    expect(
      check((b) => b.floors[0].innerWalls.push({ x: 1, y: 4, direction: 'east', length: 2 })),
    ).toEqual(['The floor area at (1, 1) is not a rectangle.']);
    expect(check((b) => b.floors[0].rooms.pop())).toEqual([
      'The floor area at (5, 1) has no room.',
    ]);
    expect(check((b) => b.floors[0].rooms.push({ ...b.floors[0].rooms[1], id: 'study' }))).toEqual([
      'Rooms bedroom and study share one floor area.',
    ]);
    expect(check((b) => (b.floors[0].rooms[0].at = { x: 0, y: 0 }))).toEqual([
      'Room kitchen is not on a floor cell.',
      'The floor area at (1, 1) has no room.',
    ]);
    expect(
      check((b) => {
        b.floors[0].innerWalls.push({ x: 5, y: 3, direction: 'east', length: 3 });
        b.floors[0].rooms.push({
          id: 'pantry',
          at: { x: 5, y: 1 },
          name: 'Pantry',
          floor: 'floor_tiles',
        });
        b.floors[0].rooms[1].at = { x: 6, y: 4 };
      }),
    ).toEqual([
      'Room pantry is 2 rows deep; rooms need at least 6 (four for the back wall, two to walk on).',
      'Room bedroom is 3 rows deep; rooms need at least 6 (four for the back wall, two to walk on).',
    ]);
  });

  it('places openings in walls: one entrance in the south wall, windows only there, inner doors between rooms', () => {
    expect(
      check((b) => b.floors[0].openings.push({ id: 'hole', kind: 'door', x: 2, y: 3 })),
    ).toEqual(['Door hole is not in a wall.']);
    expect(
      check((b) =>
        b.floors[0].openings.push({ id: 'corner', kind: 'window', size: 'medium', x: 0, y: 7 }),
      ),
    ).toEqual(['Window corner is on a corner.']);
    expect(
      check((b) =>
        b.floors[0].openings.push({ id: 'side', kind: 'window', size: 'medium', x: 0, y: 3 }),
      ),
    ).toEqual(['Window side is not in the south or north wall; windows go there.']);
    expect(
      check((b) =>
        b.floors[0].openings.push({ id: 'back', kind: 'window', size: 'large', x: 2, y: 0 }),
      ),
    ).toEqual([]);
    expect(
      check((b) => b.floors[0].openings.push({ id: 'back', kind: 'door', x: 2, y: 0 })),
    ).toEqual([
      'Door back is in an outer wall other than the south wall; only the entrance leads outside.',
    ]);
    expect(check((b) => (b.floors[0].openings[3].y = 1))).toEqual([]);
    expect(
      check((b) => b.floors[0].openings.push({ id: 'second', kind: 'door', x: 3, y: 7 })),
    ).toEqual(['Only one door may be in the south wall; doors entrance and second are.']);
    expect(check((b) => b.floors[0].openings.shift())).toEqual([
      'The building needs an entrance: a door in the south wall.',
    ]);
    expect(
      check((b) => b.floors[0].openings.push({ ...b.floors[0].openings[1], id: 'window-3' })),
    ).toEqual([
      'Openings window-1 and window-3 are on the same cell.',
      'Window window-3 would overlap the entrance or another window on the front; doors and medium and ' +
        'large windows are two front columns wide. Move it along.',
    ]);
  });

  it('checks a door that leads nowhere, the chimney, unique IDs and the kit', () => {
    // A door in a wall stub has the same room on every side.
    const lonely = check((b) => {
      b.floors[0].innerWalls.push({ x: 1, y: 4, direction: 'east', length: 1 });
      b.floors[0].openings.push({ id: 'stuck', kind: 'door', x: 1, y: 4 });
    });
    expect(lonely).toContain('Door stuck does not lead from one room to another.');
    expect(check((b) => (b.chimney = { column: 8 }))).toEqual([
      'The chimney must stand on a column between the outer walls.',
    ]);
    expect(check((b) => (b.floors[0].openings[1].id = 'entrance'))).toEqual([
      'The opening ID entrance is used more than once.',
    ]);
    expect(check((b) => (b.kit = ''))).toEqual(['Choose a kit.']);

    const kit = { empty: ['window'], floors: ['floor_boards'] } as unknown as ResolvedKit;
    expect(validateBuildingPlan(farmhouse(), kit)).toEqual([
      'The kit has nothing drawn for: window.',
      'Room kitchen uses the floor floor_tiles, which the kit does not have.',
    ]);
  });

  it('needs stairs between floors, on floor cells, and an entrance only on the ground floor', () => {
    expect(validateBuildingPlan(twoStoreyFarmhouse())).toEqual([]);
    const check2 = (change: (building: Building) => void) => {
      const building = twoStoreyFarmhouse();
      change(building);
      return validateBuildingPlan(building);
    };
    expect(check2((b) => delete b.floors[0].stairsUp)).toEqual([
      'Ground floor needs stairs up to floor 2.',
    ]);
    expect(check2((b) => (b.floors[1].stairsUp = { x: 3, y: 3 }))).toEqual([
      'Floor 2 is the top floor; its stairs lead nowhere.',
    ]);
    expect(check2((b) => (b.floors[0].stairsUp = { x: 4, y: 3 }))).toEqual([
      'Ground floor: the stairs up are not on a floor cell.',
    ]);
    expect(
      check2((b) => b.floors[1].innerWalls.push({ x: 1, y: 6, direction: 'east', length: 3 })),
    ).toContain('Floor 2: the stairs down at (2, 6) are not on a floor cell.');
    expect(
      check2((b) => b.floors[1].openings.push({ id: 'door-1', kind: 'door', x: 3, y: 7 })),
    ).toEqual([
      'Floor 2: Door door-1 is in an outer wall; only the ground floor has a door to the outside.',
    ]);
  });

  it('fits the roof to the front: an odd front for a front gable, wings beside a cross gable', () => {
    expect(check((b) => (b.roof.kind = 'front-gable'))).toEqual([]);
    expect(
      check((b) => {
        b.roof.kind = 'front-gable';
        b.width = 11;
        b.scale = 2;
      }),
    ).toContain('A front gable needs an odd number of front columns; the front is 6 wide.');
    // The bedroom behind the entrance reaches the east wall: no wing on that side.
    expect(check((b) => (b.roof.kind = 'cross-gable'))).toEqual([
      'A cross gable needs at least 2 front columns of wing on each side of the room behind the entrance; ' +
        'make that room narrower or use a front gable.',
    ]);
  });
});
