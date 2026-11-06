import { describe, expect, it } from 'vitest';
import type { FlowStroke } from '../types/schema';
import { appendStrokePoint, distanceToStroke, simplifyStroke, strokeLength } from './waterFlow';

const stroke = (points: [number, number][]): FlowStroke => ({
  id: 's',
  points,
  width: 8,
  speed: 1,
});

describe('waterFlow', () => {
  it('measures a polyline', () => {
    expect(
      strokeLength([
        [0, 0],
        [3, 4],
        [3, 10],
      ]),
    ).toBe(11);
  });

  it('finds the distance to the nearest segment, not just the nearest vertex', () => {
    const line = stroke([
      [0, 0],
      [10, 0],
    ]);
    expect(distanceToStroke([5, 3], line)).toBe(3);
    expect(distanceToStroke([-4, 3], line)).toBe(5);
  });

  it('simplifies a wobbly line but keeps real corners', () => {
    const wobbly: [number, number][] = [
      [0, 0],
      [5, 0.2],
      [10, -0.1],
      [15, 0],
      [15, 10],
    ];
    expect(simplifyStroke(wobbly, 1)).toEqual([
      [0, 0],
      [15, 0],
      [15, 10],
    ]);
  });

  it('ignores points that barely moved', () => {
    const points: [number, number][] = [[0, 0]];
    expect(appendStrokePoint(points, [1, 0], 3)).toBe(points);
    expect(appendStrokePoint(points, [4, 0], 3)).toEqual([
      [0, 0],
      [4, 0],
    ]);
  });
});
