import test from 'node:test';
import assert from 'node:assert/strict';
import { clipSchema, newClip } from '../src/clips/schema';
import {
  handoffSchema,
  requireCoverage,
  requireSpace,
  sequenceRequestSchema,
} from './clip-service';

test('portrait sequence creation requires an explicit name and inspected target', () => {
  assert.deepEqual(
    sequenceRequestSchema.parse({
      name: '  Roemer short  ',
      stamp: 'inspected-project',
    }),
    { name: 'Roemer short', stamp: 'inspected-project' },
  );
  assert.equal(
    sequenceRequestSchema.safeParse({ name: '   ', stamp: 'inspected-project' })
      .success,
    false,
  );
  assert.equal(
    sequenceRequestSchema.safeParse({ name: 'Roemer short' }).success,
    false,
  );
});

test('clip inputs reject invalid identities, timing and nonexistent emphasis lines', () => {
  const curtain = newClip('curtain', 'curtain-intro');
  assert.deepEqual(
    clipSchema.parse(JSON.parse(JSON.stringify(curtain))),
    curtain,
  );
  assert.equal(
    clipSchema.safeParse({ ...curtain, id: '../outside' }).success,
    false,
  );
  assert.equal(
    clipSchema.safeParse({ ...curtain, holdFrames: 25 }).success,
    false,
  );
  assert.equal(
    clipSchema.safeParse({ ...curtain, accent: 'red' }).success,
    false,
  );
  const code = { ...newClip('code', 'code-walkthrough'), emphasis: [2] };
  assert.equal(clipSchema.safeParse(code).success, false);
  const dependency = newClip('dependency', 'dependency');
  assert.equal(
    clipSchema.safeParse({ ...dependency, focusAt: 180 }).success,
    false,
  );
});

test('replacement uses the source out-point, including trims, rather than timeline length', () => {
  const tick = 254016000000;
  requireCoverage(0.8 * tick, 30);
  assert.throws(() => requireCoverage(0.8 * tick, 18), /too short/);
});

test('placement permits adjacent clips and rejects overlap or locked destinations', () => {
  const track = {
    id: 2,
    name: 'Video 1',
    locked: false,
    transitions: [],
    items: [
      {
        clip: 10,
        item: 1,
        name: 'curtain-intro.mp4',
        start: 60,
        end: 90,
        sourceIn: 6,
        sourceOut: 24,
      },
    ],
  };
  requireSpace(track, 30, 60);
  requireSpace(track, 90, 120);
  assert.throws(() => requireSpace(track, 70, 100), /occupied/);
  assert.throws(
    () => requireSpace({ ...track, locked: true }, 90, 120),
    /locked/,
  );
  assert.equal(
    handoffSchema.safeParse({
      mode: 'import',
      clipId: 'curtain-intro',
      revisionId: '../other',
      stamp: 'test',
    }).success,
    false,
  );
});
