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
import { farmhouse } from './farmhouse.fixture';
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
      { x: 4, y: 4, direction: 'south', length: 2 },
    ]);
    expect(merged.rooms.map((room) => room.id)).toEqual(['kitchen']);
  });

  it('removes openings whose wall is erased', () => {
    const building = eraseWall(farmhouse(), [{ x: 4, y: 4 }], 'floor_boards');
    expect(building.openings.map((opening) => opening.id)).toEqual([
      'entrance',
      'window-1',
      'window-2',
    ]);
  });

  it('refuses openings where the rules do not allow them, saying why', () => {
    const building = farmhouse();
    expect(openingRefusal(building, 'door', 2, 3)).toBe('Doors go in a wall.');
    expect(openingRefusal(building, 'window', 8, 6)).toBe('Not on a corner.');
    expect(openingRefusal(building, 'window', 6, 6)).toBe('There is already an opening here.');
    expect(openingRefusal(building, 'window', 0, 3)).toBe('Windows go in the south wall for now.');
    expect(openingRefusal(building, 'door', 2, 0)).toBe(
      'Only the south wall has a door to the outside.',
    );
    expect(openingRefusal(building, 'door', 4, 2)).toBeNull();
    expect(openingRefusal(building, 'window', 3, 6)).toBeNull();
  });

  it('names the first south door the entrance and numbers the rest', () => {
    const withoutEntrance = { ...farmhouse(), openings: [] };
    const first = addOpening(withoutEntrance, 'door', 3, 6);
    expect(first.openings[0].id).toBe('entrance');
    expect(addOpening(first, 'window', 2, 6).openings[1].id).toBe('window-1');
  });

  it('resizes, moving south-wall openings along and listing what no longer fits', () => {
    const { building, removed } = resize(farmhouse(), 6, 8, 'floor_boards');
    expect(building.openings.map((o) => [o.id, o.x, o.y])).toEqual([
      ['window-1', 2, 7],
      ['inner-door', 4, 4],
    ]);
    expect(removed).toEqual(['door entrance', 'window window-2', 'room bedroom']);
    expect(building.innerWalls).toEqual([{ x: 4, y: 1, direction: 'south', length: 5 }]);
    // The inner wall now stands against the east wall: only the kitchen's area is left.
    expect(building.rooms.map((room) => room.id)).toEqual(['kitchen']);
  });

  it('leaves a valid building as it is', () => {
    expect(reconcile(farmhouse(), 'floor_boards')).toEqual(farmhouse());
    expect(validateBuildingPlan(reconcile(farmhouse(), 'floor_boards'))).toEqual([]);
  });
});
