import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validateConfig } from './config.js';
import { inspectMidi, readMidi, stemMidi, usedPatches } from './midi.js';
import { FluidSynthRenderer, type Renderer } from './renderer.js';
import { cropWav, fadeOutWav, readWav, wrapTailWav } from './wav.js';
import { hashFile, readSoundFont, selectPreset } from './soundfont.js';

export { inspectMidi, readMidi, validateConfig, FluidSynthRenderer };
export type { Renderer, RenderRequest } from './renderer.js';
export type { RenderConfig } from './config.js';
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

export async function renderStems(options: {
  midiPath: string; config: unknown; configDirectory: string; outputDirectory: string; renderer?: Renderer;
}) {
  const bytes = await readFile(options.midiPath);
  const midi = readMidi(bytes);
  const { config, timing } = validateConfig(options.config, midi);
  const soundFont = path.resolve(options.configDirectory, config.soundFont);
  const resolved = { ...config, soundFont, stems: config.stems.map(s => ({ id: s.id, name: s.name, tracks: s.tracks,
    soundFont: path.resolve(options.configDirectory, s.soundFont ?? config.soundFont), instruments: s.instruments })) };
  const fonts = await Promise.all([...new Set(resolved.stems.map(s => s.soundFont))].map(async file =>
    ({ file, sha256: await hashFile(file), presets: await readSoundFont(file) })));
  const output = path.resolve(options.outputDirectory);
  try { await access(output); throw new Error(`Output already exists: ${output}. Choose a new directory.`); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const renderer = options.renderer ?? new FluidSynthRenderer();
  const backend = await renderer.describe();
  await mkdir(path.dirname(output), { recursive: true });
  const stage = await mkdtemp(path.join(path.dirname(output), '.apollo-'));
  try {
    const work = path.join(stage, '.render');
    await mkdir(work);
    const stems = [];
    for (const stem of resolved.stems) {
      const font = fonts.find(f => f.file === stem.soundFont)!;
      const instruments = stem.instruments.map(selection => {
        const preset = selectPreset(font.presets, selection);
        return { channel: selection.channel, bank: preset.bank, program: preset.program, preset: preset.name };
      });
      const midiPath = path.join(work, 'render.mid');
      const outputPath = path.join(work, 'render.wav');
      const midiBytes = stemMidi(midi, stem.tracks, timing.endTick, instruments, config.loop.tail === 'wrap');
      for (const patch of usedPatches(readMidi(midiBytes))) selectPreset(font.presets, patch);
      await writeFile(midiPath, midiBytes);
      await renderer.render({ midiPath, outputPath, soundFont: stem.soundFont, sampleRate: config.sampleRate, gain: config.gain });
      const finishWav = config.loop.tail === 'wrap' ? wrapTailWav : cropWav;
      const wav = fadeOutWav(finishWav(await readFile(outputPath), config.sampleRate, timing.startFrame, timing.frames), timing.fadeFrames);
      const verified = readWav(wav);
      if (verified.frames !== timing.frames || verified.sampleRate !== config.sampleRate) throw new Error(`Invalid output for ${stem.id}.`);
      const file = `${stem.id}.wav`;
      await writeFile(path.join(stage, file), wav);
      stems.push({ id: stem.id, file, tracks: stem.tracks, instruments,
        soundFontSha256: font.sha256,
        sampleRate: verified.sampleRate, channels: verified.channels, frames: verified.frames, sha256: hash(wav) });
      await rm(midiPath); await rm(outputPath);
    }
    await rm(work, { recursive: true });
    const manifest = {
      id: config.cueId, theme: config.theme, bpm: timing.bpm, beatsPerBar: timing.beatsPerBar, loopBars: timing.loopBars,
      sampleRate: config.sampleRate, frames: timing.frames,
      loop: { ...config.loop, startTick: timing.startTick, endTick: timing.endTick,
        numerator: timing.numerator, denominator: timing.denominator },
      source: { file: 'source.mid', sha256: hash(bytes), ticksPerBeat: midi.header.ticksPerBeat },
      renderer: { ...backend, gain: config.gain, reverb: false, chorus: false, bankSelect: 'mma' },
      stems, presets: config.presets,
    };
    await writeFile(path.join(stage, 'source.mid'), bytes);
    await writeFile(path.join(stage, 'config.json'), json(resolved));
    await writeFile(path.join(stage, 'manifest.json'), json(manifest));
    await rename(stage, output);
    return manifest;
  } finally { await rm(stage, { recursive: true, force: true }); }
}
