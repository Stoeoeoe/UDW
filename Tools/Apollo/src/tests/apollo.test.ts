import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeMidi, type MidiData } from 'midi-file';
import { validateConfig } from '../config.js';
import { inspectMidi, midiNotes, readMidi, stemMidi, timeline } from '../midi.js';
import { renderStems } from '../core.js';
import { FluidSynthRenderer, type Renderer, type RenderRequest } from '../renderer.js';
import { cropWav, fadeOutWav, pcmWav, readWav, wrapTailWav } from '../wav.js';
import { assignTrack, inferLoop, prepareConfig } from '../prepare.js';
import { assignCueTrack, cuePaths, importScore, inspectMidiFile, listCues, deleteCue, previewCue, readCue, renderCue, replaceCueMidi, saveCueConfig } from '../project.js';
import { readSoundFont, selectPreset } from '../soundfont.js';

function song(): MidiData {
  return { header: { format: 1, numTracks: 3, ticksPerBeat: 480 }, tracks: [
    [{ deltaTime: 0, type: 'setTempo', microsecondsPerBeat: 500000 },
      { deltaTime: 0, type: 'timeSignature', numerator: 4, denominator: 4, metronome: 24, thirtyseconds: 8 },
      { deltaTime: 0, type: 'programChange', channel: 0, programNumber: 0 },
      { deltaTime: 0, type: 'controller', channel: 0, controllerType: 7, value: 90 },
      { deltaTime: 3840, type: 'endOfTrack' }],
    [{ deltaTime: 0, type: 'trackName', text: 'Melody' },
      { deltaTime: 240, type: 'noteOn', channel: 0, noteNumber: 60, velocity: 80 },
      { deltaTime: 720, type: 'noteOff', channel: 0, noteNumber: 60, velocity: 0 },
      { deltaTime: 1440, type: 'noteOn', channel: 0, noteNumber: 64, velocity: 80 },
      { deltaTime: 720, type: 'noteOff', channel: 0, noteNumber: 64, velocity: 0 },
      { deltaTime: 720, type: 'endOfTrack' }],
    [{ deltaTime: 0, type: 'trackName', text: 'Bass' },
      { deltaTime: 0, type: 'programChange', channel: 1, programNumber: 0 },
      { deltaTime: 480, type: 'noteOn', channel: 1, noteNumber: 48, velocity: 75 },
      { deltaTime: 960, type: 'noteOff', channel: 1, noteNumber: 48, velocity: 0 },
      { deltaTime: 2400, type: 'endOfTrack' }],
  ] };
}
const configuration = () => ({ cueId: 'example:score', soundFont: 'test soundfont.sf2',
  loop: { startBar: 1, endBar: 3 }, sampleRate: 8000,
  stems: [{ id: 'melody', tracks: [1] }, { id: 'bass', tracks: [2] }] });

test('inspect identifies tracks, zero-based programs, tempo and meter', () => {
  const info = inspectMidi(readMidi(Buffer.from(writeMidi(song()))));
  assert.equal(info.tracks[1].name, 'Melody');
  assert.equal(info.tracks[1].notes, 2);
  assert.deepEqual(info.tempos, [{ tick: 0, bpm: 120 }]);
  assert.deepEqual(info.meters, [{ tick: 0, numerator: 4, denominator: 4 }]);
  assert.deepEqual(info.tracks[2].programs, [{ channel: 1, program: 0 }]);
  assert.deepEqual(midiNotes(readMidi(Buffer.from(writeMidi(song())))), [
    { track: 1, channel: 0, pitch: 60, start: 240, end: 960 },
    { track: 2, channel: 1, pitch: 48, start: 480, end: 1440 },
    { track: 1, channel: 0, pitch: 64, start: 2400, end: 3120 },
  ]);
});

