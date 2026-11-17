import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { episode } from '../episodes/demo/episode';
import { timeline } from '../episodes/demo/timeline';
import { fontAssets } from '../src/shared/theme/tokens';
import {
  scaffoldEpisode,
  validateDefinitions,
  validateEpisodes,
  projectRoot,
} from './episodes';

test('authored demo and its local assets validate', async () => {
  const result = await validateEpisodes(projectRoot);
  assert.ok(result.some(({ episode: item }) => item.id === 'demo'));
});

test('validation reports invalid metadata, timing, IDs, and assets', async () => {
  const definition = { directory: 'demo', episode, timeline };
  await assert.rejects(
    validateDefinitions(
      [definition, { ...definition, directory: 'duplicate-demo' }],
      projectRoot,
    ),
    /duplicate episode ID/,
  );
  await assert.rejects(
    validateDefinitions(
      [{ ...definition, episode: { ...episode, width: 0 } }],
      projectRoot,
    ),
    /episode.ts/,
  );
  await assert.rejects(
    validateDefinitions(
      [
        {
          ...definition,
          timeline: {
            scenes: { overrun: { from: 710, durationInFrames: 30 } },
            cues: { end: 720 },
          },
        },
      ],
      projectRoot,
    ),
    /scene 'overrun'[\s\S]*cue 'end'/,
  );
  await assert.rejects(
    validateDefinitions(
      [
        {
          ...definition,
          episode: { ...episode, assets: ['episodes/demo/missing.mp4'] },
        },
      ],
      projectRoot,
    ),
    /missing or unreadable asset/,
  );
  await assert.rejects(
    validateDefinitions(
      [{ ...definition, episode: { ...episode, assets: ['../secret.txt'] } }],
      projectRoot,
    ),
    /public-relative path/,
  );
});

test('scaffold creates complete custom scenes and refuses invalid IDs or either occupied destination', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'mercurius-'));
  try {
    for (const asset of fontAssets) {
      await mkdir(resolve(root, 'public/shared/fonts'), { recursive: true });
      await writeFile(
        resolve(root, 'public', asset),
        await readFile(resolve(projectRoot, 'public', asset)),
      );
    }
    await assert.rejects(scaffoldEpisode('../escape', root), /kebab-case/);
    await scaffoldEpisode('test-episode', root);
    const original = await readFile(
      resolve(root, 'episodes/test-episode/episode.ts'),
      'utf8',
    );
    assert.equal((await validateEpisodes(root))[0].episode.id, 'test-episode');
    await assert.rejects(
      scaffoldEpisode('test-episode', root),
      /Refusing to overwrite/,
    );
    assert.equal(
      await readFile(resolve(root, 'episodes/test-episode/episode.ts'), 'utf8'),
      original,
    );
    await mkdir(resolve(root, 'public/episodes/occupied'));
    await assert.rejects(
      scaffoldEpisode('occupied', root),
      /Refusing to overwrite/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
