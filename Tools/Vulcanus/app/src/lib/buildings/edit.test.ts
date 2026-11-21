import { describe, expect, it } from 'vitest';
import {
  addOpening,
  addWall,
  eraseWall,
  openingRefusal,
  reconcile,
  resize,
  wallLine,
} from './edit';
import { farmhouse as farmhouseBuilding, twoStoreyFarmhouse } from './farmhouse.fixture';
import { floorPlan } from './plan';

const farmhouse = () => floorPlan(farmhouseBuilding(), 0);
import { validateBuildingPlan } from './validate';

describe('editing a building', () => {
  it('draws a wall along the axis the drag moved most, inside the outer walls only', () => {
    const building = farmhouse();
    expect(wallLine(building, { x: 0, y: 3 }, { x: 3, y: 4 })).toEqual([
      { x: 1, y: 3 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
    ]);
    expect(wallLine(building, { x: 6, y: 5 }, { x: 7, y: 0 })).toHaveLength(5);
  });

  it('gives a new floor area its own room and keeps the first room where areas merge', () => {
    const split = addWall(
      farmhouse(),
      wallLine(farmhouse(), { x: 5, y: 3 }, { x: 7, y: 3 }),
      'floor_boards',
    );
    expect(split.innerWalls.at(-1)).toEqual({ x: 5, y: 3, direction: 'east', length: 3 });
    expect(split.rooms.map((room) => [room.id, room.at])).toEqual([
      ['kitchen', { x: 2, y: 3 }],
      ['bedroom', { x: 6, y: 2 }],
      ['room-1', { x: 5, y: 4 }],
    ]);

    const merged = eraseWall(
      farmhouse(),
      [
        { x: 4, y: 2 },
        { x: 4, y: 3 },
      ],
      'floor_boards',
    );
    expect(merged.innerWalls).toEqual([
      { x: 4, y: 1, direction: 'south', length: 1 },
      { x: 4, y: 4, direction: 'south', length: 3 },
    ]);
    expect(merged.rooms.map((room) => room.id)).toEqual(['kitchen']);
  });

  it('removes openings whose wall is erased', () => {
    const building = eraseWall(farmhouse(), [{ x: 4, y: 5 }], 'floor_boards');
    expect(building.openings.map((opening) => opening.id)).toEqual([
      'entrance',
      'window-1',
      'window-2',
    ]);
  });

  it('refuses openings where the rules do not allow them, saying why', () => {
    const building = farmhouse();
    expect(openingRefusal(building, 'door', 2, 3, true)).toBe('Doors go in a wall.');
    expect(openingRefusal(building, 'window', 8, 7, true)).toBe('Not on a corner.');
    expect(openingRefusal(building, 'window', 6, 7, true)).toBe(
      'There is already an opening here.',
    );
    expect(openingRefusal(building, 'window', 0, 3, true)).toBe(
      'Windows go in the south wall (seen outside) or the north wall (seen inside).',
    );
    expect(openingRefusal(building, 'door', 2, 0, true)).toBe(
      'Only the south wall has a door to the outside.',
    );
    expect(openingRefusal(building, 'door', 4, 2, true)).toBeNull();
    expect(openingRefusal(building, 'window', 3, 7, true)).toBeNull();
    expect(openingRefusal(building, 'window', 3, 0, true)).toBeNull();
    expect(openingRefusal(building, 'door', 3, 7, false)).toBe(
      'Only the ground floor has a door to the outside.',
    );
  });

  it('names the first south door the entrance and numbers the rest', () => {
    const withoutEntrance = { ...farmhouse(), openings: [] };
    const first = addOpening(withoutEntrance, 'door', 3, 7);
    expect(first.openings[0].id).toBe('entrance');
    expect(addOpening(first, 'window', 2, 7).openings[1]).toEqual({
      id: 'window-1',
      kind: 'window',
      size: 'medium',
      x: 2,
      y: 7,
    });
  });

  it('resizes every floor, moving south-wall openings along and listing what no longer fits', () => {
    const { building, removed } = resize(farmhouseBuilding(), 6, 9, 'floor_boards');
    const ground = building.floors[0];
    expect(ground.openings.map((o) => [o.id, o.x, o.y])).toEqual([
      ['window-1', 2, 8],
      ['inner-door', 4, 5],
    ]);
    expect(removed).toEqual(['door entrance', 'window window-2', 'room bedroom']);
    expect(ground.innerWalls).toEqual([{ x: 4, y: 1, direction: 'south', length: 6 }]);
    // The inner wall now stands against the east wall: only the kitchen's area is left.
    expect(ground.rooms.map((room) => room.id)).toEqual(['kitchen']);

    expect(resize(twoStoreyFarmhouse(), 4, 8, 'floor_boards').removed).toEqual([
      'part of the inner wall at (4, 1) on the ground floor',
      'door entrance on the ground floor',
      'window window-2 on the ground floor',
      'door inner-door on the ground floor',
      'room bedroom on the ground floor',
      'window window-1 on floor 2',
    ]);
  });

  it('leaves a valid building as it is', () => {
    expect(reconcile(farmhouse(), 'floor_boards')).toEqual(farmhouse());
    expect(validateBuildingPlan(farmhouseBuilding())).toEqual([]);
  });
});