test('stem MIDI preserves silent lead-in and remote channel setup while excluding other notes', () => {
  const parsed = readMidi(stemMidi(song(), [1], 3840, []));
  const events = timeline(parsed);
  assert.equal(events.find(e => e.event.type === 'noteOn')!.tick, 240);
  assert.ok(events.some(e => e.event.type === 'controller' && e.event.controllerType === 7));
  assert.ok(!events.some(e => 'channel' in e.event && e.event.channel === 1));
  assert.equal(events.at(-1)!.tick, 3840);
});

test('shared channel controls survive grouping and program overrides suppress source program changes', () => {
  const midi = song();
  midi.tracks[2].unshift({ deltaTime: 0, type: 'controller', channel: 0, controllerType: 10, value: 64 });
  const events = timeline(readMidi(stemMidi(midi, [1], 3840, [{ channel: 0, bank: 129, program: 42 }])));
  assert.ok(events.some(e => e.event.type === 'controller' && e.event.controllerType === 10));
  assert.deepEqual(events.filter(e => e.event.type === 'programChange').map(e => e.event),
    [{ deltaTime: 0, type: 'programChange', channel: 0, programNumber: 42 }]);
  assert.deepEqual(events.slice(0, 2).map(e => e.event), [
    { deltaTime: 0, type: 'controller', channel: 0, controllerType: 0, value: 1 },
    { deltaTime: 0, type: 'controller', channel: 0, controllerType: 32, value: 1 }]);
});

test('boundary validation rejects ambiguous grouping, invalid presets, and changing timing', () => {
  assert.throws(() => validateConfig({ ...configuration(), stems: [{ id: 'melody', tracks: [1] }] }, song()), /Note track 2/);
  assert.throws(() => validateConfig({ ...configuration(), ignoreTracks: [1] }, song()), /unique/);
  assert.throws(() => validateConfig({ ...configuration(), presets: [{ id: 'calm', gains: [{ stem: 'melody', gain: 1 }] }] }, song()), /every stem/);
  const tempo = song(); tempo.tracks[0].splice(1, 0, { deltaTime: 480, type: 'setTempo', microsecondsPerBeat: 600000 });
  assert.throws(() => validateConfig(configuration(), tempo), /Tempo change/);
  const meter = song(); meter.tracks[0].splice(2, 0, { deltaTime: 480, type: 'timeSignature', numerator: 3, denominator: 4, metronome: 24, thirtyseconds: 8 });
  assert.throws(() => validateConfig(configuration(), meter), /Meter change/);
  assert.throws(() => readMidi(Buffer.from('not midi')), /MIDI/);
  const gm = song(); gm.tracks[0].splice(0, 0, { deltaTime: 0, type: 'sysEx', data: [0x7e, 0x7f, 0x09, 0x01, 0xf7] });
  validateConfig(configuration(), gm);
  // The reset would otherwise return every channel to piano after the stem's instrument selection.
  const rendered = readMidi(stemMidi(gm, [1], 3840, [{ channel: 0, bank: 0, program: 56 }]));
  assert.ok(!rendered.tracks[0].some(e => e.type === 'sysEx'));
  assert.ok(rendered.tracks[0].some(e => e.type === 'programChange' && e.programNumber === 56));
  const other = song(); other.tracks[0].splice(0, 0, { deltaTime: 0, type: 'sysEx', data: [0x41, 0x10, 0x42, 0x12, 0xf7] });
  assert.throws(() => validateConfig(configuration(), other), /SysEx/);
});

test('nonzero loop start uses musical timing and identical sample counts', () => {
  const { timing } = validateConfig({ ...configuration(), loop: { startBar: 2, endBar: 3 } }, song());
  assert.equal(timing.startTick, 1920); assert.equal(timing.startFrame, 16000);
  assert.equal(timing.frames, 16000); assert.equal(timing.loopBars, 1);
});

