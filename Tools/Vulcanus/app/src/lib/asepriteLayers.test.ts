import { describe, expect, it } from 'vitest';
import { asepriteLayerVisibility } from './asepriteLayers';

/** A minimal Aseprite file whose first frame holds only layer chunks: [visible, child level] each. */
function aseprite(layers: [boolean, number][]): ArrayBuffer {
  const chunkSize = 6 + 18 + 2; // chunk header, layer fields, empty name
  const buffer = new ArrayBuffer(128 + 16 + layers.length * chunkSize);
  const view = new DataView(buffer);
  view.setUint16(4, 0xa5e0, true);
  view.setUint16(6, 1, true); // one frame
  view.setUint32(128, 16 + layers.length * chunkSize, true);
  view.setUint16(128 + 4, 0xf1fa, true);
  view.setUint32(128 + 12, layers.length, true);
  layers.forEach(([visible, level], index) => {
    const at = 128 + 16 + index * chunkSize;
    view.setUint32(at, chunkSize, true);
    view.setUint16(at + 4, 0x2004, true);
    view.setUint16(at + 6, visible ? 1 : 0, true);
    view.setUint16(at + 10, level, true);
  });
  return buffer;
}

describe('Aseprite layer visibility', () => {
  it('hides the layers inside a hidden group, however deep', () => {
    expect(
      asepriteLayerVisibility(
        aseprite([
          [true, 0], // kit
          [false, 0], // variations (group, hidden)
          [true, 1], //   winter
          [true, 1], //   nested group
          [true, 2], //     autumn
          [true, 0], // after the group
        ]),
      ),
    ).toEqual([true, false, false, false, false, true]);
  });

  it('keeps hidden layers hidden in a visible group', () => {
    expect(
      asepriteLayerVisibility(
        aseprite([
          [true, 0],
          [false, 1],
          [true, 1],
        ]),
      ),
    ).toEqual([true, false, true]);
  });

  it('refuses a file that is not Aseprite', () => {
    expect(() => asepriteLayerVisibility(new ArrayBuffer(200))).toThrow('Not an Aseprite file.');
  });
});
