import type { Layer, Map as GameMap } from '../../types/schema';

/** A 32×32 map with the given layers and no tiles. */
export const testMap = (id: string, layers: Layer[] = []): GameMap => ({
  id,
  name: id.replace('test:', ''),
  version: 1,
  width: 32,
  height: 32,
  baseTilesetId: '',
  tilesetRefs: [],
  layers,
  entities: [],
});

/** A building layer with the given buildings placed. */
export const buildingLayer = (buildings: Layer['buildings'] = []): Layer => ({
  id: 'buildings',
  name: 'Buildings',
  kind: 'building',
  visible: true,
  locked: false,
  opacity: 1,
  zOrder: 5,
  buildings,
});
