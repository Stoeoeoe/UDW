import type { FlowStroke } from '../types/schema';

type Point = [number, number];

/** Pointer movement, in map pixels, below which a drag adds no new point to a stroke being drawn. */
export const FLOW_POINT_SPACING = 2;
/** How closely a finished stroke is simplified, in map pixels. */
export const FLOW_SIMPLIFY_TOLERANCE = 1.5;
/** Strokes shorter than this are accidental clicks and are dropped. */
export const MIN_FLOW_STROKE_LENGTH = 6;
/** How near a click must be to a stroke's line to remove it, in map pixels. */
export const FLOW_ERASE_REACH = 6;

/** Total length of a polyline in map pixels. */
export function strokeLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return length;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Smallest distance from a point to a stroke's line. */
export function distanceToStroke(point: Point, stroke: FlowStroke): number {
  const points = stroke.points;
  if (points.length === 1) return Math.hypot(point[0] - points[0][0], point[1] - points[0][1]);
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    best = Math.min(best, distanceToSegment(point, points[i - 1], points[i]));
  }
  return best;
}

/** Douglas-Peucker simplification: keeps the shape of a freehand line with far fewer points. */
export function simplifyStroke(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const pending: [number, number][] = [[0, points.length - 1]];
  while (pending.length > 0) {
    const [start, end] = pending.pop()!;
    let furthest = -1;
    let furthestDistance = tolerance;
    for (let i = start + 1; i < end; i++) {
      const distance = distanceToSegment(points[i], points[start], points[end]);
      if (distance > furthestDistance) {
        furthest = i;
        furthestDistance = distance;
      }
    }
    if (furthest >= 0) {
      keep[furthest] = true;
      pending.push([start, furthest], [furthest, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Appends a point only once the pointer has moved far enough, so a slow drag does not pile up points. */
export function appendStrokePoint(points: Point[], next: Point, minimumSpacing: number): Point[] {
  const last = points[points.length - 1];
  if (last && Math.hypot(next[0] - last[0], next[1] - last[1]) < minimumSpacing) return points;
  return [...points, next];
}
