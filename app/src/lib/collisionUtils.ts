import { CollisionDefinition, CollisionShape } from '../types/schema';

export type NormalizedPoint = [number, number];

const EPSILON = 0.0001;

export const FULL_TILE_POLYGON: NormalizedPoint[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

function pointsEqual(a: NormalizedPoint, b: NormalizedPoint): boolean {
  return nearlyEqual(a[0], b[0]) && nearlyEqual(a[1], b[1]);
}

function polygonSignedArea(points: NormalizedPoint[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

export function normalizeTilePoint(
  point: [number, number],
  tileWidth: number,
  tileHeight: number,
): NormalizedPoint {
  const [x, y] = point;
  const hasPixelLikeValue = Math.abs(x) > 1 || Math.abs(y) > 1;
  if (hasPixelLikeValue) {
    return [
      clamp01(x / Math.max(1, tileWidth)),
      clamp01(y / Math.max(1, tileHeight)),
    ];
  }
  return [clamp01(x), clamp01(y)];
}

export function normalizePolygonPoints(
  points: [number, number][],
  tileWidth: number,
  tileHeight: number,
): NormalizedPoint[] {
  const normalized = points.map((pt) =>
    normalizeTilePoint(pt, tileWidth, tileHeight),
  );
  const deduped: NormalizedPoint[] = [];

  for (const point of normalized) {
    const last = deduped[deduped.length - 1];
    if (!last || !pointsEqual(last, point)) {
      deduped.push(point);
    }
  }

  if (
    deduped.length > 1 &&
    pointsEqual(deduped[0], deduped[deduped.length - 1])
  ) {
    deduped.pop();
  }

  return deduped;
}

export function isValidPolygon(points: NormalizedPoint[]): boolean {
  if (points.length < 3) return false;
  const unique = new Set(
    points.map((p) => `${p[0].toFixed(4)}:${p[1].toFixed(4)}`),
  );
  if (unique.size < 3) return false;
  return Math.abs(polygonSignedArea(points)) > EPSILON;
}

export function shapeToNormalizedPolygon(
  shape: CollisionShape,
  tileWidth: number,
  tileHeight: number,
): NormalizedPoint[] {
  if (shape.type !== 'polygon' || !shape.points) return [];
  return normalizePolygonPoints(shape.points, tileWidth, tileHeight);
}

export function getPolygonFromCollision(
  collision: CollisionDefinition | undefined,
  tileWidth: number,
  tileHeight: number,
): NormalizedPoint[] {
  if (!collision || collision.type === 'none') return [];
  if (collision.type === 'full')
    return FULL_TILE_POLYGON.map(([x, y]) => [x, y]);

  const polygonShape = collision.shapes?.find(
    (shape) => shape.type === 'polygon',
  );
  if (!polygonShape) return [];
  return shapeToNormalizedPolygon(polygonShape, tileWidth, tileHeight);
}

export function buildPolygonCollision(
  points: NormalizedPoint[],
): CollisionDefinition {
  return {
    type: 'complex',
    shapes: [
      {
        id: 'poly-1',
        type: 'polygon',
        points,
      },
    ],
  };
}
