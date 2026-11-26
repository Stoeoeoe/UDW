import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { Connection, Revision, Sequence } from './clip-service';

const call = async <T>(path: string, data?: unknown): Promise<T> => {
  const response = await fetch(
    `http://127.0.0.1:3109/api/clips/${path}`,
    data === undefined
      ? {}
      : {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Mercurius': 'workbench',
          },
          body: JSON.stringify(data),
        },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
};
const connected = async () => {
  const value = await call<Connection>('filmcraft');
  assert.ok(value.connected);
  assert.equal(
    value.project.path?.replaceAll('\\', '/'),
    resolve('out/filmcraft-live-check/verified.fcproj').replaceAll('\\', '/'),
    'Only the separate test project may be edited',
  );
  return value;
};
const stripped = (sequence: Sequence) =>
  sequence.video.map((track) => ({
    ...track,
    items: track.items.map((clip) =>
      Object.fromEntries(
        Object.entries(clip).filter(
          ([key]) => key !== 'item' && key !== 'name',
        ),
      ),
    ),
  }));
const state = await call<{ revisions: Revision[] }>('state');
const revision = state.revisions.find(
  (revision) => revision.clipId === 'curtain-intro',
);
assert.ok(revision, 'Render the curtain first');
const before = await connected();
assert.ok(before.sequence);
const first = before.sequence.video[0].items[0];
const second = before.sequence.video[0].items[1];
const request = { clipId: revision.clipId, revisionId: revision.id };
await call('handoff', {
  ...request,
  mode: 'occurrence',
  stamp: before.stamp,
  targetClip: first.clip,
});
const after = await connected();
assert.ok(after.sequence);
assert.deepEqual(stripped(after.sequence), stripped(before.sequence));
assert.notEqual(after.sequence.video[0].items[0].item, first.item);
assert.equal(after.sequence.video[0].items[1].item, second.item);
await assert.rejects(
  () => call('handoff', { ...request, mode: 'import', stamp: before.stamp }),
  /changed/,
);
const unchanged = await connected();
assert.equal(unchanged.stamp, after.stamp);
await assert.rejects(
  () =>
    call('handoff', {
      ...request,
      mode: 'place',
      stamp: after.stamp,
      track: after.sequence!.video[0].id,
      frame: first.start / 8467200000,
    }),
  /occupied/,
);
assert.equal((await connected()).stamp, after.stamp);
await call('handoff', {
  ...request,
  mode: 'all',
  stamp: after.stamp,
  targetItem: second.item,
});
const all = await connected();
assert.deepEqual(all.sequence, after.sequence);
await writeFile(
  resolve('out/filmcraft-live-check/workbench-report.json'),
  JSON.stringify({ passed: true, revision, before, after, all }, null, 2),
);
console.log(
  'PASS: workbench replacement preserves the edit; stale targets and overlaps are rejected before mutation; shared-footage update leaves timeline structure unchanged.',
);
