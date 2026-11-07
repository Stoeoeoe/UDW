import { z } from 'zod';
import type { MidiData } from 'midi-file';
import { inspectMidi, isGmSystemOn, timeline } from './midi.js';

const index = z.number().int().nonnegative();
const id = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/);
export const configSchema = z.strictObject({
  cueId: z.string().regex(/^[a-z0-9][a-z0-9_-]*:[a-z0-9][a-z0-9_-]*$/),
  theme: z.string().regex(/^[a-z0-9][a-z0-9_-]*:[a-z0-9][a-z0-9_-]*$/).optional(),
  soundFont: z.string().min(1),
  sampleRate: z.number().int().min(8000).max(96000).default(48000),
  gain: z.number().min(0).max(10).default(0.2),
  loop: z.strictObject({ startBar: z.number().int().positive().default(1), endBar: z.number().int().positive(),
    tail: z.enum(['cut', 'wrap']).default('cut'), fadeOutSeconds: z.number().nonnegative().default(0) }),
  ignoreTracks: z.array(index).default([]),
  stems: z.array(z.strictObject({
    id, name: z.string().optional(), tracks: z.array(index).min(1), soundFont: z.string().min(1).optional(),
    instruments: z.array(z.union([
      z.strictObject({ channel: index.max(15), preset: z.string().min(1) }),
      z.strictObject({ channel: index.max(15), program: index.max(127), bank: index.max(16383).default(0) }),
    ])).default([]),
  })).min(1),
  presets: z.array(z.strictObject({ id, gains: z.array(z.strictObject({ stem: id, gain: z.number().min(0).max(1) })).min(1) })).min(1).optional(),
});
export type RenderConfig = z.infer<typeof configSchema>;

function unique(values: (string | number)[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}

export function validateConfig(input: unknown, midi: MidiData) {
  const config = configSchema.parse(input);
  unique(config.stems.map(s => s.id), 'Stem IDs');
  const assigned = config.stems.flatMap(s => s.tracks);
  unique([...assigned, ...config.ignoreTracks], 'Track assignments (including ignored tracks)');
  const inspection = inspectMidi(midi);
  for (const track of [...assigned, ...config.ignoreTracks])
    if (!inspection.tracks[track]) throw new Error(`Track ${track} does not exist.`);
  for (const track of inspection.tracks)
    if (track.notes && ![...assigned, ...config.ignoreTracks].includes(track.index))
      throw new Error(`Note track ${track.index} must belong to a stem or ignoreTracks.`);
  for (const stem of config.stems) {
    if (!stem.tracks.some(t => inspection.tracks[t].notes > 0)) throw new Error(`Stem ${stem.id} contains no note tracks.`);
    unique(stem.instruments.map(o => o.channel), `Instrument override channels in ${stem.id}`);
  }
  if (config.loop.endBar <= config.loop.startBar) throw new Error('loop.endBar must follow startBar (exclusive endpoint).');
  const events = timeline(midi);
  const initialTempo = events.find(e => e.tick === 0 && e.event.type === 'setTempo')?.event;
  const us = initialTempo?.type === 'setTempo' ? initialTempo.microsecondsPerBeat : 500000;
  const initialMeter = events.find(e => e.tick === 0 && e.event.type === 'timeSignature')?.event;
  const numerator = initialMeter?.type === 'timeSignature' ? initialMeter.numerator : 4;
  const denominator = initialMeter?.type === 'timeSignature' ? initialMeter.denominator : 4;
  const beatsPerBar = numerator * 4 / denominator;
  if (us <= 0 || !Number.isInteger(beatsPerBar) || beatsPerBar <= 0)
    throw new Error('Unity export requires positive tempo and an integer number of quarter-note beats per bar.');
  const ticksPerBar = midi.header.ticksPerBeat! * beatsPerBar;
  const startTick = (config.loop.startBar - 1) * ticksPerBar;
  const endTick = (config.loop.endBar - 1) * ticksPerBar;
  for (const { tick, event } of events) {
    if (tick >= endTick) continue;
    if (event.type === 'setTempo' && event.microsecondsPerBeat !== us)
      throw new Error(`Tempo change at tick ${tick}: Unity cues require fixed tempo.`);
    if (event.type === 'timeSignature' && (event.numerator !== numerator || event.denominator !== denominator))
      throw new Error(`Meter change at tick ${tick}: Unity cues require fixed meter.`);
    if ((event.type === 'sysEx' && !isGmSystemOn(event)) || event.type === 'endSysEx' || (event.type === 'portPrefix' && event.port !== 0))
      throw new Error('SysEx (other than GM System On) and multiple MIDI ports are not supported for stem export.');
  }
  const loopBars = config.loop.endBar - config.loop.startBar;
  const startFrame = Math.round(startTick / midi.header.ticksPerBeat! * us / 1000000 * config.sampleRate);
  const frames = Math.round(loopBars * beatsPerBar * us / 1000000 * config.sampleRate);
  const fadeFrames = Math.round(config.loop.fadeOutSeconds * config.sampleRate);
  if (!Number.isSafeInteger(fadeFrames) || fadeFrames > frames)
    throw new Error('loop.fadeOutSeconds must not exceed the loop duration.');
  if (!Number.isSafeInteger(startFrame) || !Number.isSafeInteger(frames) || frames <= 0 || frames * 4 > 0xffffffff - 36)
    throw new Error('Loop length exceeds PCM WAV limits or is shorter than one sample.');
  const presets = config.presets ?? [{ id: 'full', gains: config.stems.map(s => ({ stem: s.id, gain: 1 })) }];
  unique(presets.map(p => p.id), 'Preset IDs');
  for (const preset of presets) {
    unique(preset.gains.map(g => g.stem), `Preset ${preset.id} gains`);
    if (preset.gains.length !== config.stems.length || preset.gains.some(g => !config.stems.some(s => s.id === g.stem)))
      throw new Error(`Preset ${preset.id} must specify every stem exactly once.`);
  }
  return { config: { ...config, presets }, timing: { bpm: 60000000 / us, beatsPerBar, loopBars, numerator, denominator,
    startTick, endTick, startFrame, frames, fadeFrames } };
}
