import type { MidiData } from 'midi-file';
import { inspectMidi, timeline, usedPatches } from './midi.js';
import { validateConfig, type RenderConfig } from './config.js';
import type { SoundFontPreset } from './soundfont.js';

export function inferLoop(midi: MidiData) {
  const events = timeline(midi);
  const meter = events.find(e => e.tick === 0 && e.event.type === 'timeSignature')?.event;
  const beats = meter?.type === 'timeSignature' ? meter.numerator * 4 / meter.denominator : 4;
  const ticks = midi.header.ticksPerBeat! * beats;
  const starts = events.filter(e => e.event.type === 'marker' && e.event.text.toLowerCase() === 'loop:start');
  const ends = events.filter(e => e.event.type === 'marker' && e.event.text.toLowerCase() === 'loop:end');
  if (starts.length || ends.length) {
    if (starts.length !== 1 || ends.length !== 1 || starts[0].tick % ticks || ends[0].tick % ticks)
      throw new Error('Author exactly one bar-aligned loop:start and loop:end marker, or set loop boundaries in config.json.');
    return { startBar: starts[0].tick / ticks + 1, endBar: ends[0].tick / ticks + 1, tail: 'wrap' as const, fadeOutSeconds: 0 };
  }
  const onsets = events.filter(e => e.event.type === 'noteOn' && e.event.velocity > 0);
  if (!onsets.length) throw new Error('MIDI contains no notes.');
  const releases = events.filter(e => e.event.type === 'noteOff' || (e.event.type === 'noteOn' && e.event.velocity === 0));
  const lastRelease = releases.at(-1)?.tick ?? events.at(-1)!.tick;
  // Use the nearest complete bar and wrap the release overhang, but never
  // choose an endpoint before the last note's onset.
  const bars = Math.max(1, Math.round(lastRelease / ticks), Math.floor(onsets.at(-1)!.tick / ticks) + 1);
  return { startBar: 1, endBar: bars + 1, tail: 'wrap' as const, fadeOutSeconds: 0 };
}

type Stem = RenderConfig['stems'][number];
type Instrument = Stem['instruments'][number];
type NoteTrack = { index: number; name: string; channels: number[] };

/** An explicit instrument for each channel a track plays with one fixed patch. Several patches stay MIDI-driven. */
function trackInstruments(midi: MidiData, track: NoteTrack, presets: SoundFontPreset[]): Instrument[] {
  const instruments: Instrument[] = [];
  for (const channel of track.channels) {
    const patches = usedPatches(midi, [track.index]).filter(p => p.channel === channel);
    if (patches.length === 1) {
      const source = patches[0];
      const patch = presets.find(p => p.bank === source.bank && p.program === source.program);
      instruments.push(patch && presets.filter(p => p.name === patch.name).length === 1
        ? { channel, preset: patch.name } : { channel, bank: source.bank, program: source.program });
    }
  }
  return instruments;
}

const stemIdFor = (track: NoteTrack) =>
  `${track.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'track'}-${track.index}`;
const stemNameFor = (track: NoteTrack) => track.name || `Track ${track.index}`;

export function prepareConfig(midi: MidiData, cueId: string, soundFont: string, presets: SoundFontPreset[], selectedTracks?: number[]): RenderConfig {
  const noteTracks = inspectMidi(midi).tracks.filter(t => t.notes > 0);
  const selected = selectedTracks ?? noteTracks.map(t => t.index);
  if (new Set(selected).size !== selected.length) throw new Error('Selected track indices must be unique.');
  if (selected.some(i => !noteTracks.some(t => t.index === i))) throw new Error('Selected tracks must be note-bearing MIDI track indices.');
  const stems = noteTracks.filter(t => selected.includes(t.index)).map(track =>
    ({ id: stemIdFor(track), name: stemNameFor(track), tracks: [track.index], instruments: trackInstruments(midi, track, presets) }));
  return validateConfig({ cueId, soundFont, loop: inferLoop(midi), stems,
    ignoreTracks: noteTracks.filter(t => !selected.includes(t.index)).map(t => t.index) }, midi).config;
}

export type TrackTarget = 'ignore' | 'new' | { stem: string };

/**
 * Moves one note track to another stem, to its own new stem, or to the ignored tracks. A stem left
 * without tracks is removed. The track keeps its instrument, and every mix stays complete.
 */
export function assignTrack(config: RenderConfig, midi: MidiData, presets: SoundFontPreset[], trackIndex: number, target: TrackTarget): RenderConfig {
  const track = inspectMidi(midi).tracks.find(t => t.index === trackIndex && t.notes > 0);
  if (!track) throw new Error(`Track ${trackIndex} is not a note-bearing MIDI track.`);
  const source = config.stems.find(s => s.tracks.includes(trackIndex));
  if (typeof target === 'object' && !config.stems.some(s => s.id === target.stem)) throw new Error(`Stem ${target.stem} does not exist.`);
  if (typeof target === 'object' ? target.stem === source?.id : target === 'ignore' && !source) return config;
  const channelsOf = (tracks: number[]) => new Set(inspectMidi(midi).tracks.filter(t => tracks.includes(t.index)).flatMap(t => t.channels));
  const carried = source?.instruments.filter(i => track.channels.includes(i.channel)) ?? [];
  // The moved track keeps the instruments it had; channels it newly brings use the MIDI's own patches.
  const withTrack = (instruments: Instrument[]) => [...instruments, ...track.channels
    .filter(c => !instruments.some(i => i.channel === c))
    .flatMap(c => carried.find(i => i.channel === c) ?? trackInstruments(midi, track, presets).find(i => i.channel === c) ?? [])];
  let stems = config.stems.map(stem => {
    if (stem === source) {
      const remaining = stem.tracks.filter(t => t !== trackIndex);
      const used = channelsOf(remaining);
      return { ...stem, tracks: remaining, instruments: stem.instruments.filter(i => used.has(i.channel)) };
    }
    return typeof target === 'object' && stem.id === target.stem
      ? { ...stem, tracks: [...stem.tracks, trackIndex].sort((x, y) => x - y), instruments: withTrack(stem.instruments) } : stem;
  }).filter(stem => stem.tracks.length);
  let created: Stem | undefined;
  if (target === 'new') {
    let id = stemIdFor(track);
    for (let n = 2; stems.some(s => s.id === id); n++) id = `${stemIdFor(track)}-${n}`;
    created = { id, name: stemNameFor(track), tracks: [trackIndex], instruments: withTrack([]) };
    stems = [...stems, created];
  }
  if (!stems.length) throw new Error('A cue needs at least one stem.');
  const removed = config.stems.filter(s => !stems.some(kept => kept.id === s.id)).map(s => s.id);
  const mixes = config.presets?.map(mix => ({ ...mix, gains: [
    ...mix.gains.filter(g => !removed.includes(g.stem)),
    ...(created && !mix.gains.some(g => g.stem === created.id) ? [{ stem: created.id, gain: 1 }] : []),
  ] }));
  const ignoreTracks = [...config.ignoreTracks.filter(i => i !== trackIndex), ...(target === 'ignore' ? [trackIndex] : [])].sort((x, y) => x - y);
  return validateConfig({ ...config, stems, ignoreTracks, presets: mixes }, midi).config;
}
