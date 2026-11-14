/**
 * The world's maps joined by their location links, the only way characters get from one map to another. Each link is
 * one way: from a trigger on its map to an arrival anchor on the target map. Mirrors Unity's MapLinkGraph.
 */
import type { Map as GameMap, LocationLink } from '../types/schema';
import { planRoute, type BlockedGrid, type MapNavigation } from './navigationPath';

/** Whether a chain of location links leads from one map to the other; a map always reaches itself. */
export function canReachMap(maps: readonly GameMap[], fromMapId: string, toMapId: string): boolean {
  const seen = new Set([fromMapId]);
  const queue = [fromMapId];
  while (queue.length) {
    const mapId = queue.shift()!;
    if (mapId === toMapId) return true;
    for (const link of maps.find((map) => map.id === mapId)?.locationLinks ?? [])
      if (!seen.has(link.targetMapId)) {
        seen.add(link.targetMapId);
        queue.push(link.targetMapId);
      }
  }
  return false;
}

type Point = [number, number];

/** A walk's part on one map, in tile units. */
export interface WorldLeg {
  mapId: string;
  points: Point[];
  /** The link this part came through, starting at its arrival anchor; absent at the start. */
  enters?: LocationLink;
  /** The link this part ends at and crosses; absent at the destination. */
  leaves?: LocationLink;
}

/** A place on a map, in pixels. */
export interface WorldPoint {
  mapId: string;
  position: Point;
}

/**
 * Where characters walk to use a link, in tile units: the walkable tile nearest the middle of its trigger, among those
 * the trigger covers or borders (triggers are often thin strips along the map's edge). Null when there is none or the
 * trigger is missing. Mirrors Unity's NavigationMap.DoorPosition, including which of two equally near tiles wins.
 */
export function doorPosition(
  map: GameMap,
  link: LocationLink,
  blocked: BlockedGrid,
  tileSize: number,
): Point | null {
  const trigger = map.spatialPrimitives?.triggers?.find((entry) => entry.id === link.triggerId);
  if (!trigger) return null;
  const corners: Point[] =
    trigger.shape === 'polygon' && trigger.points?.length
      ? trigger.points
      : [
          trigger.position,
          [
            trigger.position[0] + (trigger.size?.[0] ?? 1),
            trigger.position[1] + (trigger.size?.[1] ?? 1),
          ],
        ];
  const xs = corners.map((point) => point[0] / tileSize);
  const ys = corners.map((point) => point[1] / tileSize);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const centre: Point = [(minX + maxX) / 2, (minY + maxY) / 2];
  const reach = { minX: minX - 0.5, maxX: maxX + 0.5, minY: minY - 0.5, maxY: maxY + 0.5 };
  let best: Point | null = null;
  const distance = (point: Point) => (point[0] - centre[0]) ** 2 + (point[1] - centre[1]) ** 2;
  // Unity counts rows from the bottom: going up from the lowest row keeps its choice between equally near tiles.
  for (let y = Math.floor(reach.maxY); y >= Math.floor(reach.minY); y--)
    for (let x = Math.floor(reach.minX); x <= Math.floor(reach.maxX); x++) {
      if (y < 0 || x < 0 || y >= blocked.length || x >= blocked[0].length || blocked[y][x])
        continue;
      if (x + 1 <= reach.minX || x >= reach.maxX || y + 1 <= reach.minY || y >= reach.maxY)
        continue;
      const middle: Point = [x + 0.5, y + 0.5];
      if (best === null || distance(middle) < distance(best)) best = middle;
    }
  return best;
}

/**
 * The walk from one place to another through the fewest maps, and the shortest of those, split into one part per map;
 * null when no walkable chain of links exists. Links within one map are ignored. Mirrors Unity's
 * RoutineTimetablePlanner.
 */
export function planWorldRoute(
  maps: readonly GameMap[],
  navigation: (map: GameMap) => MapNavigation,
  from: WorldPoint,
  to: WorldPoint,
  tileSize: number,
): WorldLeg[] | null {
  interface Stop {
    mapId: string;
    position: Point; // pixels
    distance: number;
    crossings: number;
    entered?: LocationLink;
    previous?: Stop;
    walk?: Point[];
    isGoal?: boolean;
  }
  const mapById = (id: string) => maps.find((map) => map.id === id);
  const anchor = (map: GameMap | undefined, anchorId: string) =>
    map?.spatialPrimitives?.anchors?.find((entry) => entry.id === anchorId)?.position ?? null;
  const open: Stop[] = [{ ...from, distance: 0, crossings: 0 }];
  const crossed = new Set<LocationLink>();
  while (open.length) {
    open.sort((a, b) => a.crossings - b.crossings || a.distance - b.distance);
    const stop = open.shift()!;
    if (stop.isGoal) return legsOf(stop);
    if (stop.entered) {
      if (crossed.has(stop.entered)) continue;
      crossed.add(stop.entered);
    }
    const map = mapById(stop.mapId);
    if (!map) continue;
    const grid = navigation(map);
    if (stop.mapId === to.mapId) {
      const walk = planRoute(grid, stop.position, to.position, tileSize);
      if (walk)
        open.push({
          mapId: stop.mapId,
          position: to.position,
          distance: stop.distance + routeLength(walk),
          crossings: stop.crossings,
          previous: stop,
          walk,
          isGoal: true,
        });
    }
    for (const link of map.locationLinks ?? []) {
      if (link.targetMapId === stop.mapId || crossed.has(link)) continue;
      const door = doorPosition(map, link, grid.blocked, tileSize);
      const arrival = anchor(mapById(link.targetMapId), link.targetAnchorId);
      if (!door || !arrival) continue;
      const walk = planRoute(
        grid,
        stop.position,
        [door[0] * tileSize, door[1] * tileSize],
        tileSize,
      );
      if (!walk) continue;
      open.push({
        mapId: link.targetMapId,
        position: arrival,
        distance: stop.distance + routeLength(walk),
        crossings: stop.crossings + 1,
        entered: link,
        previous: stop,
        walk,
      });
    }
  }
  return null;

  function legsOf(goal: Stop): WorldLeg[] {
    const legs: WorldLeg[] = [];
    let leaves: LocationLink | undefined;
    for (let stop = goal; stop.previous; stop = stop.previous) {
      legs.unshift({
        mapId: stop.previous.mapId,
        points: stop.walk!,
        enters: stop.previous.entered,
        leaves,
      });
      leaves = stop.previous.entered;
    }
    return legs;
  }
}

/** Length of a route in tiles. */
export function routeLength(points: readonly Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return length;
}
