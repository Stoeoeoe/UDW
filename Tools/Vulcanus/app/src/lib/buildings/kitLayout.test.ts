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

  it('has every piece the building rules use, with openings, the chimney and stairs as the overlays', () => {
    const names = new Set(KIT_LAYOUT.map((slot) => slot.name));
    for (const name of [
      'roof_ridge_l',
      'roof_slope_m',
      'roof_eave_r',
      'wall_top_l',
      'wall_mid_m',
      'wall_base_r',
      'door_lintel_l',
      'door_lintel_r',
      'door_upper_l',
      'door_upper_r',
      'door_middle_l',
      'door_middle_r',
      'door_lower_l',
      'door_lower_r',
      'window_small',
      'window_medium_top_l',
      'window_medium_top_r',
      'window_medium_bottom_l',
      'window_medium_bottom_r',
      'window_large_top_l',
      'window_large_top_r',
      'window_large_middle_l',
      'window_large_middle_r',
      'window_large_bottom_l',
      'window_large_bottom_r',
      'chimney_top',
      'chimney_bottom',
      'wall_face_1_l',
      'wall_face_4_r',
      'door_face_1',
      'door_face_4',
      'wall_window_small',
      'wall_window_medium_top',
      'wall_window_large_4',
      'threshold',
      'entrance_mat',
      'window_cap',
      'floor_boards',
      'floor_tiles',
      'wall_cap_00',
      'wall_cap_15',
      'wall_band_m',
      'gable_ridge',
      'gable_peak',
      'gable_apex',
      'gable_back_l',
      'gable_roof_r',
      'gable_edge_l',
      'gable_wall',
      'stairs_up',
      'stairs_down',
    ])
      expect(names.has(name), name).toBe(true);
    // Openings, the chimney and stairs are drawn over the piece below them.
    expect(
      KIT_LAYOUT.filter((slot) => slot.overlay).every((slot) =>
        /^(door_(lintel|upper|middle|lower)|window_|wall_window_|chimney_|stairs_)/.test(slot.name),
      ),
    ).toBe(true);
    expect(KIT_LAYOUT.filter((slot) => slot.overlay)).toHaveLength(30);
  });
});
