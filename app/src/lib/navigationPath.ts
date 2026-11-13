/**
 * Route preview for NPC navigation: the same weighted 8-directional A* as Unity's GridPathfinder, run on the
 * navigation cost grid with blocked cells taken from the map's collision data. See docs/routine-editor.md.
 */
import type { CollisionDefinition, Map as GameMap, MapCollision, Tileset } from '../types/schema';
import { computeNavigationCostGrid, type NavigationCostGrid } from './navigationCost';
import { shapeToNormalizedPolygon } from './collisionUtils';
import { getObjectDefinition } from './mapObjects';
import { resolveTileAt } from './mapUtils';
import { splitTileRef } from './tileRef';
import { getWaterBitmap } from './waterMaskCache';

type Point = [number, number];

/**
 * Half the side of the box, centred on a cell, that must be free of collisions for a character to stand there.
 * Unity tests the character's own collider instead; this stands in for a typical feet collider.
 */
const FOOTPRINT_HALF = 0.25;
const CIRCLE_SEGMENTS = 12;

/** Row-major `blocked[y][x]`: true where a character could not stand. */
export type BlockedGrid = boolean[][];

/**
 * Cells blocked by the static collision Unity builds at import, by the same rules as Unity's baked grid
 * (NavigationBlockedCellsBuilder): tile collisions on visible visual and terrain layers, placed objects at their exact
 * position, drawn water covering more than half a cell, and the map's collision shapes. A cell is blocked when
 * collision covers its middle half. Entities placed on the map can also block in Unity; they are not known here.
 */
