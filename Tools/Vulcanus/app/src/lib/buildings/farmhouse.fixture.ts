import type { Building } from '../../types/building';

/** The example farmhouse of docs/building-editor.md: a kitchen and a bedroom under a side gable roof. */
export const farmhouse = (): Building => ({
  formatVersion: 1,
  id: 'test:farmhouse',
  name: 'Farmhouse',
  kit: 'test:kit',
  width: 9,
  depth: 8,
  scale: 1,
  floors: [
    {
      innerWalls: [{ x: 4, y: 1, direction: 'south', length: 6 }],
      rooms: [
        { id: 'kitchen', at: { x: 2, y: 3 }, name: 'Kitchen', floor: 'floor_tiles' },
        { id: 'bedroom', at: { x: 6, y: 3 }, name: 'Bedroom', floor: 'floor_boards' },
      ],
      openings: [
        { id: 'entrance', kind: 'door', x: 6, y: 7 },
        { id: 'window-1', kind: 'window', size: 'medium', x: 2, y: 7 },
        { id: 'window-2', kind: 'window', size: 'medium', x: 7, y: 7 },
        { id: 'inner-door', kind: 'door', x: 4, y: 5 },
      ],
    },
  ],
  chimney: { column: 2 },
  roof: { kind: 'side-gable' },
});

/** The farmhouse with an upper floor: one room under the roof, reached by stairs from the kitchen. */
export const twoStoreyFarmhouse = (): Building => {
  const ground = farmhouse();
  return {
    ...ground,
    floors: [
      { ...ground.floors[0], stairsUp: { x: 2, y: 6 } },
      {
        innerWalls: [],
        rooms: [{ id: 'loft', at: { x: 1, y: 3 }, name: 'Loft', floor: 'floor_boards' }],
        openings: [{ id: 'window-1', kind: 'window', size: 'small', x: 4, y: 7 }],
      },
    ],
  };
};
