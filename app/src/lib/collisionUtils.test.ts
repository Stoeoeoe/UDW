import { describe, expect, it } from 'vitest';
import {
  FULL_TILE_POLYGON,
  buildPolygonCollision,
  getPolygonFromCollision,
  isValidPolygon,
  normalizePolygonPoints,
  shapeToNormalizedPolygon,
} from './collisionUtils';

describe('collisionUtils', () => {
  it('normalizes pixel-space points to tile-local values', () => {
    const points = normalizePolygonPoints(
      [
        [0, 0],
        [16, 0],
        [16, 16],
      ],
      16,
      16,
    );

    expect(points).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
  });

  it('removes duplicate trailing closing point', () => {
    const points = normalizePolygonPoints(
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
      16,
      16,
    );

    expect(points).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
  });

  it('returns full polygon for full collision mode', () => {
    expect(getPolygonFromCollision({ type: 'full' }, 16, 16)).toEqual(
      FULL_TILE_POLYGON,
    );
  });

  it('extracts polygon collision shapes', () => {
    const collision = buildPolygonCollision([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
    const points = getPolygonFromCollision(collision, 16, 16);

    expect(points).toHaveLength(4);
    expect(isValidPolygon(points)).toBe(true);
  });

  it('normalizes shape points from pixel coords', () => {
    const points = shapeToNormalizedPolygon(
      {
        id: 'shape-1',
        type: 'polygon',
        points: [
          [0, 0],
          [8, 0],
          [8, 16],
        ],
      },
      16,
      16,
    );

    expect(points).toEqual([
      [0, 0],
      [0.5, 0],
      [0.5, 1],
    ]);
  });
});