export function computeBlockedGrid(
  map: GameMap,
  tilesets: Map<string, Tileset>,
  tileSize: number,
): BlockedGrid {
  const blocked = Array.from({ length: map.height }, () =>
    new Array<boolean>(map.width).fill(false),
  );
  // Blocks every cell whose middle the polygon (in tile units) overlaps.
  const blockUnder = (polygon: Point[]) => {
    if (polygon.length < 3) return;
    const xs = polygon.map((p) => p[0]);
    const ys = polygon.map((p) => p[1]);
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const maxX = Math.min(map.width - 1, Math.floor(Math.max(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(map.height - 1, Math.floor(Math.max(...ys)));
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++)
        if (!blocked[y][x] && polygonOverlapsBox(polygon, footprint(x, y))) blocked[y][x] = true;
  };

  for (const layer of map.layers) {
    if (!layer.visible) continue;
    if (layer.kind === 'visual' || layer.kind === 'terrain') {
      for (let y = 0; y < map.height; y++)
        for (let x = 0; x < map.width; x++) {
          if (blocked[y][x]) continue;
          const tileRef = resolveTileAt(map, layer.id, x, y, null);
          if (!tileRef) continue;
          const [tilesetId, index] = splitTileRef(tileRef);
          const tile = tilesets.get(tilesetId)?.tiles[parseInt(index, 10)];
          for (const polygon of tilePolygons(tile?.collision, [x, y], tileSize))
            blockUnder(polygon);
        }
    } else if (layer.kind === 'object') {
      for (const instance of layer.objectInstances ?? []) {
        const definition = getObjectDefinition(
          tilesets,
          instance.tilesetId,
          instance.objectDefinitionId,
        );
        // Objects stand at their exact pixel position, which need not be a whole tile.
        for (const part of definition?.tiles ?? []) {
          const tile = tilesets.get(instance.tilesetId)?.tiles[part.tileIndex];
          const topLeft: Point = [instance.x / tileSize + part.x, instance.y / tileSize + part.y];
          for (const polygon of tilePolygons(tile?.collision, topLeft, tileSize))
            blockUnder(polygon);
        }
      }
    } else if (layer.kind === 'water' && layer.waterMask) {
      markWater(
        blocked,
        map,
        getWaterBitmap(layer.id, layer.waterMask),
        layer.waterMask.width,
        tileSize,
      );
    }
  }

  for (const collision of map.spatialPrimitives?.collisions ?? [])
    blockUnder(collisionPolygon(collision, tileSize));
  return blocked;
}

/**
 * A tile's collision as polygons placed at `topLeft` (tile units): "full" fills the tile, "complex" uses every polygon
 * and rectangle shape, as Unity's imported physics shape does.
 */
function tilePolygons(
  collision: CollisionDefinition | undefined,
  [x, y]: Point,
  tileSize: number,
): Point[][] {
  if (collision?.type === 'full')
    return [
      [
        [x, y],
        [x + 1, y],
        [x + 1, y + 1],
        [x, y + 1],
      ],
    ];
  if (collision?.type !== 'complex') return [];
  return (collision.shapes ?? []).flatMap((shape): Point[][] => {
    const points: Point[] =
      shape.type === 'rectangle'
        ? [
            [shape.x ?? 0, shape.y ?? 0],
            [(shape.x ?? 0) + (shape.width ?? 0), shape.y ?? 0],
            [(shape.x ?? 0) + (shape.width ?? 0), (shape.y ?? 0) + (shape.height ?? 0)],
            [shape.x ?? 0, (shape.y ?? 0) + (shape.height ?? 0)],
          ]
        : shapeToNormalizedPolygon(shape, tileSize);
    return points.length >= 3 ? [points.map(([px, py]): Point => [x + px, y + py])] : [];
  });
}

function footprint(x: number, y: number): [Point, Point] {
  return [
    [x + 0.5 - FOOTPRINT_HALF, y + 0.5 - FOOTPRINT_HALF],
    [x + 0.5 + FOOTPRINT_HALF, y + 0.5 + FOOTPRINT_HALF],
  ];
}

/** A map collision shape in tile units. */
function collisionPolygon(collision: MapCollision, tileSize: number): Point[] {
  const [px, py] = collision.position;
  switch (collision.shape) {
    case 'rectangle': {
      const [w, h] = collision.size ?? [0, 0];
      return [
        [px, py],
        [px + w, py],
        [px + w, py + h],
        [px, py + h],
      ].map(([x, y]): Point => [x / tileSize, y / tileSize]);
    }
    case 'circle': {
      const r = collision.radius ?? 0;
      return Array.from({ length: CIRCLE_SEGMENTS }, (_, i): Point => {
        const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
        return [(px + Math.cos(angle) * r) / tileSize, (py + Math.sin(angle) * r) / tileSize];
      });
    }
    case 'polygon':
      return (collision.points ?? []).map(([x, y]): Point => [x / tileSize, y / tileSize]);
  }
}

/** Drawn water blocks a cell when it covers more than half of its pixels, like Unity's imported water collider. */
function markWater(
  blocked: BlockedGrid,
  map: GameMap,
  bitmap: Uint8Array,
  maskWidth: number,
  tileSize: number,
) {
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      let water = 0;
      for (let py = y * tileSize; py < (y + 1) * tileSize; py++)
        for (let px = x * tileSize; px < (x + 1) * tileSize; px++)
          if (bitmap[py * maskWidth + px]) water++;
      if (water * 2 > tileSize * tileSize) blocked[y][x] = true;
    }
}

/** Whether a polygon and an axis-aligned box share any area or edge. */
export function polygonOverlapsBox(polygon: Point[], [min, max]: [Point, Point]): boolean {
  const inBox = ([x, y]: Point) => x > min[0] && x < max[0] && y > min[1] && y < max[1];
  if (polygon.some(inBox)) return true;
  const corners: Point[] = [min, [max[0], min[1]], max, [min[0], max[1]]];
  if (corners.some((corner) => pointInPolygon(corner, polygon))) return true;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    for (let j = 0; j < 4; j++)
      if (segmentsCross(a, b, corners[j], corners[(j + 1) % 4])) return true;
  }
  return false;
}

