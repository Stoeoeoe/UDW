/**
 * Which layers of an Aseprite file are shown, taking hidden groups into account. `@pixelation/aseprite` keeps each
 * layer's own visible flag but drops the nesting, so a visible layer inside a hidden group would still be drawn.
 * This reads the layer chunks of the first frame (file format: github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md).
 */

const HEADER_SIZE = 128;
const FRAME_HEADER_SIZE = 16;
const LAYER_CHUNK = 0x2004;
const VISIBLE_FLAG = 1;

/** One entry per layer chunk, in file order (the order of `frame.layers`): whether the layer is shown. */
export function asepriteLayerVisibility(buffer: ArrayBuffer): boolean[] {
  const view = new DataView(buffer);
  if (view.byteLength < HEADER_SIZE + FRAME_HEADER_SIZE || view.getUint16(4, true) !== 0xa5e0)
    throw new Error('Not an Aseprite file.');
  const frameStart = HEADER_SIZE;
  const oldChunkCount = view.getUint16(frameStart + 6, true);
  const newChunkCount = view.getUint32(frameStart + 12, true);
  const chunkCount = newChunkCount || oldChunkCount;

  // The visibility of the group at each nesting level, for the layers below it.
  const shownAtLevel: boolean[] = [];
  const visibility: boolean[] = [];
  let offset = frameStart + FRAME_HEADER_SIZE;
  for (let chunk = 0; chunk < chunkCount; chunk++) {
    const size = view.getUint32(offset, true);
    const type = view.getUint16(offset + 4, true);
    if (size < 6 || offset + size > view.byteLength)
      throw new Error(`Damaged Aseprite chunk at byte ${offset}.`);
    if (type === LAYER_CHUNK) {
      const flags = view.getUint16(offset + 6, true);
      const level = view.getUint16(offset + 10, true);
      const shown = (flags & VISIBLE_FLAG) !== 0 && (level === 0 || shownAtLevel[level - 1]);
      shownAtLevel[level] = shown;
      shownAtLevel.length = level + 1;
      visibility.push(shown);
    }
    offset += size;
  }
  return visibility;
}
