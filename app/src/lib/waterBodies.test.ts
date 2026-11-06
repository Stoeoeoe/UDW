import { describe, expect, it } from 'vitest';
import type { PropertyDefinition } from '../types/schema';
import {
  createWaterBody,
  getWaterTypeOptions,
  isWaterPaintTool,
  isWaterTool,
  nextWaterBodyName,
  waterBodyColor,
  waterBodyValue,
} from './waterBodies';

describe('waterBodies', () => {
  const bodies = [
    createWaterBody('a', 'Water 1', 'Lake_1'),
    createWaterBody('b', 'Water 2', 'Ocean_1'),
  ];

  it('maps the selected body to its mask value', () => {
    expect(waterBodyValue(bodies, 'a')).toBe(1);
    expect(waterBodyValue(bodies, 'b')).toBe(2);
    expect(waterBodyValue(bodies, null)).toBe(0);
    expect(waterBodyValue(bodies, 'gone')).toBe(0);
    expect(waterBodyValue(undefined, 'a')).toBe(0);
  });

  it('knows which tools belong to water', () => {
    for (const tool of ['waterBrush', 'waterErase', 'waterFlow', 'waterFlowErase'] as const) {
      expect(isWaterTool(tool)).toBe(true);
    }
    expect(isWaterPaintTool('waterBrush')).toBe(true);
    expect(isWaterPaintTool('waterFlow')).toBe(false);
    expect(isWaterTool('stamp')).toBe(false);
  });

  it('offers the waterType property options without None', () => {
    const definitions = [
      { key: 'other', constraints: { options: ['x'] } },
      { key: 'waterType', constraints: { options: ['None', 'Ocean_1', 'Lake_1'] } },
    ] as unknown as PropertyDefinition[];
    expect(getWaterTypeOptions(definitions)).toEqual(['Ocean_1', 'Lake_1']);
    expect(getWaterTypeOptions([])).toEqual([]);
  });

  it('names new bodies without reusing a name', () => {
    expect(nextWaterBodyName([])).toBe('Water 1');
    expect(nextWaterBodyName(bodies)).toBe('Water 3');
    expect(nextWaterBodyName([createWaterBody('x', 'Water 2', 'Lake_1')])).toBe('Water 3');
  });

  it('cycles overlay colours for many bodies', () => {
    expect(waterBodyColor(0)).not.toBe(waterBodyColor(1));
    expect(waterBodyColor(8)).toBe(waterBodyColor(0));
  });
});
