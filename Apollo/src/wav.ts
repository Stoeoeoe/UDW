export function readWav(bytes: Buffer) {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE' || bytes.length < 12)
    throw new Error('Renderer did not produce a RIFF WAV.');
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) throw new Error('Truncated or malformed WAV container.');
  let format: { channels: number; sampleRate: number; blockAlign: number } | undefined;
  let data: Buffer | undefined;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const name = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > bytes.length) throw new Error('Truncated WAV chunk.');
    if (name === 'fmt ') {
      if (size < 16 || bytes.readUInt16LE(start) !== 1 || bytes.readUInt16LE(start + 14) !== 16)
        throw new Error('Renderer WAV must use 16-bit integer PCM.');
      const channels = bytes.readUInt16LE(start + 2);
      const sampleRate = bytes.readUInt32LE(start + 4);
      const blockAlign = bytes.readUInt16LE(start + 12);
      if (channels !== 2 || blockAlign !== 4 || bytes.readUInt32LE(start + 8) !== sampleRate * blockAlign)
        throw new Error('Renderer WAV must use valid stereo PCM.');
      format = { channels, sampleRate, blockAlign };
    }
    if (name === 'data') {
      if (data) throw new Error('Multiple WAV data chunks are unsupported.');
      data = bytes.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
  }
  if (!format || !data || data.length % format.blockAlign) throw new Error('Missing or invalid WAV format/data.');
  return { ...format, data, frames: data.length / format.blockAlign };
}

export function pcmWav(data: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 4, 28);
  header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export function cropWav(bytes: Buffer, sampleRate: number, startFrame: number, frames: number) {
  const wav = readWav(bytes);
  if (wav.sampleRate !== sampleRate) throw new Error(`Renderer sample rate ${wav.sampleRate} differs from ${sampleRate}.`);
  if (wav.frames < startFrame + frames) throw new Error(`Renderer output is too short: ${wav.frames} frames, need ${startFrame + frames}.`);
  return pcmWav(wav.data.subarray(startFrame * 4, (startFrame + frames) * 4), sampleRate);
}

export function wrapTailWav(bytes: Buffer, sampleRate: number, startFrame: number, frames: number) {
  const output = cropWav(bytes, sampleRate, startFrame, frames);
  const source = readWav(bytes);
  const result = readWav(output);
  // Add the release after the musical endpoint to the beginning of the loop.
  // Never stretch the bar grid or normalize individual stems to conceal clipping.
  for (let frame = startFrame + frames; frame < source.frames; frame++) {
    const target = (frame - startFrame) % frames;
    for (let channel = 0; channel < 2; channel++) {
      const offset = target * 4 + channel * 2;
      const sample = result.data.readInt16LE(offset) + source.data.readInt16LE(frame * 4 + channel * 2);
      if (sample < -32768 || sample > 32767) throw new Error('Wrapped tail clips PCM audio. Reduce export gain.');
      result.data.writeInt16LE(sample, offset);
    }
  }
  return output;
}

// The export boundary validates fadeFrames against the configured loop length.
// Apply one envelope to both channels of every stem without changing timing.
export function fadeOutWav(bytes: Buffer, fadeFrames: number) {
  if (fadeFrames === 0) return bytes;
  const wav = readWav(bytes);
  for (let frame = 0; frame < fadeFrames; frame++) {
    const gain = fadeFrames === 1 ? 0 : (fadeFrames - 1 - frame) / (fadeFrames - 1);
    for (let channel = 0; channel < 2; channel++) {
      const offset = (wav.frames - fadeFrames + frame) * 4 + channel * 2;
      wav.data.writeInt16LE(Math.round(wav.data.readInt16LE(offset) * gain), offset);
    }
  }
  return bytes;
}
