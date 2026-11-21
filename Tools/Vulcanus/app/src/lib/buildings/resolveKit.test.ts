import { describe, expect, it } from 'vitest';
import { KIT_LAYOUT, KIT_SHEET_HEIGHT, KIT_SHEET_WIDTH, KIT_TILE } from './kitLayout';
import { resolveKit, type PixelSheet } from './resolveKit';

/** A sheet with one opaque pixel in the cell of every named piece. */
function sheet(
  names: Iterable<string>,
  width = KIT_SHEET_WIDTH,
  height = KIT_SHEET_HEIGHT,
): PixelSheet {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const name of names) {
    const slot = KIT_LAYOUT.find((entry) => entry.name === name)!;
    const at = ((slot.row * KIT_TILE + 5) * width + slot.column * KIT_TILE + 5) * 4;
    data.set([200, 100, 50, 255], at);
  }
  return { width, height, data };
}

const required = KIT_LAYOUT.filter((slot) => !slot.optional).map((slot) => slot.name);

describe('resolving a kit', () => {
  it('cuts every drawn piece and keeps variation pixels only where they draw something', () => {
    const kit = resolveKit(sheet([...required, 'floor_tiles']), {
      winter: sheet(['roof_slope_m', 'chimney_top']),
    });
    expect(kit.empty).toEqual([]);
    expect(kit.problems).toEqual([]);
    expect(kit.floors).toEqual(['floor_tiles']);
    expect(kit.variationIds).toEqual(['winter']);
    expect([...kit.pieces.get('roof_slope_m')!.variations.keys()]).toEqual(['winter']);
    expect(kit.pieces.get('wall_mid_m')!.variations.size).toBe(0);
    const pixel = kit.pieces
      .get('door_upper_l')!
      .base.data.slice((5 * KIT_TILE + 5) * 4, (5 * KIT_TILE + 6) * 4);
    expect([...pixel]).toEqual([200, 100, 50, 255]);
  });

  it('lists required pieces with nothing drawn, and a kit without any floor', () => {
    const kit = resolveKit(sheet(required.filter((name) => name !== 'threshold')), {});
    expect(kit.empty).toEqual(['threshold']);
    expect(kit.problems).toEqual(['The kit needs at least one floor.']);
  });

  it('reports sheets smaller than the layout and ignores a variation that does not fit', () => {
    const kit = resolveKit(sheet([...required, 'floor_boards']), {
      winter: sheet([], 64, 64),
    });
    expect(kit.problems).toEqual([
      `The winter sheet is 64 × 64 px; the kit layout needs ${KIT_SHEET_WIDTH} × ${KIT_SHEET_HEIGHT} px.`,
    ]);
    expect(kit.variationIds).toEqual([]);
    expect(resolveKit(sheet([], 32, 32), {}).problems[0]).toContain('The base sheet is 32 × 32 px');
  });
});
