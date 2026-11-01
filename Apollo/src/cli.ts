#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { inspectMidi, readMidi, FluidSynthRenderer } from './core.js';
import { importScore, renderCue } from './project.js';
import { readSoundFont } from './soundfont.js';

const help = `Apollo - MIDI to game music

  apollo import <song.mid> --soundfont <font.sf2> --id <namespace:cue-name>
                [--tracks 1,2,3] [--fluidsynth <executable>]
  apollo render <namespace:cue-name> [--fluidsynth <executable>]
  apollo inspect <song.mid>
  apollo instruments <font.sf2>

Sources/config: Apollo/<namespace>/<cue-name>/
Unity export:   Assets/Content/Music/<namespace>/<cue-name>/
Edit config.json to change grouping, instrument preset names, loops or fades.
Track/channel/program numbers are zero-based. Loop endBar is exclusive.
`;

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    soundfont: { type: 'string' }, id: { type: 'string' }, tracks: { type: 'string' },
    fluidsynth: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help || !positionals.length) console.log(help);
  else {
    const [command, input] = positionals;
    if (positionals.length !== 2) throw new Error('Expected a command and one input. Use --help.');
    const project = fileURLToPath(new URL('../../', import.meta.url));
    const renderer = new FluidSynthRenderer(values.fluidsynth);
    if (command === 'inspect' || command === 'instruments') {
      if (values.id || values.soundfont || values.tracks || values.fluidsynth) throw new Error(`${command} does not accept render options.`);
      const result = command === 'inspect' ? inspectMidi(readMidi(await readFile(input))) : await readSoundFont(input);
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (command !== 'import' && command !== 'render') throw new Error(`Unknown command '${command}'. Use --help.`);
      if (command === 'import' && (!values.soundfont || !values.id)) throw new Error('import requires --soundfont and --id.');
      if (command === 'render' && (values.id || values.soundfont || values.tracks)) throw new Error('render reads inputs from the cue config.json.');
      if (values.tracks !== undefined && !/^\d+(,\d+)*$/.test(values.tracks)) throw new Error('--tracks must be comma-separated MIDI track indices.');
      const result = command === 'import'
        ? await importScore({ project, cueId: values.id!, midiPath: input, soundFont: values.soundfont!,
          tracks: values.tracks?.split(',').map(Number), renderer })
        : await renderCue(project, input, renderer);
      console.log(`Cue: ${result.manifest.id}\nConfig: ${result.source}/config.json\nUnity: ${result.unity}\n` +
        `${result.manifest.stems.length} stems, ${result.manifest.loopBars} bars, ${result.manifest.sampleRate} Hz.\nUnity imports cue.apollocue automatically. Audition inferred loop boundaries.`);
    }
  }
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