test('wrapped export retains notes crossing the endpoint but starts no later notes', () => {
  const source = song();
  source.tracks[1] = [
    { deltaTime: 1800, type: 'noteOn', channel: 0, noteNumber: 60, velocity: 80 },
    { deltaTime: 240, type: 'noteOn', channel: 0, noteNumber: 64, velocity: 80 },
    { deltaTime: 240, type: 'noteOff', channel: 0, noteNumber: 60, velocity: 0 },
    { deltaTime: 240, type: 'noteOff', channel: 0, noteNumber: 64, velocity: 0 },
  ];
  const events = timeline(readMidi(stemMidi(source, [1], 1920, [], true)));
  assert.deepEqual(events.filter(e => e.event.type === 'noteOn').map(e => e.tick), [1800]);
  assert.deepEqual(events.filter(e => e.event.type === 'noteOff').map(e => e.tick), [2280]);
  assert.equal(events.at(-1)!.tick, 2280);
});

test('tail wrapping overlaps release samples into the opening and preserves loop length', () => {
  const data = Buffer.alloc(16);
  [10, 20, 30, 40].forEach((sample, frame) => {
    data.writeInt16LE(sample, frame * 4); data.writeInt16LE(-sample, frame * 4 + 2);
  });
  const output = readWav(wrapTailWav(pcmWav(data, 8000), 8000, 0, 2));
  assert.equal(output.frames, 2);
  assert.deepEqual([...Array(4)].map((_, sample) => output.data.readInt16LE(sample * 2)), [40, -40, 60, -60]);
  data.writeInt16LE(32767, 0);
  assert.throws(() => wrapTailWav(pcmWav(data, 8000), 8000, 0, 2), /clips/);
});

test('fade-out reaches silence with matching stereo gains and preserves the rest of the loop', () => {
  const data = Buffer.alloc(20);
  for (let frame = 0; frame < 5; frame++) {
    data.writeInt16LE(1000, frame * 4); data.writeInt16LE(-1000, frame * 4 + 2);
  }
  const original = pcmWav(data, 8000);
  assert.deepEqual(fadeOutWav(Buffer.from(original), 0), original);
  const output = readWav(fadeOutWav(Buffer.from(original), 3));
  assert.equal(output.frames, 5); assert.equal(output.sampleRate, 8000);
  assert.deepEqual([...Array(5)].map((_, f) => output.data.readInt16LE(f * 4)), [1000, 1000, 1000, 500, 0]);
  assert.deepEqual([...Array(5)].map((_, f) => output.data.readInt16LE(f * 4 + 2)), [-1000, -1000, -1000, -500, 0]);
  assert.equal(readWav(fadeOutWav(Buffer.from(original), 1)).data.readInt16LE(16), 0);
  assert.throws(() => validateConfig({ ...configuration(), loop: { startBar: 1, endBar: 3, fadeOutSeconds: 5 } }, song()), /exceed the loop duration/);
});

test('WAV validation crops by sample and rejects truncated or wrong-rate renders', () => {
  const data = Buffer.alloc(80); data.writeInt16LE(1234, 16);
  const wav = pcmWav(data, 8000);
  const result = readWav(cropWav(wav, 8000, 4, 6));
  assert.equal(result.frames, 6); assert.equal(result.data.readInt16LE(), 1234);
  assert.throws(() => cropWav(wav, 48000, 0, 5), /sample rate/);
  assert.throws(() => cropWav(wav, 8000, 0, 21), /too short/);
  assert.throws(() => readWav(wav.subarray(0, 50)), /Truncated/);
});

