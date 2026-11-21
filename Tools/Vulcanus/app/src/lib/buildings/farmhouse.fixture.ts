import type { Building } from '../../types/building';

/** The example farmhouse of docs/building-editor.md: a kitchen and a bedroom under a gable roof. */
export const farmhouse = (): Building => ({
  formatVersion: 1,
  id: 'test:farmhouse',
  name: 'Farmhouse',
  kit: 'test:kit',
  width: 9,
  depth: 7,
  innerWalls: [{ x: 4, y: 1, direction: 'south', length: 5 }],
  rooms: [
    { id: 'kitchen', at: { x: 2, y: 3 }, name: 'Kitchen', floor: 'floor_tiles' },
    { id: 'bedroom', at: { x: 6, y: 3 }, name: 'Bedroom', floor: 'floor_boards' },
  ],
  openings: [
    { id: 'entrance', kind: 'door', x: 6, y: 6 },
    { id: 'window-1', kind: 'window', x: 2, y: 6 },
    { id: 'window-2', kind: 'window', x: 7, y: 6 },
    { id: 'inner-door', kind: 'door', x: 4, y: 4 },
  ],
  chimney: { column: 2 },
  roof: { kind: 'gable' },
});
