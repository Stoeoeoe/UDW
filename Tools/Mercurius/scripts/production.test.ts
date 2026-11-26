import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProductionService } from './production-service';
import {
  emptyShot,
  handoffMarkdown,
  newProduction,
  productionIssues,
  productionSchema,
  withDraft,
} from '../src/playground/production/model';
import { makeDraft } from '../src/playground/writer/script';

test('episode library persists scripts and capture references, rejects duplicate imports and stale saves', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mercurius-production-'));
  try {
    const service = new ProductionService(directory);
    const value = newProduction('inventory-contract', makeDraft('devlog'));
    value.draft.title = 'Inventory changes';
    value.draft.beats[0].narration =
      'A full inventory now leaves the item on the ground.';
    value.shots[value.draft.beats[0].id] = {
      status: 'captured',
      media: 'public/episodes/inventory-contract/full-inventory.mp4',
      notes: 'Show the same pickup before and after.',
    };
    const first = await service.save({ value, revision: null });
    assert.deepEqual((await new ProductionService(directory).list())[0], first);
    await assert.rejects(
      service.save({ value, revision: null }),
      /changed on disk/,
    );
    value.description = 'Inventory devlog\nCredits: local capture.';
    const saves = await Promise.allSettled([
      service.save({ value, revision: first.revision }),
      service.save({
        value: { ...value, description: 'A second tab' },
        revision: first.revision,
      }),
    ]);
    assert.equal(saves[0].status, 'fulfilled');
    assert.equal(saves[1].status, 'rejected');
    assert.equal(
      JSON.parse(
        await readFile(join(directory, 'inventory-contract.json'), 'utf8'),
      ).description,
      value.description,
    );
    assert.throws(() =>
      service.save({ value: { ...value, id: '../escape' }, revision: null }),
    );
    await writeFile(join(directory, 'broken.json'), '{}');
    await assert.rejects(service.list());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('script revision preserves captures by beat identity and invalidates human review', () => {
  const value = newProduction('inventory', makeDraft('devlog'));
  const first = value.draft.beats[0];
  const removed = value.draft.beats[1];
  value.shots[first.id] = emptyShot();
  value.shots[removed.id] = emptyShot();
  value.review.evidence = true;
  const updated = withDraft(value, {
    ...value.draft,
    beats: [value.draft.beats[2], first],
  });
  assert.deepEqual(Object.keys(updated.shots), [first.id]);
  assert.equal(updated.review.evidence, false);
  assert.ok(productionSchema.safeParse(updated).success);
  assert.equal(productionSchema.safeParse(valueWithOrphan()).success, false);
  function valueWithOrphan() {
    return { ...updated, shots: { missing: emptyShot() } };
  }
});

test('handoff follows script order and retains multiline production notes and review state', () => {
  const value = newProduction('inventory', makeDraft('devlog'));
  const beat = value.draft.beats[0];
  beat.narration = 'one '.repeat(30);
  value.shots[beat.id] = {
    status: 'edited',
    media: 'inventory-code / r1-abcdef',
    notes: 'Retake A\nHold on the result.',
  };
  value.review.sound = true;
  const output = handoffMarkdown(value);
  assert.ok(output.includes('00:00–00:04'));
  assert.ok(output.includes(value.shots[beat.id].notes));
  assert.ok(output.includes('[x] Voice, music, and sound mix reviewed'));
  assert.ok(
    productionIssues(value).some((issue) => issue.includes('speaking time')),
  );
  assert.ok(
    productionIssues(value).some((issue) =>
      issue.includes('Beat 2: Before needs a media'),
    ),
  );
});
