import type { Building } from '../../types/building';
import { layoutExterior, STOREY_ROWS, type Placement } from './layout';
import { KIT_TILE } from './kitLayout';
import type { PixelSheet, ResolvedKit } from './resolveKit';

/** One piece image to draw: the piece's base, or one variation's pixels over it. */
export interface Draw {
  piece: string;
  /** `null` for the base. */
  variation: string | null;
  x: number;
  y: number;
}

/**
 * What to draw, in order: every opaque piece, then overlays; each piece's base, then the first variation in the chain
 * that the piece has (a variation's parents follow it in the chain). Pieces the kit lacks are left out.
 */
export function drawList(
  placements: readonly Placement[],
  kit: ResolvedKit,
  variationChain: readonly string[],
): Draw[] {
  const draws: Draw[] = [];
  for (const overlay of [false, true])
    for (const placement of placements) {
      if (placement.overlay !== overlay) continue;
      const piece = kit.pieces.get(placement.piece);
      if (!piece) continue;
      const x = placement.column * KIT_TILE;
      const y = placement.row * KIT_TILE;
      draws.push({ piece: placement.piece, variation: null, x, y });
      const variation = variationChain.find((id) => piece.variations.has(id));
      if (variation) draws.push({ piece: placement.piece, variation, x, y });
    }
  return draws;
}

const canvasCache = new WeakMap<PixelSheet, HTMLCanvasElement>();

/** A piece's pixels as a canvas, made once per piece image. */
export function canvasOf(sheet: PixelSheet): HTMLCanvasElement {
  let canvas = canvasCache.get(sheet);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = sheet.width;
    canvas.height = sheet.height;
    canvas
      .getContext('2d')!
      .putImageData(
        new ImageData(new Uint8ClampedArray(sheet.data), sheet.width, sheet.height),
        0,
        0,
      );
    canvasCache.set(sheet, canvas);
  }
  return canvas;
}

/** Draws a draw list at an integer scale, without smoothing. */
export function renderDraws(
  draws: readonly Draw[],
  kit: ResolvedKit,
  context: CanvasRenderingContext2D,
  scale = 1,
): void {
  context.imageSmoothingEnabled = false;
  for (const draw of draws) {
    const piece = kit.pieces.get(draw.piece)!;
    const sheet = draw.variation ? piece.variations.get(draw.variation)! : piece.base;
    context.drawImage(
      canvasOf(sheet),
      draw.x * scale,
      draw.y * scale,
      sheet.width * scale,
      sheet.height * scale,
    );
  }
}

const exteriorCache = new WeakMap<
  Building,
  Map<string, { kit: ResolvedKit; canvas: HTMLCanvasElement }>
>();

/**
 * The building's exterior at 1×, in a variation chain (empty for the base look). Made once per building revision, kit
 * and chain: an edit or a re-read kit replaces the object, and so the entry.
 */
export function exteriorCanvas(
  building: Building,
  kit: ResolvedKit,
  variationChain: readonly string[],
): HTMLCanvasElement {
  let byChain = exteriorCache.get(building);
  if (!byChain) exteriorCache.set(building, (byChain = new Map()));
  const key = variationChain.join('/');
  const cached = byChain.get(key);
  if (cached?.kit === kit) return cached.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = building.width * KIT_TILE;
  canvas.height = (building.depth + STOREY_ROWS) * KIT_TILE;
  renderDraws(
    drawList(layoutExterior(building), kit, variationChain),
    kit,
    canvas.getContext('2d')!,
  );
  byChain.set(key, { kit, canvas });
  return canvas;
}
