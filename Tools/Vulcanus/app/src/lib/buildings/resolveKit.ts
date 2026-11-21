import { KIT_LAYOUT, KIT_SHEET_HEIGHT, KIT_SHEET_WIDTH, KIT_TILE } from './kitLayout';

/** RGBA pixels, row by row: the shape of `ImageData`, so tests need no canvas. */
export interface PixelSheet {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface KitPiece {
  base: PixelSheet;
  /** Variation ID to the variation's pixels for this piece; only variations that draw something here. */
  variations: Map<string, PixelSheet>;
}

export interface ResolvedKit {
  pieces: Map<string, KitPiece>;
  /** Floor pieces that are drawn, in layout order. */
  floors: string[];
  variationIds: string[];
  /** Required pieces with nothing drawn in the base sheet. */
  empty: string[];
  problems: string[];
}

function crop(sheet: PixelSheet, x: number, y: number): PixelSheet {
  const data = new Uint8ClampedArray(KIT_TILE * KIT_TILE * 4);
  for (let row = 0; row < KIT_TILE; row++) {
    const from = ((y + row) * sheet.width + x) * 4;
    data.set(sheet.data.subarray(from, from + KIT_TILE * 4), row * KIT_TILE * 4);
  }
  return { width: KIT_TILE, height: KIT_TILE, data };
}

function drawsAnything(piece: PixelSheet): boolean {
  for (let i = 3; i < piece.data.length; i += 4) if (piece.data[i] > 0) return true;
  return false;
}

const fits = (sheet: PixelSheet) =>
  sheet.width >= KIT_SHEET_WIDTH && sheet.height >= KIT_SHEET_HEIGHT;

const sizeProblem = (label: string, sheet: PixelSheet) =>
  `The ${label} is ${sheet.width} × ${sheet.height} px; the kit layout needs ${KIT_SHEET_WIDTH} × ${KIT_SHEET_HEIGHT} px.`;

/** Cuts the base sheet and the variation sheets into the pieces of the standard kit layout. */
export function resolveKit(base: PixelSheet, variations: Record<string, PixelSheet>): ResolvedKit {
  const problems: string[] = [];
  if (!fits(base)) problems.push(sizeProblem('base sheet', base));
  const usableVariations = Object.entries(variations).filter(([id, sheet]) => {
    if (fits(sheet)) return true;
    problems.push(sizeProblem(`${id} sheet`, sheet));
    return false;
  });

  const pieces = new Map<string, KitPiece>();
  const empty: string[] = [];
  const floors: string[] = [];
  for (const slot of KIT_LAYOUT) {
    const x = slot.column * KIT_TILE;
    const y = slot.row * KIT_TILE;
    const basePiece = fits(base) ? crop(base, x, y) : null;
    if (!basePiece || !drawsAnything(basePiece)) {
      if (!slot.optional) empty.push(slot.name);
      continue;
    }
    const pieceVariations = new Map<string, PixelSheet>();
    for (const [id, sheet] of usableVariations) {
      const variationPiece = crop(sheet, x, y);
      if (drawsAnything(variationPiece)) pieceVariations.set(id, variationPiece);
    }
    pieces.set(slot.name, { base: basePiece, variations: pieceVariations });
    if (slot.group === 'floor') floors.push(slot.name);
  }
  if (fits(base) && floors.length === 0) problems.push('The kit needs at least one floor.');

  return {
    pieces,
    floors,
    variationIds: usableVariations.map(([id]) => id),
    empty,
    problems,
  };
}
