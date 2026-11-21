import type { Building } from '../../types/building';

/** A new building: a 9 × 7 shell with one room and an entrance in the middle of the south wall. */
export function newBuilding(id: string, name: string, folderPath: string, kit = ''): Building {
  const width = 9;
  const depth = 7;
  return {
    formatVersion: 1,
    id,
    name,
    kit,
    width,
    depth,
    scale: 1,
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
