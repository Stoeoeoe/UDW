import {
  access,
  mkdir,
  readdir,
  stat,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  episodeIdSchema,
  episodeSchema,
  timelineSchema,
  type EpisodeMetadata,
  type EpisodeTimeline,
} from '../src/shared/episode';
import { fontAssets } from '../src/shared/theme/tokens';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export type EpisodeDefinition = {
  directory: string;
  episode: unknown;
  timeline: unknown;
};
export type ValidEpisode = {
  episode: EpisodeMetadata;
  timeline: EpisodeTimeline;
};

export const exists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
};

export async function validateDefinitions(
  definitions: EpisodeDefinition[],
  root: string,
): Promise<ValidEpisode[]> {
  const errors: string[] = [];
  const ids = new Set<string>();
  const valid: ValidEpisode[] = [];
  const publicRoot = await realpath(resolve(root, 'public'));
  for (const definition of definitions) {
    const label = `episodes/${definition.directory}`;
    const metadata = episodeSchema.safeParse(definition.episode);
    const timing = timelineSchema.safeParse(definition.timeline);
    if (!metadata.success)
      errors.push(`${label}/episode.ts: ${metadata.error.message}`);
    if (!timing.success)
      errors.push(`${label}/timeline.ts: ${timing.error.message}`);
    if (!metadata.success || !timing.success) continue;
    const episode = metadata.data;
    const timeline = timing.data;
    if (ids.has(episode.id))
      errors.push(`${label}: duplicate episode ID '${episode.id}'`);
    ids.add(episode.id);
    if (episode.id !== definition.directory)
      errors.push(`${label}: ID '${episode.id}' must match its directory`);
    if (Object.keys(timeline.scenes).length === 0)
      errors.push(`${label}: timeline needs at least one scene`);
    for (const [name, scene] of Object.entries(timeline.scenes)) {
      if (scene.from + scene.durationInFrames > episode.durationInFrames)
        errors.push(
          `${label}: scene '${name}' ends beyond frame ${episode.durationInFrames}`,
        );
    }
    for (const [name, cue] of Object.entries(timeline.cues)) {
      if (cue >= episode.durationInFrames)
        errors.push(
          `${label}: cue '${name}' must be inside frames 0–${episode.durationInFrames - 1}`,
        );
    }
    for (const asset of [...fontAssets, ...episode.assets]) {
      const local =
        !isAbsolute(asset) &&
        !asset.includes('\\') &&
        !asset.split('/').includes('..') &&
        (asset.startsWith('shared/') ||
          asset.startsWith(`episodes/${episode.id}/`));
      if (!local) {
        errors.push(
          `${label}: asset '${asset}' must be a public-relative path under shared/ or episodes/${episode.id}/`,
        );
        continue;
      }
      try {
        const path = await realpath(resolve(publicRoot, asset));
        const contained = relative(publicRoot, path);
        if (contained.startsWith(`..${sep}`) || isAbsolute(contained))
          throw new Error('Asset resolves outside public/');
        if (!(await stat(path)).isFile())
          throw new Error('Asset must be a file');
      } catch (error) {
        errors.push(
          `${label}: missing or unreadable asset '${asset}': ${(error as Error).message}`,
        );
      }
    }
    valid.push({ episode, timeline });
  }
  if (errors.length)
    throw new Error(
      `Episode validation failed:\n${errors.map((error) => `  - ${error}`).join('\n')}`,
    );
  return valid;
}

export async function validateEpisodes(root = projectRoot) {
  const directories = (
    await readdir(resolve(root, 'episodes'), { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  if (directories.length === 0)
    throw new Error('No episodes found. Run npm run new-episode -- <id>.');
  const definitions: EpisodeDefinition[] = [];
  for (const directory of directories) {
    const folder = resolve(root, 'episodes', directory.name);
    for (const file of [
      'brief.md',
      'script.md',
      'episode.ts',
      'timeline.ts',
      'Episode.tsx',
    ]) {
      if (!(await exists(resolve(folder, file))))
        throw new Error(`episodes/${directory.name}: missing required ${file}`);
    }
    const { episode } = await import(
      pathToFileURL(resolve(folder, 'episode.ts')).href
    );
    const { timeline } = await import(
      pathToFileURL(resolve(folder, 'timeline.ts')).href
    );
    definitions.push({ directory: directory.name, episode, timeline });
  }
  return validateDefinitions(definitions, root);
}

export async function scaffoldEpisode(rawId: string, root = projectRoot) {
  const id = episodeIdSchema.parse(rawId);
  const folder = resolve(root, 'episodes', id);
  const media = resolve(root, 'public', 'episodes', id);
  for (const path of [folder, media]) {
    if (await exists(path))
      throw new Error(`Refusing to overwrite ${relative(root, path)}`);
  }
  const files: Record<string, string> = {
    'brief.md': `# ${id}\n\nAudience: TODO\n\nCentral question: TODO\n\nLearning outcome: TODO\n\nDemonstration: TODO\n\nTradeoffs: TODO\n\nUnverified claims: TODO — human review required.\n`,
    'script.md': `# Narration and visual directions\n\n## opening / frames 0–179\n\nNarration: TODO\n\nVisual: TitleCard in Episode.tsx. Replace with reviewed explanation.\n`,
    'episode.ts': `import type { EpisodeMetadata } from '../../src/shared/episode';\n\nexport const episode = {\n  id: '${id}',\n  title: '${id}',\n  width: 1080,\n  height: 1920,\n  fps: 30,\n  durationInFrames: 180,\n  assets: [],\n} satisfies EpisodeMetadata;\n`,
    'timeline.ts': `import type { EpisodeTimeline } from '../../src/shared/episode';\n\nexport const timeline = {\n  scenes: { opening: { from: 0, durationInFrames: 180 } },\n  cues: { title: 0 },\n} satisfies EpisodeTimeline;\n`,
    'Episode.tsx': `import { Sequence } from 'remotion';\nimport { Presentation } from '../../src/shared/theme/Presentation';\nimport { Opening } from './scenes/Opening';\nimport { timeline } from './timeline';\n\nexport const Episode = () => <Presentation>\n  <Sequence from={timeline.scenes.opening.from} durationInFrames={timeline.scenes.opening.durationInFrames}>\n    <Opening />\n  </Sequence>\n</Presentation>;\n`,
    'scenes/Opening.tsx': `import { AbsoluteFill } from 'remotion';\nimport { TitleCard } from '../../../src/shared/components/TitleCard';\n\nexport const Opening = () => <AbsoluteFill className="video-safe">\n  <TitleCard title="${id}" subtitle="Replace with a reviewed technical explanation." />\n</AbsoluteFill>;\n`,
    'snippets/.gitkeep': '',
  };
  await mkdir(dirname(folder), { recursive: true });
  await mkdir(dirname(media), { recursive: true });
  await mkdir(folder);
  await mkdir(media);
  await writeFile(resolve(media, '.gitkeep'), '', { flag: 'wx' });
  for (const [file, content] of Object.entries(files)) {
    await mkdir(dirname(resolve(folder, file)), { recursive: true });
    await writeFile(resolve(folder, file), content, { flag: 'wx' });
  }
  return id;
}