function pointInPolygon([x, y]: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (o: Point, p: Point, q: Point) =>
    (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

const DIRECTIONS: Point[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export interface GridPath {
  /** Cells after the start where the route turns, ending with the goal; empty when start equals goal. */
  waypoints: Point[];
  totalCost: number;
}

/**
 * Cheapest route between two cells, or null when none exists. Matches Unity's GridPathfinder: entering a cell
 * costs its cost (times sqrt 2 diagonally), diagonals need both orthogonal neighbours walkable, the start cell is
 * never checked, and straight runs merge into their end cells.
 */
export function findGridPath(
  start: Point,
  goal: Point,
  costs: NavigationCostGrid,
  blocked: BlockedGrid,
): GridPath | null {
  const { width, height } = costs;
  if (start[0] === goal[0] && start[1] === goal[1]) return { waypoints: [], totalCost: 0 };
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const walkable = (x: number, y: number) => inBounds(x, y) && !blocked[y][x];
  if (!inBounds(start[0], start[1]) || !walkable(goal[0], goal[1])) return null;

  const key = (x: number, y: number) => y * width + x;
  const cost = new Map<number, number>([[key(...start), 0]]);
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  let order = 0;
  open.push(heuristic(start, goal), order++, key(...start));

  while (open.size > 0) {
    const current = open.pop();
    if (closed.has(current)) continue;
    closed.add(current);
    const cx = current % width;
    const cy = Math.floor(current / width);
    if (cx === goal[0] && cy === goal[1])
      return {
        waypoints: buildWaypoints(cameFrom, key(...start), current, width),
        totalCost: cost.get(current)!,
      };

    for (const [dx, dy] of DIRECTIONS) {
      const nx = cx + dx;
      const ny = cy + dy;
      const next = key(nx, ny);
      if (!walkable(nx, ny) || closed.has(next)) continue;
      const diagonal = dx !== 0 && dy !== 0;
      if (diagonal && (!walkable(cx + dx, cy) || !walkable(cx, cy + dy))) continue;
      const candidate = cost.get(current)! + costs.cells[ny][nx].cost * (diagonal ? Math.SQRT2 : 1);
      const known = cost.get(next);
      if (known !== undefined && known <= candidate) continue;
      cost.set(next, candidate);
      cameFrom.set(next, current);
      open.push(candidate + heuristic([nx, ny], goal), order++, next);
    }
  }
  return null;
}

// Octile distance at the minimum cell cost of 1, so the route stays optimal.
function heuristic(from: Point, to: Point): number {
  const dx = Math.abs(from[0] - to[0]);
  const dy = Math.abs(from[1] - to[1]);
  return Math.abs(dx - dy) + Math.SQRT2 * Math.min(dx, dy);
}

function buildWaypoints(
  cameFrom: Map<number, number>,
  start: number,
  goal: number,
  width: number,
): Point[] {
  const cells = [goal];
  for (let cell = goal; cameFrom.get(cell) !== start; cell = cameFrom.get(cell)!)
    cells.push(cameFrom.get(cell)!);
  cells.push(start);
  cells.reverse();
  const points = cells.map((cell): Point => [cell % width, Math.floor(cell / width)]);
  const waypoints: Point[] = [];
  for (let i = 1; i < points.length; i++) {
    const isLast = i === points.length - 1;
    if (
      isLast ||
      points[i + 1][0] - points[i][0] !== points[i][0] - points[i - 1][0] ||
      points[i + 1][1] - points[i][1] !== points[i][1] - points[i - 1][1]
    )
      waypoints.push(points[i]);
  }
  return waypoints;
}

/** Binary heap ordered by (f, insertion order), like the SortedSet in Unity. */
class MinHeap {
  private readonly items: [number, number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(f: number, order: number, cell: number) {
    const items = this.items;
    items.push([f, order, cell]);
    for (let i = items.length - 1; i > 0; ) {
      const parent = (i - 1) >> 1;
      if (!less(items[i], items[parent])) break;
      [items[i], items[parent]] = [items[parent], items[i]];
      i = parent;
    }
  }
  pop(): number {
    const items = this.items;
    const top = items[0][2];
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      for (let i = 0; ; ) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && less(items[l], items[smallest])) smallest = l;
        if (r < items.length && less(items[r], items[smallest])) smallest = r;
        if (smallest === i) break;
        [items[i], items[smallest]] = [items[smallest], items[i]];
        i = smallest;
      }
    }
    return top;
  }
}

const less = (a: [number, number, number], b: [number, number, number]) =>
  a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

/** Navigation data for one map, computed once per map version. */
export interface MapNavigation {
  costs: NavigationCostGrid;
  blocked: BlockedGrid;
}

export function computeMapNavigation(
  map: GameMap,
  tilesets: Map<string, Tileset>,
  tileSize: number,
): MapNavigation {
  return {
    costs: computeNavigationCostGrid(map, tilesets, null, tileSize),
    blocked: computeBlockedGrid(map, tilesets, tileSize),
  };
}

/**
 * The walked route between two pixel positions in tile units, like Unity's NavigationPlan: the start, the middle
 * of every turning cell, then the exact destination. Null when no route exists.
 */
export function planRoute(
  navigation: MapNavigation,
  fromPixels: Point,
  toPixels: Point,
  tileSize: number,
): Point[] | null {
  const from: Point = [fromPixels[0] / tileSize, fromPixels[1] / tileSize];
  const to: Point = [toPixels[0] / tileSize, toPixels[1] / tileSize];
  const path = findGridPath(
    [Math.floor(from[0]), Math.floor(from[1])],
    [Math.floor(to[0]), Math.floor(to[1])],
    navigation.costs,
    navigation.blocked,
  );
  if (!path) return null;
  const middles = path.waypoints.slice(0, -1).map(([x, y]): Point => [x + 0.5, y + 0.5]);
  return [from, ...middles, to];
}
