import { z } from 'zod';
import {
  draftSchema,
  scriptMarkdown,
  timecode,
  wordCount,
  type Draft,
} from '../writer/script';

export const productionId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const shotSchema = z
  .object({
    status: z.enum(['needed', 'captured', 'edited']),
    media: z.string(),
    notes: z.string(),
  })
  .strict();
export const reviews = {
  evidence: 'Claims checked against source or gameplay',
  narration: 'Narration recorded and timed',
  picture: 'Picture and captions reviewed at phone size',
  sound: 'Voice, music, and sound mix reviewed',
  rights: 'Asset credits and permissions checked',
  delivery: 'Final export watched from start to finish',
} as const;
export const productionSchema = z
  .object({
    id: productionId,
    draft: draftSchema,
    shots: z.record(z.string(), shotSchema),
    review: z
      .object({
        evidence: z.boolean(),
        narration: z.boolean(),
        picture: z.boolean(),
        sound: z.boolean(),
        rights: z.boolean(),
        delivery: z.boolean(),
      })
      .strict(),
    description: z.string(),
    publishedUrl: z.union([z.literal(''), z.url()]),
  })
  .strict()
  .refine(
    (value) =>
      Object.keys(value.shots).every((id) =>
        value.draft.beats.some((beat) => beat.id === id),
      ),
    'Shots must reference existing beats',
  );
export type Production = z.infer<typeof productionSchema>;
export type Shot = z.infer<typeof shotSchema>;
export const emptyShot = (): Shot => ({
  status: 'needed',
  media: '',
  notes: '',
});
export const newProduction = (id: string, draft: Draft): Production => ({
  id,
  draft,
  shots: {},
  review: {
    evidence: false,
    narration: false,
    picture: false,
    sound: false,
    rights: false,
    delivery: false,
  },
  description: '',
  publishedUrl: '',
});
export const withDraft = (value: Production, draft: Draft): Production => ({
  ...value,
  draft,
  shots: Object.fromEntries(
    Object.entries(value.shots).filter(([id]) =>
      draft.beats.some((beat) => beat.id === id),
    ),
  ),
  review: newProduction(value.id, draft).review,
});
export const productionIssues = (value: Production) => {
  const issues: string[] = [];
  if (!value.draft.title.trim()) issues.push('Add a working title.');
  if (!value.draft.question.trim())
    issues.push('Define the question or change.');
  if (!value.draft.takeaway.trim()) issues.push('Write the takeaway.');
  for (const [index, beat] of value.draft.beats.entries()) {
    const label = `Beat ${index + 1}: ${beat.title}`;
    if (!beat.narration.trim()) issues.push(`${label} needs narration.`);
    if (!beat.visual.trim()) issues.push(`${label} needs visual directions.`);
    if (!beat.evidence.trim())
      issues.push(`${label} needs evidence or a verification note.`);
    if (
      (wordCount(beat.narration) / value.draft.wordsPerMinute) * 60 >
      beat.seconds
    )
      issues.push(`${label} exceeds its planned speaking time.`);
    const shot = value.shots[beat.id];
    if (!shot?.media.trim())
      issues.push(`${label} needs a media path or clip revision reference.`);
    if (shot?.status !== 'edited') issues.push(`${label} is not edited yet.`);
  }
  return issues;
};
export const handoffMarkdown = (value: Production) => {
  let elapsed = 0;
  return `${scriptMarkdown(value.draft)}\n## Production / ${value.id}\n\n${value.draft.beats
    .map((beat) => {
      const start = elapsed;
      elapsed += beat.seconds;
      const shot = value.shots[beat.id] ?? emptyShot();
      return `### ${timecode(start)}–${timecode(elapsed)} · ${beat.title}\n\nStatus: ${shot.status}\n\nMedia / clip revision: ${shot.media}\n\nCapture / edit notes: ${shot.notes}`;
    })
    .join('\n\n')}\n\n## Human review\n\n${Object.entries(reviews)
    .map(
      ([key, label]) =>
        `- [${value.review[key as keyof typeof reviews] ? 'x' : ' '}] ${label}`,
    )
    .join(
      '\n',
    )}\n\n## Description\n\n${value.description}\n\nPublished URL: ${value.publishedUrl}\n`;
};
