import { describe, expect, it } from 'vitest';
import { KIT_COLUMNS, KIT_LAYOUT, KIT_ROWS } from './kitLayout';

describe('kit layout', () => {
  it('names every piece once and gives each its own cell inside the sheet', () => {
    const names = KIT_LAYOUT.map((slot) => slot.name);
    expect(new Set(names).size).toBe(names.length);
    const cells = KIT_LAYOUT.map((slot) => `${slot.column},${slot.row}`);
    expect(new Set(cells).size).toBe(cells.length);
    for (const slot of KIT_LAYOUT) {
      expect(slot.column).toBeLessThan(KIT_COLUMNS);
      expect(slot.row).toBeLessThan(KIT_ROWS);
    }
  });

  it('has every piece the building rules use, with the chimney as the only overlay', () => {
    const names = new Set(KIT_LAYOUT.map((slot) => slot.name));
    for (const name of [
      'roof_ridge_l',
      'roof_slope_m',
      'roof_eave_r',
      'wall_top_l',
      'wall_mid_m',
      'wall_base_r',
      'door_lintel',
      'door_upper',
      'door_lower',
      'window',
      'chimney_top',
      'chimney_bottom',
      'wall_face_upper_l',
      'wall_face_lower_r',
      'door_face_upper',
      'door_face_lower',
      'threshold',
      'entrance_mat',
      'window_cap',
      'floor_boards',
      'floor_tiles',
      'wall_cap_00',
      'wall_cap_15',
    ])
      expect(names.has(name), name).toBe(true);
    expect(KIT_LAYOUT.filter((slot) => slot.overlay).map((slot) => slot.name)).toEqual([
      'chimney_top',
      'chimney_bottom',
    ]);
  });
});
