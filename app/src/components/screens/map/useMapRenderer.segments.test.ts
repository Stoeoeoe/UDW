import { describe, it, expect } from 'vitest';
import {
  quantizeOverlayPoint,
  addPolygonSegments,
  makeSegmentKey,
} from './useMapRenderer';

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

    const map = new Map<string, any>();
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
});
