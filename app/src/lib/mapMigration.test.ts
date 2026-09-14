import { describe, expect, it } from 'vitest';
import { deserializeMap, serializeMap } from './mapMigration';
import type { Map } from '../types/schema';

describe('mapMigration', () => {
  it('preserves objectGroups while serializing and deserializing a map', () => {
    const map: Map = {
      version: 1,
      id: 'forest',
      name: 'Forest',
      width: 8,
      height: 8,
      baseTilesetId: 'village',
      tilesetRefs: ['village'],
      layers: [
        {
          id: 'objects',
          name: 'Objects',
          kind: 'object',
          visible: true,
          locked: false,
          opacity: 1,
          zOrder: 1,
          objectGroups: [
            {
              id: 'obj_tree',
              tiles: [
                { x: 3, y: 7, tilesetId: 'village', tileIndex: 42 },
                { x: 3, y: 6, tilesetId: 'village', tileIndex: 26 },
                { x: 3, y: 5, tilesetId: 'village', tileIndex: 10 },
              ],
            },
          ],
        },
      ],
      entities: [],
    };

    const serialized = serializeMap(map);
    expect(serialized.layers[0].objectGroups).toEqual(map.layers[0].objectGroups);

    const roundTripped = deserializeMap(serialized);
    expect(roundTripped.layers[0].objectGroups).toEqual(map.layers[0].objectGroups);
  });

  it('preserves objectInstances while serializing and deserializing a map', () => {
    const map: Map = {
      version: 1,
      id: 'forest',
      name: 'Forest',
      width: 8,
      height: 8,
      baseTilesetId: 'village',
      tilesetRefs: ['village'],
      layers: [
        {
          id: 'objects',
          name: 'Objects',
          kind: 'object',
          visible: true,
          locked: false,
          opacity: 1,
          zOrder: 1,
          objectInstances: [
            {
              id: 'inst_tree',
              tilesetId: 'village',
              objectDefinitionId: 'oak_tree',
              x: 3,
              y: 5,
            },
          ],
        },
      ],
      entities: [],
    };

    const serialized = serializeMap(map);
    expect(serialized.layers[0].objectInstances).toEqual(map.layers[0].objectInstances);

    const roundTripped = deserializeMap(serialized);
    expect(roundTripped.layers[0].objectInstances).toEqual(map.layers[0].objectInstances);
  });
});
