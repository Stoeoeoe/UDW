import assert from 'node:assert/strict';
import test from 'node:test';
import {
  draftSchema,
  makeDraft,
  narrationText,
  plannedSeconds,
  scriptMarkdown,
} from '../src/playground/writer/script';

test('saved draft round trip preserves multiline writing and authored order in exports', () => {
  const draft = makeDraft('devlog');
  draft.title = 'Market | notes';
  draft.beats[0].narration = 'First line.\nA second paragraph: café, “yes”.';
  draft.beats[0].visual = 'Capture A\nHold on the result.';
  draft.beats[0].evidence = 'source.ts:12 @ revision';
  draft.beats[1].narration = 'Then the explanation.';
  const imported = draftSchema.parse(JSON.parse(JSON.stringify(draft)));
  assert.deepEqual(imported, draft);
  assert.equal(plannedSeconds(imported), 45);
  const markdown = scriptMarkdown(imported);
  assert.ok(markdown.includes('00:00–00:04'));
  assert.ok(markdown.includes('00:04–00:11'));
  assert.ok(markdown.includes(draft.beats[0].visual));
  assert.ok(markdown.includes(draft.beats[0].evidence));
  assert.equal(
    narrationText(imported),
    `${draft.beats[0].narration}\n\nThen the explanation.`,
  );
  imported.beats = [imported.beats[1], imported.beats[0]];
  assert.ok(scriptMarkdown(imported).includes('00:00–00:07 · Before'));
});

test('import rejects malformed drafts, duplicate identities, and invalid timing', () => {
  const draft = makeDraft('explainer');
  assert.equal(draftSchema.safeParse({ ...draft, beats: [] }).success, false);
  assert.equal(
    draftSchema.safeParse({ ...draft, beats: [draft.beats[0], draft.beats[0]] })
      .success,
    false,
  );
  assert.equal(
    draftSchema.safeParse({ ...draft, wordsPerMinute: 0 }).success,
    false,
  );
  assert.equal(
    draftSchema.safeParse({
      ...draft,
      beats: [{ ...draft.beats[0], seconds: -1 }],
    }).success,
    false,
  );
  assert.equal(
    draftSchema.safeParse({
      ...draft,
      beats: [{ ...draft.beats[0], narration: 42 }],
    }).success,
    false,
  );
});
