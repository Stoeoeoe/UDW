import type { LocationConnection } from '../locationConnection';
import type { Anchor, Map as GameMap, MapTrigger } from '../../types/schema';

export const connectionMaps = (): GameMap[] =>
  ['base:outside', 'base:inside'].map((id) => ({
    version: 1,
    id,
    name: id,
    width: 20,
    height: 20,
    baseTilesetId: 'base:village',
    tilesetRefs: ['base:village'],
    entities: [],
    layers: [
      {
        id: 'navigation',
        name: 'Navigation',
        kind: 'navigation',
        visible: true,
        locked: false,
        opacity: 1,
        zOrder: 1,
      },
    ],
  }));
export const connectionTrigger = (id: string): MapTrigger => ({
  id,
  type: 'locationLinkTrigger',
  shape: 'rectangle',
  position: [32, 32],
  size: [16, 32],
});
export const connectionAnchor = (id: string, facing: [number, number]): Anchor => ({
  id,
  name: id,
  position: [56, 72],
  facing,
  tags: [],
});
export const connectionDraft = (): LocationConnection => ({
  label: 'Front door',
  twoWay: true,
  source: {
    mapId: 'base:outside',
    trigger: connectionTrigger('outside-exit'),
    anchor: connectionAnchor('outside-arrival', [0, 1]),
    linkType: 'door',
  },
  destination: {
    mapId: 'base:inside',
    trigger: connectionTrigger('inside-exit'),
    anchor: connectionAnchor('inside-arrival', [-1, 0]),
    linkType: 'open',
  },
});
