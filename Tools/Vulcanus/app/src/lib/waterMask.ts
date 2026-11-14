import type { WaterMask } from '../types/schema';
import { bresenhamLine } from './algorithms';

/** An empty mask (no water) for a map of the given pixel size. */
export function createEmptyWaterMask(width: number, height: number): WaterMask {
  return { width, height, rle: [0, width * height] };
}

/** Expands the run-length mask into one byte per pixel: 0 is empty, n is body n (1-based). */
export function decodeWaterMask(mask: WaterMask): Uint8Array {
  const bitmap = new Uint8Array(mask.width * mask.height);
  let position = 0;
  for (let i = 0; i < mask.rle.length; i += 2) {
    const run = mask.rle[i + 1];
    if (mask.rle[i] !== 0) bitmap.fill(mask.rle[i], position, position + run);
    position += run;
  }
  return bitmap;
}

/** Run-length encodes a one-byte-per-pixel bitmap as [value, run] pairs. */
export function encodeWaterMask(bitmap: Uint8Array, width: number, height: number): WaterMask {
  const rle: number[] = [];
  let value = bitmap.length > 0 ? bitmap[0] : 0;
  let run = 0;
  for (let i = 0; i < bitmap.length; i++) {
    if (bitmap[i] !== value) {
      rle.push(value, run);
      value = bitmap[i];
      run = 0;
    }
    run++;
  }
  rle.push(value, run);
  return { width, height, rle };
}

/**
 * Sets a round pixel brush centred on a pixel to a body (0 erases). Radius 0 is a single pixel; larger
 * radii include pixels within sqrt(r² + r) of the centre, which keeps small brushes round.
 */
export function paintDisc(
  bitmap: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  value: number,
): void {
  const reach = radius * radius + radius;
  for (let y = Math.max(0, cy - radius); y <= Math.min(height - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(width - 1, cx + radius); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= reach) bitmap[y * width + x] = value;
    }
  }
}

/** Paints a continuous stroke between two pixels, so fast pointer moves leave no gaps. */
export function paintStroke(
  bitmap: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  value: number,
): void {
  for (const point of bresenhamLine(x0, y0, x1, y1)) {
    paintDisc(bitmap, width, height, point.x, point.y, radius, value);
  }
}

/** Clears one body's pixels and renumbers the bodies after it, matching its removal from the list. */
export function removeBodyFromBitmap(bitmap: Uint8Array, bodyValue: number): void {
  for (let i = 0; i < bitmap.length; i++) {
    if (bitmap[i] === bodyValue) bitmap[i] = 0;
    else if (bitmap[i] > bodyValue) bitmap[i]--;
  }
}

/** Number of pixels each body value covers; index 0 is empty. */
export function countBodyPixels(bitmap: Uint8Array, bodyCount: number): number[] {
  const counts = new Array<number>(bodyCount + 1).fill(0);
  for (let i = 0; i < bitmap.length; i++) counts[bitmap[i]]++;
  return counts;
}
