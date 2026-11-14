import { describe, it, expect } from 'vitest';
import {
  bresenhamLine,
  circularBrush,
  filledRect,
  filledCircle,
  floodFillCollect,
} from './algorithms';

describe('bresenhamLine', () => {
  it('should generate a horizontal line', () => {
    const points = [...bresenhamLine(0, 0, 4, 0)];
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ]);
  });

  it('should generate a vertical line', () => {
    const points = [...bresenhamLine(2, 1, 2, 4)];
    expect(points).toEqual([
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 2, y: 4 },
    ]);
  });

  it('should generate a diagonal line', () => {
    const points = [...bresenhamLine(0, 0, 3, 3)];
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
  });

  it('should work in reverse direction', () => {
    const points = [...bresenhamLine(3, 3, 0, 0)];
    expect(points).toEqual([
      { x: 3, y: 3 },
      { x: 2, y: 2 },
      { x: 1, y: 1 },
      { x: 0, y: 0 },
    ]);
  });

  it('should handle single point', () => {
    const points = [...bresenhamLine(5, 5, 5, 5)];
    expect(points).toEqual([{ x: 5, y: 5 }]);
  });
});

describe('circularBrush', () => {
  it('should yield single tile for radius 1', () => {
    const points = [...circularBrush(5, 5, 1)];
    expect(points).toEqual([{ x: 5, y: 5 }]);
  });

  it('should yield a 3x3 area for radius 2', () => {
    const points = [...circularBrush(5, 5, 2)];
    // Radius 2 should include points within distance 1 of center
    expect(points.length).toBe(5); // cross pattern
    expect(points).toContainEqual({ x: 5, y: 5 });
    expect(points).toContainEqual({ x: 4, y: 5 });
    expect(points).toContainEqual({ x: 6, y: 5 });
    expect(points).toContainEqual({ x: 5, y: 4 });
    expect(points).toContainEqual({ x: 5, y: 6 });
  });

  it('should yield larger area for radius 3', () => {
    const points = [...circularBrush(5, 5, 3)];
    // Radius 3 should include all points within distance 2 of center
    expect(points.length).toBe(13);
    expect(points).toContainEqual({ x: 5, y: 5 }); // center
    expect(points).toContainEqual({ x: 3, y: 5 }); // left edge
    expect(points).toContainEqual({ x: 7, y: 5 }); // right edge
  });
});

describe('filledRect', () => {
  it('should fill a rectangle', () => {
    const points = [...filledRect(0, 0, 2, 1)];
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  it('should handle inverted coordinates', () => {
    const points = [...filledRect(2, 2, 0, 0)];
    expect(points.length).toBe(9);
    expect(points).toContainEqual({ x: 0, y: 0 });
    expect(points).toContainEqual({ x: 2, y: 2 });
  });

  it('should handle single cell', () => {
    const points = [...filledRect(3, 3, 3, 3)];
    expect(points).toEqual([{ x: 3, y: 3 }]);
  });
});

describe('filledCircle', () => {
  it('should fill a circle', () => {
    const points = [...filledCircle(5, 5, 1)];
    expect(points.length).toBe(5);
    expect(points).toContainEqual({ x: 5, y: 5 });
  });

  it('should fill a larger circle', () => {
    const points = [...filledCircle(5, 5, 2)];
    // All points within distance 2 of center
    expect(points.length).toBe(13);
  });
});

describe('floodFillCollect', () => {
  it('should collect connected positions', () => {
    // Create a simple 5x5 grid with a region to fill
    const grid = [
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [1, 1, 1, 1, 1],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
    ];

    const shouldFill = (x: number, y: number) => grid[y]?.[x] === 1;
    const result = floodFillCollect(2, 2, 5, 5, shouldFill);

    // Should collect all 1s (cross pattern)
    expect(result.length).toBe(9);
    expect(result).toContainEqual({ x: 2, y: 0 });
    expect(result).toContainEqual({ x: 2, y: 4 });
    expect(result).toContainEqual({ x: 0, y: 2 });
    expect(result).toContainEqual({ x: 4, y: 2 });
  });

  it('should not cross boundaries', () => {
    const grid = [
      [1, 1, 0, 1, 1],
      [1, 1, 0, 1, 1],
    ];

    const shouldFill = (x: number, y: number) => grid[y]?.[x] === 1;
    const result = floodFillCollect(0, 0, 5, 2, shouldFill);

    // Should only collect the left region
    expect(result.length).toBe(4);
    expect(result).toContainEqual({ x: 0, y: 0 });
    expect(result).toContainEqual({ x: 1, y: 0 });
    expect(result).toContainEqual({ x: 0, y: 1 });
    expect(result).toContainEqual({ x: 1, y: 1 });
    // Should not include right side
    expect(result).not.toContainEqual({ x: 3, y: 0 });
  });

  it('should handle empty fill', () => {
    const shouldFill = () => false;
    const result = floodFillCollect(0, 0, 5, 5, shouldFill);
    expect(result).toEqual([]);
  });

  it('should handle single cell', () => {
    const shouldFill = (x: number, y: number) => x === 2 && y === 2;
    const result = floodFillCollect(2, 2, 5, 5, shouldFill);
    expect(result).toEqual([{ x: 2, y: 2 }]);
  });

  it('should respect grid bounds', () => {
    const shouldFill = () => true;
    const result = floodFillCollect(0, 0, 3, 3, shouldFill);
    expect(result.length).toBe(9);
    // All positions should be within bounds
    for (const pos of result) {
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.x).toBeLessThan(3);
      expect(pos.y).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeLessThan(3);
    }
  });
});
