import type { WaterMask } from '../types/schema';
import { decodeWaterMask, encodeWaterMask } from './waterMask';

/**
 * Decoded water bitmaps, one per layer. A mask is expanded to a byte per pixel when a layer is first
 * painted or drawn, edited in place during a stroke, and run-length encoded back into the map once when
 * the stroke ends. The decoded copy is only reused while the layer still holds the mask it came from, so
 * undo, redo and map loads always win.
 */
interface Entry {
  source: WaterMask;
  bitmap: Uint8Array;
}

const entries = new Map<string, Entry>();

export function getWaterBitmap(layerId: string, mask: WaterMask): Uint8Array {
  const entry = entries.get(layerId);
  if (entry && entry.source === mask) return entry.bitmap;
  const bitmap = decodeWaterMask(mask);
  entries.set(layerId, { source: mask, bitmap });
  return bitmap;
}

/** Encodes the layer's current bitmap and remembers it as the mask the layer will now hold. */
export function commitWaterBitmap(layerId: string, mask: WaterMask): WaterMask {
  const entry = entries.get(layerId);
  if (!entry) throw new Error(`No water bitmap is being edited for layer '${layerId}'.`);
  const committed = encodeWaterMask(entry.bitmap, mask.width, mask.height);
  entry.source = committed;
  return committed;
}
