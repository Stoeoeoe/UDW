import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readMidi } from './midi.js';
import { prepareConfig } from './prepare.js';
import { hashFile, readSoundFont } from './soundfont.js';
import { renderStems } from './core.js';
import type { Renderer } from './renderer.js';
import { configSchema } from './config.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export function cuePaths(project: string, cueId: string) {
  if (!/^[a-z0-9][a-z0-9_-]*:[a-z0-9][a-z0-9_-]*$/.test(cueId)) throw new Error('Use a namespaced cue ID: namespace:cue-name.');
  const [namespace, name] = cueId.split(':');
  return { source: path.resolve(project, 'Apollo', namespace, name),
    unity: path.resolve(project, 'Assets/Content/Music', namespace, name) };
}

export async function importScore(options: { project: string; cueId: string; midiPath: string; soundFont: string; tracks?: number[]; renderer?: Renderer }) {
  const { source } = cuePaths(options.project, options.cueId);
  try { await access(source); throw new Error(`Cue already exists: ${source}. Edit its config.json and use render.`); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const midiBytes = await readFile(options.midiPath);
  const inputFont = path.resolve(options.soundFont);
  const presets = await readSoundFont(inputFont);
  const font = path.resolve(options.project, 'Apollo/soundfonts', path.basename(inputFont));
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

export async function renderCue(project: string, cueId: string, renderer?: Renderer) {
  const { source, unity } = cuePaths(project, cueId);
  const config = configSchema.parse(JSON.parse(await readFile(path.join(source, 'config.json'), 'utf8')));
  if (config.cueId !== cueId) throw new Error('config.json cueId must match its namespace/name directory.');
  const inventory = await readSoundFont(path.resolve(source, config.soundFont));
  await writeFile(path.join(source, 'instruments.json'), JSON.stringify(inventory, null, 2) + '\n');
  await mkdir(path.join(project, 'Temp'), { recursive: true });
  const work = await mkdtemp(path.join(project, 'Temp', 'apollo-'));
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
          await exec(process.env.APOLLO_FFMPEG ?? 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(rendered, stem.file), '-codec:a', 'libvorbis', '-q:a', '6', encoded], { timeout: 600000, windowsHide: true });
        } catch (failure) {
          throw new Error(`Ogg encoding failed. Install FFmpeg with libvorbis or set APOLLO_FFMPEG: ${(failure as Error).message}`);
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
    // An index makes reuse visible to authors; the audio itself lives once in Unity's shared pool.
    const index = new Map<string, { file: string; uses: { cue: string; stem: string }[] }>();
    for (const entry of await readdir(path.dirname(unity), { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '_stems') continue;
      let cue;
      try { cue = JSON.parse(await readFile(path.join(path.dirname(unity), entry.name, 'cue.apollocue'), 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
      for (const stem of cue.stems) {
        if (!stem.file.startsWith('../_stems/')) continue;
        const item = index.get(stem.sha256) ?? { file: `Assets/Content/Music/${cueId.split(':')[0]}/_stems/${path.basename(stem.file)}`, uses: [] };
        item.uses.push({ cue: cue.id, stem: stem.id });
        index.set(stem.sha256, item);
      }
    }
    await writeFile(path.join(path.dirname(source), 'stems.json'), JSON.stringify(Object.fromEntries([...index].sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
    return { manifest, source, unity };
  } finally { await rm(work, { recursive: true, force: true }); }
}
