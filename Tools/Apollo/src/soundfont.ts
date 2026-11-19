import { open } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';

export type SoundFontPreset = { name: string; bank: number; program: number };
export async function hashFile(file: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

// Read the preset headers by seeking through RIFF chunks, not loading the sample
// pool into memory. The supplied fonts can contain hundreds of MB of samples.
export async function readSoundFont(file: string): Promise<SoundFontPreset[]> {
  const handle = await open(file, 'r');
  try {
    const length = (await handle.stat()).size;
    async function read(position: number, size: number) {
      const buffer = Buffer.alloc(size);
      if (position + size > length || (await handle.read(buffer, 0, size, position)).bytesRead !== size)
        throw new Error(`Truncated SoundFont: ${file}`);
      return buffer;
    }
    const header = await read(0, 12);
    if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'sfbk' || header.readUInt32LE(4) + 8 !== length)
      throw new Error(`Expected an SF2/SF3 RIFF SoundFont: ${file}`);
    for (let offset = 12; offset + 8 <= length;) {
      const chunk = await read(offset, 8);
      const size = chunk.readUInt32LE(4), end = offset + 8 + size;
      if (end > length) throw new Error(`Truncated SoundFont chunk: ${file}`);
      if (chunk.toString('ascii', 0, 4) === 'LIST' && size >= 4 && (await read(offset + 8, 4)).toString() === 'pdta') {
        for (let position = offset + 12; position + 8 <= end;) {
          const sub = await read(position, 8), count = sub.readUInt32LE(4);
          if (position + 8 + count > end) throw new Error(`Invalid SoundFont preset data: ${file}`);
          if (sub.toString('ascii', 0, 4) === 'phdr') {
            if (count < 76 || count % 38 !== 0) throw new Error(`Invalid SoundFont preset headers: ${file}`);
            const data = await read(position + 8, count);
            const presets: SoundFontPreset[] = [];
            for (let i = 0; i < count - 38; i += 38)
              presets.push({ name: data.toString('latin1', i, i + 20).split('\0')[0].trim(),
                program: data.readUInt16LE(i + 20), bank: data.readUInt16LE(i + 22) });
            return presets;
          }
          position += 8 + count + (count % 2);
        }
      }
      offset = end + (size % 2);
    }
    throw new Error(`SoundFont has no preset headers: ${file}`);
  } finally { await handle.close(); }
}

export function selectPreset(presets: SoundFontPreset[], selection: { preset: string } | { bank: number; program: number }) {
  const found = presets.filter(p => 'preset' in selection ? p.name === selection.preset : p.bank === selection.bank && p.program === selection.program);
  if (found.length !== 1) throw new Error(`SoundFont instrument ${JSON.stringify(selection)} has ${found.length} matches. Select a unique preset name or explicit bank/program.`);
  return found[0];
}
