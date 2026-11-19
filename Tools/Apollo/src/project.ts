import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inspectMidi, midiNotes, readMidi } from './midi.js';
import { assignTrack, prepareConfig, type TrackTarget } from './prepare.js';
import { hashFile, readSoundFont } from './soundfont.js';
import { renderStems } from './core.js';
import type { Renderer } from './renderer.js';
import { configSchema, validateConfig } from './config.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import ffmpegStatic from 'ffmpeg-static';

const exec = promisify(execFile);

/** Where Apollo works: the Unity project, and the `music` folder of the Vulcanus project that owns the cue sources. */
export interface ApolloProject { unityRoot: string; musicDir: string }

export function cuePaths(project: ApolloProject, cueId: string) {
  if (!/^[a-z0-9][a-z0-9_-]*:[a-z0-9][a-z0-9_-]*$/.test(cueId)) throw new Error('Use a namespaced cue ID: namespace:cue-name.');
  const [namespace, name] = cueId.split(':');
  return { source: path.resolve(project.musicDir, namespace, name),
    unity: path.resolve(project.unityRoot, 'Assets/Content/Music', namespace, name) };
}

export async function importScore(options: { project: ApolloProject; cueId: string; midiPath: string; soundFont: string; tracks?: number[]; renderer?: Renderer }) {
  const { source } = cuePaths(options.project, options.cueId);
  try { await access(source); throw new Error(`Cue already exists: ${source}. Edit its config.json and use render.`); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const midiBytes = await readFile(options.midiPath);
  const inputFont = path.resolve(options.soundFont);
  const presets = await readSoundFont(inputFont);
  const font = path.resolve(options.project.unityRoot, 'Tools/Apollo/soundfonts', path.basename(inputFont));
  await mkdir(path.dirname(font), { recursive: true });
  if (inputFont !== font) {
    try {
      await access(font);
      if (await hashFile(inputFont) !== await hashFile(font)) throw new Error(`A different SoundFont is already stored as ${font}. Rename the input font.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await copyFile(inputFont, font);
    }
  }
  const config = prepareConfig(readMidi(midiBytes), options.cueId, path.relative(source, font).replaceAll('\\', '/'), presets, options.tracks);
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, 'source.mid'), midiBytes);
  await writeFile(path.join(source, 'config.json'), JSON.stringify(config, null, 2) + '\n');
  return renderCue(options.project, options.cueId, options.renderer);
}

export async function renderCue(project: ApolloProject, cueId: string, renderer?: Renderer) {
  const { source, unity } = cuePaths(project, cueId);
  const config = configSchema.parse(JSON.parse(await readFile(path.join(source, 'config.json'), 'utf8')));
  if (config.cueId !== cueId) throw new Error('config.json cueId must match its namespace/name directory.');
  const inventory = await readSoundFont(path.resolve(source, config.soundFont));
  await writeFile(path.join(source, 'instruments.json'), JSON.stringify(inventory, null, 2) + '\n');
  await mkdir(path.join(project.unityRoot, 'Temp'), { recursive: true });
  const work = await mkdtemp(path.join(project.unityRoot, 'Temp', 'apollo-'));
  try {
    const rendered = path.join(work, 'rendered');
    const manifest = await renderStems({ midiPath: path.join(source, 'source.mid'), config, configDirectory: source,
      outputDirectory: rendered, renderer });
    manifest.source.file = path.relative(unity, path.join(source, 'source.mid')).replaceAll('\\', '/');
    const pack = path.join(work, 'package');
    await mkdir(pack);
    const pool = path.join(path.dirname(unity), '_stems');
    await mkdir(pool, { recursive: true });
    // Existing cue manifests are the source of truth for shared stem filenames.
    const shared = new Map<string, string>();
    for (const entry of await readdir(path.dirname(unity), { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '_stems') continue;
      try {
        const cue = JSON.parse(await readFile(path.join(path.dirname(unity), entry.name, 'cue.apollocue'), 'utf8'));
        for (const stem of cue.stems)
          if (/^\.\.\/_stems\/[a-z0-9_-]+\.ogg$/.test(stem.file) && /^[a-f0-9]{64}$/.test(stem.sha256))
            shared.set(stem.sha256, path.basename(stem.file));
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    for (const stem of manifest.stems) {
      const instrument = stem.instruments.map(value => value.preset.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).filter(Boolean).join('-');
      const label = [stem.id, instrument].filter(Boolean).join('--');
      const file = shared.get(stem.sha256) ?? `${label}--${stem.sha256.slice(0, 12)}.ogg`;
      const target = path.join(pool, file);
      try {
        await access(target);
        if (!shared.has(stem.sha256)) throw new Error(`Stem filename collision: ${target}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        const encoded = path.join(work, `${stem.id}.ogg`);
        try {
          await exec(process.env.APOLLO_FFMPEG ?? (ffmpegStatic as unknown as string), ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(rendered, stem.file), '-codec:a', 'libvorbis', '-q:a', '6', encoded], { timeout: 600000, windowsHide: true });
        } catch (failure) {
          throw new Error(`Ogg encoding failed. Apollo uses the FFmpeg bundled by ffmpeg-static; set APOLLO_FFMPEG to override: ${(failure as Error).message}`);
        }
        await rename(encoded, target);
      }
      shared.set(stem.sha256, file);
      stem.file = `../_stems/${file}`;
    }
    await writeFile(path.join(pack, 'cue.apollocue'), JSON.stringify(manifest, null, 2) + '\n');
    await mkdir(path.dirname(unity), { recursive: true });
    let existing = false;
    try { await access(unity); existing = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (existing) {
      const previous = JSON.parse(await readFile(path.join(unity, 'cue.apollocue'), 'utf8'));
      if (previous.id !== cueId) throw new Error('The existing Unity export belongs to another cue.');
      const allowed = new Set(['cue.apollocue', ...previous.stems.map((s: { file: string }) => s.file)]);
      for (const file of await readdir(unity)) {
        const base = file.endsWith('.meta') ? file.slice(0, -5) : file;
        if (!allowed.has(base)) throw new Error(`Unmanaged file in generated Unity cue folder: ${file}`);
        if (file.endsWith('.meta') && base === 'cue.apollocue')
          await copyFile(path.join(unity, file), path.join(pack, file));
      }
      const backup = path.join(work, 'previous');
      await rename(unity, backup);
      try { await rename(pack, unity); }
      catch (error) { await rename(backup, unity); throw error; }
    } else await rename(pack, unity);
    await writeStemIndex(project, cueId.split(':')[0]);
    return { manifest, source, unity };
  } finally { await rm(work, { recursive: true, force: true }); }
}

const cueIdPattern = /^[a-z0-9][a-z0-9_-]*:[a-z0-9][a-z0-9_-]*$/;

/** The manifests of the cues exported in one namespace folder of Unity's music content. */
async function readExportedCues(unityNamespace: string) {
  let entries;
  try { entries = await readdir(unityNamespace, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const cues: { id: string; stems: { id: string; file: string; sha256: string }[] }[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '_stems') continue;
    try { cues.push(JSON.parse(await readFile(path.join(unityNamespace, entry.name, 'cue.apollocue'), 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return cues;
}

// An index makes reuse visible to authors; the audio itself lives once in Unity's shared pool.
async function writeStemIndex(project: ApolloProject, namespace: string) {
  const index = new Map<string, { file: string; uses: { cue: string; stem: string }[] }>();
  for (const cue of await readExportedCues(path.resolve(project.unityRoot, 'Assets/Content/Music', namespace))) {
    for (const stem of cue.stems) {
      if (!stem.file.startsWith('../_stems/')) continue;
      const item = index.get(stem.sha256) ?? { file: `Assets/Content/Music/${namespace}/_stems/${path.basename(stem.file)}`, uses: [] };
      item.uses.push({ cue: cue.id, stem: stem.id });
      index.set(stem.sha256, item);
    }
  }
  await writeFile(path.join(project.musicDir, namespace, 'stems.json'), JSON.stringify(Object.fromEntries([...index].sort(([x], [y]) => x.localeCompare(y))), null, 2) + '\n');
}

/** Every cue that has a config.json under <project>/music/<namespace>/<name>, with its display name. */
export async function listCues(project: ApolloProject): Promise<{ id: string; name: string }[]> {
  const root = path.resolve(project.musicDir);
  const cues: { id: string; name: string }[] = [];
  let namespaces;
  try { namespaces = await readdir(root, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return cues; throw error; }
  for (const namespace of namespaces) {
    if (!namespace.isDirectory() || !/^[a-z0-9][a-z0-9_-]*$/.test(namespace.name)) continue;
    for (const name of await readdir(path.join(root, namespace.name), { withFileTypes: true })) {
      const cueId = `${namespace.name}:${name.name}`;
      if (!name.isDirectory() || !cueIdPattern.test(cueId)) continue;
      try {
        const config = JSON.parse(await readFile(path.join(root, namespace.name, name.name, 'config.json'), 'utf8'));
        cues.push({ id: cueId, name: typeof config.name === 'string' && config.name ? config.name : cueId });
      }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  }
  return cues.sort((x, y) => x.id.localeCompare(y.id));
}

/** The editable config, the SoundFont presets the stems can choose from, and what the source MIDI contains. */
export async function readCue(project: ApolloProject, cueId: string) {
  const { source } = cuePaths(project, cueId);
  const config = configSchema.parse(JSON.parse(await readFile(path.join(source, 'config.json'), 'utf8')));
  const instruments = await readSoundFont(path.resolve(source, config.soundFont));
  const parsed = readMidi(await readFile(path.join(source, 'source.mid')));
  return { config, instruments, midi: { ...inspectMidi(parsed), notes: midiNotes(parsed) } };
}

/** Previews render at a reduced rate: long cues are otherwise hundreds of MB of audio in the editor. */
const PREVIEW_SAMPLE_RATE = 16000;

/** Renders the stems of a (possibly unsaved) config for auditioning. Nothing is exported to Unity. */
export async function previewCue(project: ApolloProject, cueId: string, input: unknown, options: { renderer?: Renderer; cache?: Map<string, Buffer> } = {}) {
  const { source } = cuePaths(project, cueId);
  const config = configSchema.parse(input);
  if (config.cueId !== cueId) throw new Error('config.cueId must match the cue.');
  const work = await mkdtemp(path.join(tmpdir(), 'apollo-preview-'));
  try {
    const output = path.join(work, 'stems');
    const manifest = await renderStems({ midiPath: path.join(source, 'source.mid'), configDirectory: source, outputDirectory: output, ...options,
      config: { ...config, sampleRate: Math.min(config.sampleRate, PREVIEW_SAMPLE_RATE) } });
    const stems = await Promise.all(manifest.stems.map(async stem => ({ id: stem.id, wav: await readFile(path.join(output, stem.file)) })));
    return { sampleRate: manifest.sampleRate, presets: manifest.presets, stems };
  } finally { await rm(work, { recursive: true, force: true }); }
}

/** What a MIDI file contains, for choosing tracks before importing it. */
export async function inspectMidiFile(midiPath: string) {
  return inspectMidi(readMidi(await readFile(midiPath)));
}

/** Moves one MIDI track between the stems of an (unsaved) config. Returns the new config; nothing is written. */
export async function assignCueTrack(project: ApolloProject, cueId: string, input: unknown, track: number, target: TrackTarget) {
  const { source } = cuePaths(project, cueId);
  const config = configSchema.parse(input);
  const midi = readMidi(await readFile(path.join(source, 'source.mid')));
  return assignTrack(config, midi, await readSoundFont(path.resolve(source, config.soundFont)), track, target);
}

/** Swaps the cue's source.mid; the saved config must still fit the new MIDI (tracks, tempo, meter, loop). */
export async function replaceCueMidi(project: ApolloProject, cueId: string, midiPath: string) {
  const { source } = cuePaths(project, cueId);
  const bytes = await readFile(midiPath);
  const config = JSON.parse(await readFile(path.join(source, 'config.json'), 'utf8'));
  validateConfig(config, readMidi(bytes));
  await writeFile(path.join(source, 'source.mid'), bytes);
}

export async function saveCueConfig(project: ApolloProject, cueId: string, input: unknown) {
  const { source } = cuePaths(project, cueId);
  const config = configSchema.parse(input);
  if (config.cueId !== cueId) throw new Error('config.cueId cannot be changed.');
  await writeFile(path.join(source, 'config.json'), JSON.stringify(config, null, 2) + '\n');
}

/**
 * Deletes a cue: its source, its Unity export and the shared stems no other cue still uses.
 * An unmanaged folder at the export location is refused rather than removed.
 */
export async function deleteCue(project: ApolloProject, cueId: string) {
  const { source, unity } = cuePaths(project, cueId);
  const namespace = cueId.split(':')[0];
  let manifest: Awaited<ReturnType<typeof readExportedCues>>[number] | undefined;
  try { await access(unity); manifest = JSON.parse(await readFile(path.join(unity, 'cue.apollocue'), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || await access(unity).then(() => true, () => false)) throw error; }
  if (manifest && manifest.id !== cueId) throw new Error('The existing Unity export belongs to another cue.');
  await rm(source, { recursive: true, force: true });
  if (manifest) {
    await rm(unity, { recursive: true, force: true });
    await rm(`${unity}.meta`, { force: true });
    const stillUsed = new Set((await readExportedCues(path.dirname(unity))).flatMap(cue => cue.stems.map(stem => path.basename(stem.file))));
    for (const stem of manifest.stems) {
      const file = path.basename(stem.file);
      if (stillUsed.has(file)) continue;
      const stemFile = path.join(path.dirname(unity), '_stems', file);
      await rm(stemFile, { force: true });
      await rm(`${stemFile}.meta`, { force: true });
    }
  }
  if ((await listCues(project)).some(cue => cue.id.startsWith(`${namespace}:`))) await writeStemIndex(project, namespace);
  else await rm(path.join(project.musicDir, namespace), { recursive: true, force: true });
}
