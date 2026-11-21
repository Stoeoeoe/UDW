import { useEffect, useRef } from 'react';
import type { KitPiece, PixelSheet } from '../../../lib/buildings/resolveKit';
import { canvasOf } from '../../../lib/buildings/render';

/** One kit piece at an integer scale: its base, then the variation's pixels over it when there are any. */
export function KitPieceCanvas({
  piece,
  variation,
  scale = 3,
}: {
  piece: KitPiece;
  variation: string | null;
  scale?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    const draw = (sheet: PixelSheet) =>
      context.drawImage(canvasOf(sheet), 0, 0, sheet.width * scale, sheet.height * scale);
    draw(piece.base);
    const over = variation ? piece.variations.get(variation) : undefined;
    if (over) draw(over);
  }, [piece, variation, scale]);
  // Plain width and height attributes size the drawing surface; as style props they would only stretch it.
  return <canvas ref={ref} width={piece.base.width * scale} height={piece.base.height * scale} />;
}
