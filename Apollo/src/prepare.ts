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

export function prepareConfig(midi: MidiData, cueId: string, soundFont: string, presets: SoundFontPreset[], selectedTracks?: number[]): RenderConfig {
  const noteTracks = inspectMidi(midi).tracks.filter(t => t.notes > 0);
  const selected = selectedTracks ?? noteTracks.map(t => t.index);
  if (new Set(selected).size !== selected.length) throw new Error('Selected track indices must be unique.');
  if (selected.some(i => !noteTracks.some(t => t.index === i))) throw new Error('Selected tracks must be note-bearing MIDI track indices.');
  const stems = noteTracks.filter(t => selected.includes(t.index)).map(track => {
    const slug = track.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'track';
    const instruments: RenderConfig['stems'][number]['instruments'] = [];
    for (const channel of track.channels) {
      const patches = usedPatches(midi, [track.index]).filter(p => p.channel === channel);
      // Multiple authored patches remain MIDI-driven rather than being flattened.
      if (patches.length === 1) {
        const source = patches[0];
        const patch = presets.find(p => p.bank === source.bank && p.program === source.program);
        instruments.push(patch && presets.filter(p => p.name === patch.name).length === 1
          ? { channel, preset: patch.name } : { channel, bank: source.bank, program: source.program });
      }
    }
    return { id: `${slug}-${track.index}`, name: track.name || `Track ${track.index}`, tracks: [track.index], instruments };
  });
  return validateConfig({ cueId, soundFont, loop: inferLoop(midi), stems,
    ignoreTracks: noteTracks.filter(t => !selected.includes(t.index)).map(t => t.index) }, midi).config;
}
