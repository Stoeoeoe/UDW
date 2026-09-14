import { describe, it, expect } from 'vitest';
import {
  clamp01,
  FULL_TILE_POLYGON,
  normalizeTilePoint,
  normalizePolygonPoints,
  isValidPolygon,
  shapeToNormalizedPolygon,
  getPolygonFromCollision,
  buildPolygonCollision,
} from './collisionUtils';

describe('collisionUtils', () => {
  it('clamps values between 0 and 1', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
  });

  it('normalizes pixel-like tile points and keeps normalized values', () => {
    const p1 = normalizeTilePoint([8, 16], 16, 16);
    expect(p1[0]).toBeCloseTo(0.5);
    expect(p1[1]).toBeCloseTo(1);

    const p2 = normalizeTilePoint([0.25, 0.75], 16, 16);
    expect(p2[0]).toBeCloseTo(0.25);
    expect(p2[1]).toBeCloseTo(0.75);
  });

  it('dedupes consecutive identical points and removes closing duplicate', () => {
    const pts = [
      [0, 0],
      [0.5, 0.5],
      [0.5, 0.5],
      [0, 0],
    ];
    const norm = normalizePolygonPoints(pts, 16, 16);
    expect(norm.length).toBe(2);
    expect(norm[0][0]).toBeCloseTo(0);
  });

  it('validates polygons by vertex count and area', () => {
    expect(isValidPolygon([])).toBe(false);
    expect(
      isValidPolygon([
        [0, 0],
        [1, 1],
      ]),
    ).toBe(false);

    // Colinear points produce near-zero area
    expect(
      isValidPolygon([
        [0, 0],
        [0.5, 0.5],
        [1, 1],
      ]),
    ).toBe(false);

    // Simple triangle is valid
    expect(
      isValidPolygon([
        [0, 0],
        [1, 0],
        [0, 1],
      ]),
    ).toBe(true);
  });

  it('converts polygon shape points to normalized polygon', () => {
    const shape = {
      type: 'polygon',
      points: [
        [0, 0],
        [8, 0],
        [8, 8],
      ],
    };
    const poly = shapeToNormalizedPolygon(shape, 16, 16);
    expect(poly.length).toBeGreaterThan(0);
    expect(poly[1][0]).toBeCloseTo(8 / 16);
  });

  it('returns full tile polygon for full collision', () => {
    const poly = getPolygonFromCollision({ type: 'full' }, 16, 16);
    expect(poly).toEqual(FULL_TILE_POLYGON.map((p) => [p[0], p[1]]));
  });

  it('builds a complex collision definition from normalized points', () => {
    const pts = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    const col = buildPolygonCollision(pts);
    expect(col.type).toBe('complex');
    expect(col.shapes?.[0]?.type).toBe('polygon');
    expect(col.shapes?.[0]?.points).toBe(pts);
  });
});
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
    expect(getPolygonFromCollision({ type: 'full' }, 16, 16)).toEqual(FULL_TILE_POLYGON);
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
