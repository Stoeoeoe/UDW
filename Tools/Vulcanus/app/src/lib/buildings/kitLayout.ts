/**
 * The standard kit layout: where each 16 px piece sits in a kit sheet. Every kit sheet (PNG or Aseprite) uses it, so a
 * piece's name says where it is. It is the layout of docs/building-kit/kit_roman_basic.png.
 */

export const KIT_TILE = 16;
export const KIT_COLUMNS = 16;
export const KIT_ROWS = 14;

export type KitPieceGroup =
  | 'roof'
  | 'wall'
  | 'opening'
  | 'overlay'
  | 'interior-wall'
  | 'interior-opening'
  | 'floor'
  | 'wall-cap';

export interface KitPieceSlot {
  name: string;
  column: number;
  row: number;
  /** Overlays are transparent around what they show and are drawn over the piece below them. */
  overlay: boolean;
  group: KitPieceGroup;
  /** Optional pieces may stay empty; every other piece must be drawn. */
  optional: boolean;
}

const slot = (
  name: string,
  column: number,
  row: number,
  group: KitPieceGroup,
  options: { overlay?: boolean; optional?: boolean } = {},
): KitPieceSlot => ({
  name,
  column,
  row,
  group,
  overlay: options.overlay ?? false,
  optional: options.optional ?? false,
});

const sides = ['l', 'm', 'r'] as const;
const row3 = (base: string, row: number, group: KitPieceGroup) =>
  sides.map((side, column) => slot(`${base}_${side}`, column, row, group));

/** Floors beyond the two named ones are numbered until floors get names of their own. */
export const EXTRA_FLOOR_COUNT = KIT_COLUMNS - 2;

export const KIT_LAYOUT: readonly KitPieceSlot[] = [
  ...row3('roof_ridge', 0, 'roof'),
  ...row3('roof_slope', 1, 'roof'),
  ...row3('roof_eave', 2, 'roof'),
  ...row3('wall_top', 3, 'wall'),
  ...row3('wall_mid', 4, 'wall'),
  ...row3('wall_base', 5, 'wall'),
  slot('door_lintel', 4, 3, 'opening'),
  slot('door_upper', 4, 4, 'opening'),
  slot('door_lower', 4, 5, 'opening'),
  slot('window', 5, 4, 'opening'),
  slot('chimney_top', 6, 0, 'overlay', { overlay: true }),
  slot('chimney_bottom', 6, 1, 'overlay', { overlay: true }),
  ...row3('wall_face_upper', 8, 'interior-wall'),
  ...row3('wall_face_lower', 9, 'interior-wall'),
  slot('door_face_upper', 4, 8, 'interior-opening'),
  slot('door_face_lower', 4, 9, 'interior-opening'),
  slot('threshold', 5, 8, 'interior-opening'),
  slot('entrance_mat', 6, 8, 'interior-opening'),
  slot('window_cap', 7, 8, 'interior-opening'),
  slot('floor_boards', 0, 11, 'floor', { optional: true }),
  slot('floor_tiles', 1, 11, 'floor', { optional: true }),
  ...Array.from({ length: EXTRA_FLOOR_COUNT }, (_, index) =>
    slot(`floor_${index + 3}`, index + 2, 11, 'floor', { optional: true }),
  ),
  ...Array.from({ length: 16 }, (_, mask) =>
    slot(`wall_cap_${String(mask).padStart(2, '0')}`, mask, 13, 'wall-cap'),
  ),
];

export const KIT_SHEET_WIDTH = KIT_COLUMNS * KIT_TILE;
export const KIT_SHEET_HEIGHT = KIT_ROWS * KIT_TILE;
