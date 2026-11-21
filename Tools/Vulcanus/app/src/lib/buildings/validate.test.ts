import { describe, expect, it } from 'vitest';
import type { Building } from '../../types/building';
import { validateBuildingPlan } from './validate';
import { farmhouse } from './farmhouse.fixture';
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
    expect(check((b) => (b.innerWalls[0].length = 6))).toContain(
      'The inner wall at (4, 1) reaches beyond the inside of the building.',
    );
  });

  it('needs rectangular floor areas, each with exactly one room that is deep enough', () => {
    expect(check((b) => b.innerWalls.push({ x: 1, y: 4, direction: 'east', length: 2 }))).toEqual([
      'The floor area at (1, 1) is not a rectangle.',
    ]);
    expect(check((b) => b.rooms.pop())).toEqual(['The floor area at (5, 1) has no room.']);
    expect(check((b) => b.rooms.push({ ...b.rooms[1], id: 'study' }))).toEqual([
      'Rooms bedroom and study share one floor area.',
    ]);
    expect(check((b) => (b.rooms[0].at = { x: 0, y: 0 }))).toEqual([
      'Room kitchen is not on a floor cell.',
      'The floor area at (1, 1) has no room.',
    ]);
    expect(
      check((b) => {
        b.innerWalls.push({ x: 5, y: 3, direction: 'east', length: 3 });
        b.rooms.push({ id: 'pantry', at: { x: 5, y: 1 }, name: 'Pantry', floor: 'floor_tiles' });
        b.rooms[1].at = { x: 6, y: 4 };
      }),
    ).toEqual([
      'Room pantry is 2 rows deep; rooms need at least 3 (two for the back wall, one to walk on).',
      'Room bedroom is 2 rows deep; rooms need at least 3 (two for the back wall, one to walk on).',
    ]);
  });

  it('places openings in walls: one entrance in the south wall, windows only there, inner doors between rooms', () => {
    expect(check((b) => b.openings.push({ id: 'hole', kind: 'door', x: 2, y: 3 }))).toEqual([
      'Door hole is not in a wall.',
    ]);
    expect(check((b) => b.openings.push({ id: 'corner', kind: 'window', x: 0, y: 6 }))).toEqual([
      'Window corner is on a corner.',
    ]);
    expect(check((b) => b.openings.push({ id: 'side', kind: 'window', x: 0, y: 3 }))).toEqual([
      'Window side is not in the south wall; windows go there for now.',
    ]);
    expect(check((b) => b.openings.push({ id: 'back', kind: 'door', x: 2, y: 0 }))).toEqual([
      'Door back is in an outer wall other than the south wall; only the entrance leads outside.',
    ]);
    expect(check((b) => (b.openings[3].y = 1))).toEqual([]);
    expect(check((b) => b.openings.push({ id: 'second', kind: 'door', x: 3, y: 6 }))).toEqual([
      'Only one door may be in the south wall; doors entrance and second are.',
    ]);
    expect(check((b) => b.openings.shift())).toEqual([
      'The building needs an entrance: a door in the south wall.',
    ]);
    expect(check((b) => b.openings.push({ ...b.openings[1], id: 'window-3' }))).toEqual([
      'Openings window-1 and window-3 are on the same cell.',
    ]);
  });

  it('checks a door that leads nowhere, the chimney, unique IDs and the kit', () => {
    // A door in a wall stub has the same room on every side.
    const lonely = check((b) => {
      b.innerWalls.push({ x: 1, y: 4, direction: 'east', length: 1 });
      b.openings.push({ id: 'stuck', kind: 'door', x: 1, y: 4 });
    });
    expect(lonely).toContain('Door stuck does not lead from one room to another.');
    expect(check((b) => (b.chimney = { column: 8 }))).toEqual([
      'The chimney must stand on a column between the outer walls.',
    ]);
    expect(check((b) => (b.openings[1].id = 'entrance'))).toEqual([
      'The opening ID entrance is used more than once.',
    ]);
    expect(check((b) => (b.kit = ''))).toEqual(['Choose a kit.']);

    const kit = { empty: ['window'], floors: ['floor_boards'] } as unknown as ResolvedKit;
    expect(validateBuildingPlan(farmhouse(), kit)).toEqual([
      'The kit has nothing drawn for: window.',
      'Room kitchen uses the floor floor_tiles, which the kit does not have.',
    ]);
  });
});
