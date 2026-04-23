import { describe, it, expect } from 'vitest';
import {
  quantizeOverlayPoint,
  addPolygonSegments,
  makeSegmentKey,
  toggleSegment,
} from './useMapRenderer';

type Segment = { a: { x: number; y: number }; b: { x: number; y: number } };

describe('quantizeOverlayPoint', () => {
  it('rounds fractional coordinates to nearest integer', () => {
    expect(quantizeOverlayPoint(1.4, 2.6)).toEqual({ x: 1, y: 3 });
    expect(quantizeOverlayPoint(0, 0)).toEqual({ x: 0, y: 0 });
    // Math.round uses "round half to +Infinity" so 0.5 → 1, -0.5 → 0
    expect(quantizeOverlayPoint(0.5, 0.5)).toEqual({ x: 1, y: 1 });
  });
});

describe('makeSegmentKey', () => {
  it('produces the same key regardless of point order', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 16, y: 0 };
    expect(makeSegmentKey(a, b)).toBe(makeSegmentKey(b, a));
  });

  it('produces different keys for different segments', () => {
    expect(makeSegmentKey({ x: 0, y: 0 }, { x: 16, y: 0 })).not.toBe(
      makeSegmentKey({ x: 0, y: 0 }, { x: 0, y: 16 }),
    );
  });

  it('is stable (same input → same output)', () => {
    const key = makeSegmentKey({ x: 10, y: 20 }, { x: 30, y: 40 });
    expect(key).toBe(makeSegmentKey({ x: 10, y: 20 }, { x: 30, y: 40 }));
  });
});

describe('toggleSegment', () => {
  it('adds a segment when it does not exist', () => {
    const map = new Map<string, Segment>();
    const a = { x: 0, y: 0 };
    const b = { x: 16, y: 0 };
    toggleSegment(map, a, b);
    expect(map.size).toBe(1);
  });

  it('removes a segment when it already exists (toggling twice yields empty)', () => {
    const map = new Map<string, Segment>();
    const a = { x: 0, y: 0 };
    const b = { x: 16, y: 0 };
    toggleSegment(map, a, b);
    toggleSegment(map, a, b);
    expect(map.size).toBe(0);
  });

  it('does not add a zero-length segment (a === b)', () => {
    const map = new Map<string, Segment>();
    const p = { x: 5, y: 5 };
    toggleSegment(map, p, p);
    expect(map.size).toBe(0);
  });

  it('treats reversed a/b as the same segment (symmetric key)', () => {
    const map = new Map<string, Segment>();
    const a = { x: 0, y: 0 };
    const b = { x: 16, y: 0 };
    toggleSegment(map, a, b); // add
    toggleSegment(map, b, a); // should toggle off
    expect(map.size).toBe(0);
  });
});

describe('useMapRenderer segment merging', () => {
  it('cancels shared edges between adjacent polygons', () => {
    // Two adjacent 16px tiles: left tile at (0,0)-(16,16), right tile at (16,0)-(32,16)
    const left = [
      quantizeOverlayPoint(0, 0),
      quantizeOverlayPoint(16, 0),
      quantizeOverlayPoint(16, 16),
      quantizeOverlayPoint(0, 16),
    ];

    const right = [
      quantizeOverlayPoint(16, 0),
      quantizeOverlayPoint(32, 0),
      quantizeOverlayPoint(32, 16),
      quantizeOverlayPoint(16, 16),
    ];

    const map = new Map<string, Segment>();
    addPolygonSegments(map, left);
    addPolygonSegments(map, right);

    // The shared edge between left and right should have been toggled twice and removed.
    const sharedKey = makeSegmentKey(left[1], left[2]);
    expect(map.has(sharedKey)).toBe(false);

    // Outer edges (e.g., left tile left edge) should remain
    const leftOuter = makeSegmentKey(left[0], left[1]);
    expect(map.has(leftOuter)).toBe(true);

    const rightOuter = makeSegmentKey(right[1], right[2]);
    expect(map.has(rightOuter)).toBe(true);
  });

  it('does not add segments for a polygon with fewer than 2 points', () => {
    const map = new Map<string, Segment>();
    addPolygonSegments(map, [{ x: 0, y: 0 }]);
    expect(map.size).toBe(0);
    addPolygonSegments(map, []);
    expect(map.size).toBe(0);
  });

  it('wraps around and adds a closing edge for a polygon', () => {
    // A triangle: 3 points → 3 segments including the closing edge
    const triangle = [
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 8, y: 16 },
    ];
    const map = new Map<string, Segment>();
    addPolygonSegments(map, triangle);
    // 3 edges: (0→1), (1→2), (2→0)
    expect(map.size).toBe(3);
    // Closing edge (2→0) should exist
    const closingKey = makeSegmentKey(triangle[2], triangle[0]);
    expect(map.has(closingKey)).toBe(true);
  });
});
