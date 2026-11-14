import { describe, expect, it } from 'vitest';
import {
  countBodyPixels,
  createEmptyWaterMask,
  decodeWaterMask,
  encodeWaterMask,
  paintDisc,
  paintStroke,
  removeBodyFromBitmap,
} from './waterMask';

describe('waterMask', () => {
  it('starts empty as one run of body 0', () => {
    const mask = createEmptyWaterMask(4, 3);
    expect(mask.rle).toEqual([0, 12]);
    expect(decodeWaterMask(mask).every((pixel) => pixel === 0)).toBe(true);
  });

  it('round-trips several bodies through run-length encoding', () => {
    const bitmap = new Uint8Array([1, 1, 0, 0, 2, 2, 2, 0, 1, 1, 1, 3]);
    const mask = encodeWaterMask(bitmap, 4, 3);
    expect(mask.rle).toEqual([1, 2, 0, 2, 2, 3, 0, 1, 1, 3, 3, 1]);
    expect(Array.from(decodeWaterMask(mask))).toEqual(Array.from(bitmap));
  });

  it('paints a body and erases with 0, clipped to the map', () => {
    const bitmap = new Uint8Array(25);
    paintDisc(bitmap, 5, 5, 0, 0, 1, 2);
    // Radius 1 reaches sqrt(2): the 3x3 block around the corner, clipped to the map.
    expect(Array.from(bitmap.slice(0, 10))).toEqual([2, 2, 0, 0, 0, 2, 2, 0, 0, 0]);
    paintDisc(bitmap, 5, 5, 0, 0, 0, 0);
    expect(bitmap[0]).toBe(0);
    expect(bitmap[1]).toBe(2);
  });

  it('lets a later body overwrite an earlier one', () => {
    const bitmap = new Uint8Array(9);
    paintDisc(bitmap, 3, 3, 1, 1, 1, 1);
    paintDisc(bitmap, 3, 3, 1, 1, 0, 2);
    expect(bitmap[4]).toBe(2);
    expect(bitmap[0]).toBe(1);
  });

  it('leaves no gaps in a fast stroke', () => {
    const bitmap = new Uint8Array(20 * 5);
    paintStroke(bitmap, 20, 5, 1, 2, 18, 2, 0, 1);
    for (let x = 1; x <= 18; x++) expect(bitmap[2 * 20 + x]).toBe(1);
    expect(bitmap[2 * 20]).toBe(0);
    expect(bitmap[2 * 20 + 19]).toBe(0);
  });

  it('removing a body clears it and renumbers the bodies after it', () => {
    const bitmap = new Uint8Array([1, 2, 3, 0, 2, 3]);
    removeBodyFromBitmap(bitmap, 2);
    expect(Array.from(bitmap)).toEqual([1, 0, 2, 0, 0, 2]);
  });

  it('counts the pixels of every body', () => {
    expect(countBodyPixels(new Uint8Array([0, 1, 1, 2, 0]), 2)).toEqual([2, 2, 1]);
  });
});
