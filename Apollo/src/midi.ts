import { parseMidi, writeMidi, type MidiData, type MidiEvent } from 'midi-file';

export type TimedEvent = { tick: number; track: number; order: number; event: MidiEvent };
export function readMidi(bytes: Uint8Array): MidiData {
  try {
    const midi = parseMidi(bytes);
    if (midi.header.format === 2 || !midi.header.ticksPerBeat)
      throw new Error('Only synchronous format 0/1 MIDI with PPQ timing is supported.');
    return midi;
  } catch (error) { throw new Error(`Invalid or unsupported MIDI: ${String(error)}`); }
}

export function timeline(midi: MidiData): TimedEvent[] {
  return midi.tracks.flatMap((events, track) => {
    let tick = 0;
    return events.map((event, order) => {
      tick += event.deltaTime;
      if (!Number.isSafeInteger(tick) || tick < 0) throw new Error('Invalid MIDI event time.');
      return { tick, track, order, event };
    });
  }).sort((a, b) => a.tick - b.tick || a.track - b.track || a.order - b.order);
}

export function inspectMidi(midi: MidiData) {
  const events = timeline(midi);
  return {
    format: midi.header.format, ticksPerBeat: midi.header.ticksPerBeat,
    endTick: events.at(-1)?.tick ?? 0,
    tempos: events.filter(e => e.event.type === 'setTempo').map(({ tick, event }) =>
      ({ tick, bpm: 60000000 / (event as Extract<MidiEvent, { type: 'setTempo' }>).microsecondsPerBeat })),
    meters: events.filter(e => e.event.type === 'timeSignature').map(({ tick, event }) => {
      const meter = event as Extract<MidiEvent, { type: 'timeSignature' }>;
      return { tick, numerator: meter.numerator, denominator: meter.denominator };
    }),
    tracks: midi.tracks.map((track, index) => ({
      index, name: track.find(e => e.type === 'trackName')?.text ?? '',
      instrument: track.find(e => e.type === 'instrumentName')?.text ?? '',
      notes: track.filter(e => e.type === 'noteOn' && e.velocity > 0).length,
      channels: [...new Set(track.filter(e => 'channel' in e && e.type !== 'channelPrefix').map(e => (e as { channel: number }).channel))],
      programs: track.flatMap(e => e.type === 'programChange' ? [{ channel: e.channel, program: e.programNumber }] : []),
    })),
  };
}

/** General MIDI System On (F0 7E 7F 09 01 F7). FluidSynth already is GM, and rendering it would reset every channel to piano after our instrument selections. */
export const isGmSystemOn = (event: MidiEvent) =>
  event.type === 'sysEx' && [0x7e, 0x7f, 0x09, 0x01].every((byte, i) => event.data[i] === byte);

export type InstrumentOverride = { channel: number; program: number; bank: number };

export function usedPatches(midi: MidiData, tracks?: number[]) {
  const channels = Array.from({ length: 16 }, (_, channel) => ({ pending: channel === 9 ? 128 : 0, bank: channel === 9 ? 128 : 0, program: 0 }));
  const patches = new Map<string, InstrumentOverride>();
  for (const { track, event } of timeline(midi)) {
    if (!('channel' in event) || event.type === 'channelPrefix') continue;
    const state = channels[event.channel];
    if (event.type === 'controller' && event.controllerType === 0) state.pending = event.value * 128 + state.pending % 128;
    if (event.type === 'controller' && event.controllerType === 32) state.pending = Math.floor(state.pending / 128) * 128 + event.value;
    if (event.type === 'programChange') { state.program = event.programNumber; state.bank = state.pending; }
    if (event.type === 'noteOn' && event.velocity > 0 && (!tracks || tracks.includes(track)))
      patches.set(`${event.channel}:${state.bank}:${state.program}`, { channel: event.channel, bank: state.bank, program: state.program });
  }
  return [...patches.values()];
}

// Merge onto one timeline so channel setup on a conductor/other track is retained.
// Muting only note events preserves the source channel's controller semantics.
export function stemMidi(midi: MidiData, tracks: number[], endTick: number, overrides: InstrumentOverride[], wrapTail = false): Buffer {
  const events: MidiEvent[] = [];
  const channels = new Set(timeline(midi).filter(e => tracks.includes(e.track) && 'channel' in e.event && e.event.type !== 'channelPrefix')
    .map(e => (e.event as { channel: number }).channel));
  for (const override of overrides) {
    if (!channels.has(override.channel)) throw new Error(`Override channel ${override.channel} is absent from this stem.`);
    events.push(
      { deltaTime: 0, type: 'controller', channel: override.channel, controllerType: 0, value: override.bank >> 7 },
      { deltaTime: 0, type: 'controller', channel: override.channel, controllerType: 32, value: override.bank & 127 },
      { deltaTime: 0, type: 'programChange', channel: override.channel, programNumber: override.program });
  }
  let previous = 0;
  const heldNotes = new Set<string>();
  for (const { tick, track, event } of timeline(midi)) {
    if (event.type === 'endOfTrack' || isGmSystemOn(event)) continue;
    const noteKey = 'noteNumber' in event ? `${event.channel}:${event.noteNumber}` : '';
    const release = event.type === 'noteOff' || (event.type === 'noteOn' && event.velocity === 0);
    if (tick >= endTick) {
      // Notes can release after the musical boundary. Keep those releases
      // and pedal changes for the tail, without starting another section.
      const pedal = event.type === 'controller' && [64, 66, 69].includes(event.controllerType);
      if (!wrapTail || !((release && heldNotes.has(noteKey)) || pedal)) continue;
    }
    if ('channel' in event && event.type !== 'channelPrefix') {
      if (!channels.has(event.channel)) continue;
      if (['noteOn', 'noteOff', 'noteAftertouch'].includes(event.type) && !tracks.includes(track)) continue;
      if (overrides.some(o => o.channel === event.channel) &&
          (event.type === 'programChange' || (event.type === 'controller' && [0, 32].includes(event.controllerType)))) continue;
    }
    if (event.type === 'noteOn' && event.velocity > 0) heldNotes.add(noteKey);
    if (release) heldNotes.delete(noteKey);
    events.push({ ...event, deltaTime: tick - previous });
    previous = tick;
  }
  events.push({ type: 'endOfTrack', deltaTime: Math.max(endTick, previous) - previous });
  return Buffer.from(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: midi.header.ticksPerBeat }, tracks: [events] }));
}
