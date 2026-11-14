import { describe, expect, it } from 'vitest';
import { doorPosition, planWorldRoute } from './worldGraph';
import type { MapNavigation } from './navigationPath';
import type { LocationLink, Map as GameMap } from '../types/schema';

// The same world as Unity's RoutineTimetableTests: a 10x5 town and a 5x5 shop, 16 px tiles.
const TILE = 16;
const px = (x: number, y: number): [number, number] => [x * TILE, y * TILE];

const link = (id: string, targetMapId: string, targetAnchorId: string): LocationLink => ({
  id,
  label: id,
  triggerId: id,
  targetMapId,
  targetAnchorId,
});

const gameMap = (
  id: string,
  width: number,
  height: number,
  anchors: Record<string, [number, number]>,
  doors: { link: LocationLink; position: [number, number]; size: [number, number] }[],
) =>
  ({
    id,
    name: id,
    width,
    height,
    layers: [],
    spatialPrimitives: {
      anchors: Object.entries(anchors).map(([anchorId, position]) => ({
        id: anchorId,
        name: anchorId,
        position,
        tags: [],
      })),
      triggers: doors.map(({ link: door, position, size }) => ({
        id: door.triggerId,
        type: 'location',
        shape: 'rectangle',
        position,
        size,
      })),
    },
    locationLinks: doors.map((door) => door.link),
  }) as unknown as GameMap;

const navigation = (map: GameMap, blocked: [number, number][] = []): MapNavigation => ({
  costs: {
    width: map.width,
    height: map.height,
    cells: Array.from({ length: map.height }, () =>
      Array.from({ length: map.width }, () => ({ cost: 1, sourceLayerId: null })),
    ),
  },
  blocked: Array.from({ length: map.height }, (_, y) =>
    Array.from({ length: map.width }, (_, x) => blocked.some(([bx, by]) => bx === x && by === y)),
  ),
});

const frontDoor = link('front-door', 'base:shop', 'front');
const backDoor = link('back-door', 'base:shop', 'back');
const shopExit = link('shop-exit', 'base:town', 'home');
// Thin strips along the town's right and left edges, the way Vulcanus exits are drawn.
const rightEdge = { position: px(9.94, 0), size: [1, 5 * TILE] as [number, number] };
const leftEdge = { position: px(0, 0), size: [1, 5 * TILE] as [number, number] };

const town = (
  ...doors: { link: LocationLink; position: [number, number]; size: [number, number] }[]
) => gameMap('base:town', 10, 5, { home: px(0.5, 2.5), well: px(6.5, 2.5) }, doors);
const shop = (
  ...doors: { link: LocationLink; position: [number, number]; size: [number, number] }[]
) =>
  gameMap(
    'base:shop',
    5,
    5,
    { front: px(0.5, 2.5), back: px(4.5, 2.5), counter: px(2.5, 2.5) },
    doors,
  );

const plan = (maps: GameMap[], from: [string, string], to: [string, string]) => {
  const at = ([mapId, anchorId]: [string, string]) => ({
    mapId,
    position: maps
      .find((map) => map.id === mapId)!
      .spatialPrimitives!.anchors!.find((anchor) => anchor.id === anchorId)!.position,
  });
  return planWorldRoute(maps, (map) => navigation(map), at(from), at(to), TILE);
};

describe('cross-map routes', () => {
  it('splits a walk to another map at the door, and goes on from its arrival anchor', () => {
    const legs = plan(
      [town({ link: frontDoor, ...rightEdge }), shop()],
      ['base:town', 'home'],
      ['base:shop', 'counter'],
    )!;
    expect(legs.map((leg) => [leg.mapId, leg.enters?.id, leg.leaves?.id])).toEqual([
      ['base:town', undefined, 'front-door'],
      ['base:shop', 'front-door', undefined],
    ]);
    expect(legs[0].points.at(-1)).toEqual([9.5, 2.5]);
    expect(legs[1].points[0]).toEqual([0.5, 2.5]);
  });

  it('takes the quickest door', () => {
    const legs = plan(
      [town({ link: frontDoor, ...rightEdge }, { link: backDoor, ...leftEdge }), shop()],
      ['base:town', 'home'],
      ['base:shop', 'counter'],
    )!;
    expect(legs[0].leaves).toBe(backDoor);
  });

  it('does not pass through another map to save a few steps', () => {
    // Through the shop would be shorter: its exit lands right at home.
    const legs = plan(
      [town({ link: frontDoor, ...rightEdge }), shop({ link: shopExit, ...leftEdge })],
      ['base:town', 'well'],
      ['base:town', 'home'],
    )!;
    expect(legs.map((leg) => leg.mapId)).toEqual(['base:town']);
  });

  it('is null when no walkable chain of links leads there', () => {
    expect(plan([town(), shop()], ['base:town', 'home'], ['base:shop', 'counter'])).toBeNull();
  });
});

describe('door position', () => {
  it('is the walkable tile nearest the middle of the trigger', () => {
    const map = town({ link: frontDoor, position: px(9.94, 1.9), size: [1, TILE] });
    expect(doorPosition(map, frontDoor, navigation(map, [[9, 2]]).blocked, TILE)).toEqual([
      9.5, 1.5,
    ]);
  });

  it('picks between equally near tiles like Unity', () => {
    const map = town({ link: frontDoor, position: px(9.94, 2), size: [1, TILE] });
    // Unity counts rows from the bottom and keeps the first of two equally near tiles: the lower one.
    expect(doorPosition(map, frontDoor, navigation(map, [[9, 2]]).blocked, TILE)).toEqual([
      9.5, 3.5,
    ]);
  });

  it('borders a trigger just outside the map', () => {
    const map = town({ link: frontDoor, position: px(3, 5), size: [TILE, 1] });
    expect(doorPosition(map, frontDoor, navigation(map).blocked, TILE)).toEqual([3.5, 4.5]);
  });
});
