import type { Building } from '../../types/building';

/**
 * A new building: a 16 × 12 shell with one room and an entrance in the middle of the south wall, twice as wide inside
 * as its 8-column front.
 */
export function newBuilding(id: string, name: string, folderPath: string, kit = ''): Building {
  const width = 16;
  const depth = 12;
  return {
    formatVersion: 1,
    id,
    name,
    kit,
    width,
    depth,
    scale: 2,
    floors: [
      {
        innerWalls: [],
        rooms: [{ id: 'room-1', at: { x: 1, y: 1 }, name: 'Room', floor: 'floor_boards' }],
        openings: [{ id: 'entrance', kind: 'door', x: Math.floor(width / 2), y: depth - 1 }],
      },
    ],
    roof: { kind: 'side-gable' },
    folderPath,
  };
}