class PcmRenderer implements Renderer {
  async describe() { return { name: 'test PCM', version: '1' }; }
  async render(request: RenderRequest) {
    await writeFile(request.outputPath, pcmWav(Buffer.alloc(request.sampleRate * 5 * 4), request.sampleRate));
  }
}
async function fixture(run: (directory: string, midiPath: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'apollo test & spaces-'));
  try {
    const midiPath = path.join(directory, 'song & score.mid');
    await writeFile(midiPath, Buffer.from(writeMidi(song())));
    await writeFile(path.join(directory, 'test soundfont.sf2'), presetHeaders());
    await run(directory, midiPath);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('export and saved config regenerate identical files; existing output is refused', async () => fixture(async (directory, midiPath) => {
  const first = path.join(directory, 'first');
  const options = { midiPath, config: configuration(), configDirectory: directory, outputDirectory: first, renderer: new PcmRenderer() };
  const manifest = await renderStems(options);
  assert.equal(manifest.frames, 32000);
  const saved = JSON.parse(await readFile(path.join(first, 'config.json'), 'utf8'));
  const second = path.join(directory, 'second');
  await renderStems({ ...options, midiPath: path.join(first, 'source.mid'), config: saved, configDirectory: first, outputDirectory: second });
  for (const file of await readdir(first)) assert.deepEqual(await readFile(path.join(first, file)), await readFile(path.join(second, file)), file);
  await assert.rejects(renderStems(options), /already exists/);
}));

test('a stem cache re-renders only stems whose audio inputs changed', async () => fixture(async (directory, midiPath) => {
  class CountingRenderer extends PcmRenderer { renders = 0; async render(request: RenderRequest) { this.renders++; await super.render(request); } }
  const renderer = new CountingRenderer();
  const cache = new Map<string, Buffer>();
  const render = (name: string, config: unknown) => renderStems({ midiPath, config, configDirectory: directory,
    outputDirectory: path.join(directory, name), renderer, cache });
  await render('first', configuration());
  assert.equal(renderer.renders, 2);
  await render('second', configuration());
  assert.equal(renderer.renders, 2);
  const changed = configuration();
  (changed.stems[1] as { instruments?: unknown }).instruments = [{ channel: 1, preset: 'Test Piano' }];
  const manifest = await render('third', changed);
  assert.equal(renderer.renders, 3);
  assert.equal(manifest.stems.length, 2);
  assert.deepEqual(await readFile(path.join(directory, 'third', 'melody.wav')), await readFile(path.join(directory, 'first', 'melody.wav')));
}));

test('renderer failure cleans staged output and reports the error', async () => fixture(async (directory, midiPath) => {
  class FailingRenderer extends PcmRenderer { async render() { throw new Error('synthesis failed'); } }
  await assert.rejects(renderStems({ midiPath, config: configuration(), configDirectory: directory,
    outputDirectory: path.join(directory, 'output'), renderer: new FailingRenderer() }), /synthesis failed/);
  assert.ok(!(await readdir(directory)).some(f => f.startsWith('.apollo-') || f === 'output'));
}));

test('a stem named render retains its WAV without colliding with temporary files', async () => fixture(async (directory, midiPath) => {
  const config = { ...configuration(), stems: [{ id: 'render', tracks: [1, 2] }] };
  const outputDirectory = path.join(directory, 'output');
  await renderStems({ midiPath, config, configDirectory: directory, outputDirectory, renderer: new PcmRenderer() });
  assert.equal(readWav(await readFile(path.join(outputDirectory, 'render.wav'))).frames, 32000);
}));

test('real FluidSynth renders aligned audible stems and repeats bit-for-bit', {
  skip: !process.env.APOLLO_SOUNDFONT,
}, async () => fixture(async (directory, midiPath) => {
  const config = { ...configuration(), sampleRate: 48000, soundFont: path.resolve(process.env.APOLLO_SOUNDFONT!) };
  await writeFile(path.join(directory, 'song.json'), JSON.stringify(config));
  for (const output of ['first', 'second']) {
    await renderStems({ midiPath, config, configDirectory: directory, outputDirectory: path.join(directory, output),
      renderer: new FluidSynthRenderer() });
  }
  for (const stem of ['melody', 'bass']) {
    const bytes = await readFile(path.join(directory, 'first', `${stem}.wav`));
    const wav = readWav(bytes);
    assert.equal(wav.frames, 192000); assert.equal(wav.sampleRate, 48000);
    assert.ok(wav.data.some(byte => byte !== 0), `${stem} must be audible`);
    assert.ok(wav.data.subarray(0, 1000).every(byte => byte === 0), 'leading silence must remain');
    assert.deepEqual(bytes, await readFile(path.join(directory, 'second', `${stem}.wav`)));
  }
}));

function presetHeaders() {
  // Isolated SF2 metadata fixture; actual synthesis is covered with a real font.
  const headers = Buffer.alloc(38 * 2);
  headers.write('Test Piano'); headers.write('EOP', 38);
  const list = Buffer.alloc(12); list.write('LIST'); list.writeUInt32LE(4 + 8 + headers.length, 4); list.write('pdta', 8);
  const phdr = Buffer.alloc(8); phdr.write('phdr'); phdr.writeUInt32LE(headers.length, 4);
  const body = Buffer.concat([list, phdr, headers]);
  const riff = Buffer.alloc(12); riff.write('RIFF'); riff.writeUInt32LE(body.length + 4, 4); riff.write('sfbk', 8);
  return Buffer.concat([riff, body]);
}

test('SoundFont inventory selects names and rejects missing or ambiguous instruments', async () => fixture(async directory => {
  const file = path.join(directory, 'headers.sf2');
  await writeFile(file, presetHeaders());
  const presets = await readSoundFont(file);
  assert.deepEqual(presets, [{ name: 'Test Piano', bank: 0, program: 0 }]);
  assert.equal(selectPreset(presets, { preset: 'Test Piano' }).program, 0);
  assert.throws(() => selectPreset(presets, { preset: 'Missing' }), /0 matches/);
  assert.throws(() => selectPreset([...presets, ...presets], { preset: 'Test Piano' }), /2 matches/);
}));

test('preparation discovers tracks/instruments and infers bar boundaries with wrapped overhang', () => {
  const midi = song();
  midi.tracks[1].splice(-1, 1, { deltaTime: 1000, type: 'endOfTrack' });
  const config = prepareConfig(midi, 'mod:score', 'font.sf2', [{ name: 'Test Piano', bank: 0, program: 0 }]);
  assert.equal(config.stems.length, 2);
  assert.deepEqual(config.stems[0].instruments, [{ channel: 0, preset: 'Test Piano' }]);
  assert.equal(config.loop.endBar, 3);
  assert.equal(config.loop.tail, 'wrap');
  const unresolved = prepareConfig(midi, 'mod:score', 'font.sf2', []);
  assert.deepEqual(unresolved.stems[0].instruments, [{ channel: 0, bank: 0, program: 0 }]);
  const chosen = prepareConfig(midi, 'mod:score', 'font.sf2', [{ name: 'Test Piano', bank: 0, program: 0 }], [1]);
  assert.deepEqual(chosen.ignoreTracks, [2]);
  const marked = song();
  marked.tracks[0] = [{ deltaTime: 0, type: 'marker', text: 'loop:start' }, { deltaTime: 1920, type: 'marker', text: 'loop:end' }];
  assert.equal(inferLoop(marked).endBar, 2);
  marked.tracks[0].pop();
  assert.throws(() => inferLoop(marked), /exactly one/);
});

test('assigning a track moves it between stems, keeps its instrument and keeps every mix complete', () => {
  const midi = song();
  const presets = [{ name: 'Test Piano', bank: 0, program: 0 }];
  const base = prepareConfig(midi, 'mod:score', 'font.sf2', presets);
  const combined = assignTrack(base, midi, presets, 2, { stem: 'melody-1' });
  assert.equal(combined.stems.length, 1);
  assert.deepEqual(combined.stems[0].tracks, [1, 2]);
  assert.deepEqual(combined.stems[0].instruments, [{ channel: 0, preset: 'Test Piano' }, { channel: 1, preset: 'Test Piano' }]);
  assert.deepEqual(combined.presets![0].gains.map(g => g.stem), ['melody-1']);
  const split = assignTrack(combined, midi, presets, 2, 'new');
  assert.deepEqual(split.stems.map(s => s.id), ['melody-1', 'bass-2']);
  assert.deepEqual(split.stems[0].instruments, [{ channel: 0, preset: 'Test Piano' }]);
  assert.deepEqual(split.stems[1].instruments, [{ channel: 1, preset: 'Test Piano' }]);
  assert.deepEqual(split.presets![0].gains.map(g => g.stem), ['melody-1', 'bass-2']);
  const ignored = assignTrack(base, midi, presets, 2, 'ignore');
  assert.deepEqual(ignored.ignoreTracks, [2]);
  assert.deepEqual(ignored.stems.map(s => s.id), ['melody-1']);
  assert.deepEqual(assignTrack(ignored, midi, presets, 2, 'new').ignoreTracks, []);
  assert.equal(assignTrack(base, midi, presets, 1, { stem: 'melody-1' }), base);
  assert.throws(() => assignTrack(ignored, midi, presets, 1, 'ignore'), /at least one stem/);
  assert.throws(() => assignTrack(base, midi, presets, 0, 'new'), /not a note-bearing/);
  assert.throws(() => assignTrack(base, midi, presets, 1, { stem: 'missing' }), /does not exist/);
});

test('canonical renders replace exports, preserve Unity GUID metadata, and remove stale generated stems', async () => fixture(async (directory, midiPath) => {
  const font = path.join(directory, 'headers.sf2');
  await writeFile(font, presetHeaders());
  const project = { unityRoot: directory, musicDir: path.join(directory, 'music') };
  const imported = await importScore({ project, cueId: 'mod:score', midiPath, soundFont: font, renderer: new PcmRenderer() });
  const { source, unity } = cuePaths(project, 'mod:score');
  assert.equal(imported.unity, unity);
  assert.equal(path.resolve(unity, imported.manifest.source.file), path.join(source, 'source.mid'));
  const meta = 'fileFormatVersion: 2\nguid: 0123456789abcdef0123456789abcdef\n';
  await writeFile(path.join(unity, 'cue.apollocue.meta'), meta);
  const config = JSON.parse(await readFile(path.join(source, 'config.json'), 'utf8'));
  const previousManifest = await readFile(path.join(unity, 'cue.apollocue'));
  config.stems[0].instruments = [{ channel: 0, preset: 'Missing instrument' }];
  await writeFile(path.join(source, 'config.json'), JSON.stringify(config));
  await assert.rejects(renderCue(project, 'mod:score', new PcmRenderer()), /0 matches/);
  assert.deepEqual(await readFile(path.join(unity, 'cue.apollocue')), previousManifest);
  config.stems = [{ id: 'combined', tracks: [1, 2] }];
  delete config.presets;
  await writeFile(path.join(source, 'config.json'), JSON.stringify(config));
  const rendered = await renderCue(project, 'mod:score', new PcmRenderer());
  assert.match(rendered.manifest.stems[0].file, /^\.\.\/_stems\/[a-z0-9_-]+--[a-f0-9]{12}\.ogg$/);
  assert.equal(await readFile(path.resolve(unity, rendered.manifest.stems[0].file)).then(b => b.length > 44), true);
  assert.equal(await readFile(path.join(unity, 'cue.apollocue.meta'), 'utf8'), meta);
  assert.deepEqual((await readdir(unity)).sort(), ['cue.apollocue', 'cue.apollocue.meta']);
  const index = JSON.parse(await readFile(path.join(directory, 'music/mod/stems.json'), 'utf8'));
  assert.deepEqual(index[rendered.manifest.stems[0].sha256].uses, [{ cue: 'mod:score', stem: 'combined' }]);
  const second = await importScore({ project, cueId: 'mod:second', midiPath, soundFont: font, renderer: new PcmRenderer() });
  assert.equal(second.manifest.stems[0].sha256, rendered.manifest.stems[0].sha256);
  assert.equal(path.resolve(second.unity, second.manifest.stems[0].file), path.resolve(unity, rendered.manifest.stems[0].file));
  const shared = JSON.parse(await readFile(path.join(directory, 'music/mod/stems.json'), 'utf8'));
  assert.ok(shared[rendered.manifest.stems[0].sha256].uses.some((use: { cue: string }) => use.cue === 'mod:second'));
  assert.deepEqual(await listCues(project), [{ id: 'mod:score', name: 'mod:score' }, { id: 'mod:second', name: 'mod:second' }]);
  const cue = await readCue(project, 'mod:score');
  assert.equal(cue.config.cueId, 'mod:score');
  assert.ok(cue.instruments.length > 0);
  await saveCueConfig(project, 'mod:score', { ...cue.config, gain: 0.5 });
  assert.equal((await readCue(project, 'mod:score')).config.gain, 0.5);
  await assert.rejects(saveCueConfig(project, 'mod:score', { ...cue.config, cueId: 'mod:other' }), /cannot be changed/);
  assert.equal(cue.midi.tracks[1].name, 'Melody');
  const shorter = song();
  shorter.tracks = shorter.tracks.slice(0, 2);
  const incompatible = path.join(directory, 'incompatible.mid');
  await writeFile(incompatible, Buffer.from(writeMidi(shorter)));
  await assert.rejects(replaceCueMidi(project, 'mod:score', incompatible), /does not exist|must belong/);
  assert.equal((await readCue(project, 'mod:score')).midi.tracks.length, cue.midi.tracks.length);
  await replaceCueMidi(project, 'mod:score', midiPath);
  const preview = await previewCue(project, 'mod:score', cue.config, { renderer: new PcmRenderer() });
  assert.deepEqual(preview.stems.map(stem => stem.id), ['combined']);
  assert.equal(preview.presets![0].id, 'full');
  assert.equal(readWav(preview.stems[0].wav).sampleRate, preview.sampleRate);
  assert.deepEqual((await inspectMidiFile(midiPath)).tracks.filter(t => t.notes).map(t => t.index), [1, 2]);
  const moved = await assignCueTrack(project, 'mod:score', cue.config, 1, 'ignore');
  assert.deepEqual([moved.stems[0].tracks, moved.ignoreTracks], [[2], [1]]);
  assert.equal((await previewCue(project, 'mod:score', { ...cue.config, sampleRate: 48000 }, { renderer: new PcmRenderer() })).sampleRate, 16000);
  await assert.rejects(importScore({ project, cueId: 'mod:score', midiPath, soundFont: font }), /already exists/);
  assert.throws(() => cuePaths(project, '../outside:score'), /namespaced/);

  // A display name changes nothing about the cue's identity or files.
  await saveCueConfig(project, 'mod:score', { ...cue.config, name: 'The Score' });
  assert.deepEqual(await listCues(project), [{ id: 'mod:score', name: 'The Score' }, { id: 'mod:second', name: 'mod:second' }]);

  // Deleting removes source and export, but a stem another cue still uses stays.
  const stemFile = path.resolve(unity, rendered.manifest.stems[0].file);
  const exists = (file: string) => readFile(file).then(() => true, () => false);
  await deleteCue(project, 'mod:second');
  assert.deepEqual(await listCues(project), [{ id: 'mod:score', name: 'The Score' }]);
  assert.equal(await exists(path.join(second.unity, 'cue.apollocue')), false);
  assert.equal(await exists(stemFile), true);
  assert.deepEqual(Object.values(JSON.parse(await readFile(path.join(directory, 'music/mod/stems.json'), 'utf8')))
    .flatMap(entry => (entry as { uses: { cue: string }[] }).uses.map(use => use.cue)), ['mod:score']);
  await deleteCue(project, 'mod:score');
  assert.deepEqual(await listCues(project), []);
  assert.equal(await exists(stemFile), false);
  assert.equal(await exists(path.join(unity, 'cue.apollocue')), false);
  assert.deepEqual(await readdir(path.join(directory, 'music')), []);
}));
