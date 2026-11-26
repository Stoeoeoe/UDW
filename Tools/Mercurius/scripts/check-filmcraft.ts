import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Filmcraft, filmcraftExe } from './filmcraft';

// Runs in its own desktop session and data directory; never opens the user's edit.
const directory = resolve('out/filmcraft-live-check');
await mkdir(directory, { recursive: true });
const token = randomBytes(32).toString('hex');
const client = new Filmcraft(19876, token);
const app = spawn(
  filmcraftExe(),
  [
    '--empty',
    '--no-recover',
    '--data-dir',
    resolve(directory, 'data'),
    '--control',
    '19876',
  ],
  {
    env: { ...process.env, FILMCRAFT_CONTROL_TOKEN: token },
    windowsHide: true,
    stdio: 'ignore',
  },
);
app.on('error', (error) => {
  throw error;
});
type Clip = {
  clip: number;
  item: number;
  name: string;
  sourceIn: number;
  sourceOut: number;
  start: number;
  end: number;
  [key: string]: unknown;
};
type Sequence = {
  id: number;
  video: { id: number; items: Clip[]; transitions: unknown[] }[];
  [key: string]: unknown;
};
const inspect = () => client.execute<Sequence>('sequence.inspect');
const stripped = (clip: Clip) => {
  return Object.fromEntries(
    Object.entries(clip).filter(([key]) => key !== 'item' && key !== 'name'),
  );
};
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await client.execute('project.inspect');
      ready = true;
      break;
    } catch {
      await new Promise((done) => setTimeout(done, 500));
    }
  }
  assert.ok(ready, 'Separate FilmCraft session started');
  const original = resolve('out/curtain-intro.mp4');
  const revised = resolve(directory, 'curtain-revision.mp4');
  await copyFile(original, revised);
  const { items } = await client.execute<{ items: number[] }>('file.import', {
    paths: [original, revised],
  });
  const sequence = await client.execute<{ sequence: number }>(
    'file.newSequence',
    { name: 'Mercurius replacement check', width: 1080, height: 1920, fps: 30 },
  );
  await client.execute('timeline.place', {
    item: items[0],
    track: 'V1',
    seconds: 2,
    sourceIn: { frame: 6 },
    duration: { frame: 18 },
    audio: false,
  });
  await client.execute('timeline.place', {
    item: items[0],
    track: 'V1',
    seconds: 4,
    audio: false,
  });
  const initial = await inspect();
  const bin = await client.execute<{ bin: number }>('file.newBin', {
    name: 'Mercurius',
  });
  const imported = await client.execute<{ items: number[] }>('file.import', {
    paths: [revised],
    bin: bin.bin,
  });
  await client.execute('clip.rename', {
    item: imported.items[0],
    name: 'Placement check revision',
  });
  const afterImport = await inspect();
  assert.deepEqual(
    afterImport,
    initial,
    'Import and naming must not change the target sequence',
  );
  await client.execute('timeline.place', {
    item: imported.items[0],
    track: 'V2',
    frame: 0,
    audio: false,
    insert: false,
  });
  const placed = await inspect();
  assert.equal(placed.video[1].items[0].item, imported.items[0]);
  assert.equal(placed.video[1].items[0].start, 0);
  await client.execute('edit.undo');
  const first = initial.video[0].items[0].clip;
  const second = initial.video[0].items[1].clip;
  await client.execute('effects.setParam', {
    clip: first,
    effect: 'motion',
    param: 'scale',
    value: 87,
  });
  await client.execute('effects.setParam', {
    clip: first,
    effect: 'opacity',
    param: 'opacity',
    value: 76,
  });
  await client.execute('trim.applyDefaultTransition', { clips: [first] });
  const before = await inspect();
  await client.execute('clip.replaceFromBin', {
    clips: [first],
    item: items[1],
    keepSourceIn: true,
  });
  const after = await inspect();
  assert.equal(after.video[0].items[0].item, items[1]);
  assert.equal(after.video[0].items[1].item, items[0]);
  assert.deepEqual(
    stripped(after.video[0].items[0]),
    stripped(before.video[0].items[0]),
  );
  assert.deepEqual(after.video[0].transitions, before.video[0].transitions);
  await client.execute('edit.undo');
  assert.deepEqual(await inspect(), before);
  const other = await client.execute<{ sequence: number }>('file.newSequence', {
    name: 'Second sequence',
    width: 1080,
    height: 1920,
    fps: 30,
  });
  await client.execute('timeline.place', {
    item: items[0],
    track: 'V1',
    seconds: 0,
    audio: false,
  });
  await client.execute('sequence.open', { item: sequence.sequence });
  const beforeShared = await inspect();
  const otherBefore = await client.execute('sequence.inspect', {
    item: other.sequence,
  });
  await client.execute('media.replaceFootage', {
    item: items[0],
    path: revised,
  });
  const shared = await inspect();
  assert.deepEqual(shared, beforeShared);
  const media = await client.execute('media.status', { item: items[0] });
  assert.ok(
    JSON.stringify(media)
      .replaceAll('\\\\', '/')
      .includes('curtain-revision.mp4'),
    'Shared media points to the revision',
  );
  assert.deepEqual(
    await client.execute('sequence.inspect', { item: other.sequence }),
    otherBefore,
  );
  const project = await client.execute('project.inspect');
  await client.execute('edit.undo');
  await client.execute('file.saveAs', {
    path: resolve(directory, 'verified.fcproj'),
  });
  await writeFile(
    resolve(directory, 'report.json'),
    JSON.stringify(
      {
        passed: true,
        sequence: sequence.sequence,
        first,
        second,
        before,
        after,
        shared,
        project,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: import/name/place reaches the chosen timeline track; replacement preserves trims, placement, effects and transitions; one occurrence is isolated; undo restores the sequence.',
  );
} finally {
  await client.request('app.quit').catch(() => app.kill());
}
