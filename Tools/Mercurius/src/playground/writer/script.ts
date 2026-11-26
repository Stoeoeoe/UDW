import { z } from 'zod';

const beatSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    seconds: z.number().positive().max(600),
    narration: z.string(),
    visual: z.string(),
    evidence: z.string(),
  })
  .strict();

export const draftSchema = z
  .object({
    title: z.string(),
    audience: z.string(),
    question: z.string(),
    takeaway: z.string(),
    notes: z.string(),
    targetSeconds: z.number().positive().max(600),
    wordsPerMinute: z.number().min(60).max(300),
    beats: z.array(beatSchema).min(1).max(100),
  })
  .strict()
  .refine(
    (draft) =>
      new Set(draft.beats.map((beat) => beat.id)).size === draft.beats.length,
    'Beat IDs must be unique',
  );

export type Draft = z.infer<typeof draftSchema>;
export type Beat = Draft['beats'][number];
export type Template = 'devlog' | 'explainer';
export const storageKey = 'mercurius-script-draft';

export const templates = {
  devlog: [
    [
      'The change',
      4,
      'What changed, and why would a player care?',
      'Show the change immediately. Narration can begin over the one-second curtain.',
    ],
    [
      'Before',
      7,
      'Describe the specific situation that prompted the change.',
      'Show the old behaviour or the concrete problem.',
    ],
    [
      'What I did',
      15,
      'Explain the decision that made the difference.',
      'Show the relevant gameplay, editor action, or a small diagram.',
    ],
    [
      'Show it working',
      13,
      'Describe what the viewer can now observe.',
      'Repeat the same situation after the change. Leave time to see the result.',
    ],
    [
      'Where it stands',
      6,
      'What is the result, and what limitation remains?',
      'End on the outcome. A genuine question is optional.',
    ],
  ],
  explainer: [
    [
      'The question',
      4,
      'Ask one concrete question the video will answer.',
      'Show the behaviour or relationship that needs explaining. Narration can begin over the curtain.',
    ],
    [
      'The situation',
      7,
      'Give only the context needed to understand the example.',
      'Use one real caller or authored scenario.',
    ],
    [
      'How it works',
      15,
      'Explain the mechanism in the order it happens.',
      'Reveal one relationship at a time. Highlight the line or connection being discussed.',
    ],
    [
      'The demonstration',
      13,
      'Walk through what happens in this example.',
      'Show evidence: gameplay, a reproducible trace, or the actual source.',
    ],
    [
      'The answer',
      6,
      'Answer the opening question and name a relevant limit.',
      'Hold the result long enough to read.',
    ],
  ],
} as const;

export const makeDraft = (template: Template): Draft => ({
  title: '',
  audience: '',
  question: '',
  takeaway: '',
  notes: '',
  targetSeconds: 45,
  wordsPerMinute: 150,
  beats: templates[template].map(([title, seconds]) => ({
    id: crypto.randomUUID(),
    title,
    seconds,
    narration: '',
    visual: '',
    evidence: '',
  })),
});

export const wordCount = (text: string) =>
  text.trim().match(/\S+/gu)?.length ?? 0;
export const narrationText = (draft: Draft) =>
  draft.beats
    .map((beat) => beat.narration.trim())
    .filter(Boolean)
    .join('\n\n');
export const plannedSeconds = (draft: Draft) =>
  draft.beats.reduce((total, beat) => total + beat.seconds, 0);
export const timecode = (seconds: number) => {
  const tenths = Math.round(seconds * 10);
  return `${String(Math.floor(tenths / 600)).padStart(2, '0')}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}${tenths % 10 ? `.${tenths % 10}` : ''}`;
};
export const scriptMarkdown = (draft: Draft) => {
  let elapsed = 0;
  return (
    [
      `# ${draft.title || 'Untitled video'}`,
      `Audience: ${draft.audience}\n\nQuestion: ${draft.question}\n\nTakeaway: ${draft.takeaway}`,
      `Target: ${draft.targetSeconds}s · Planned: ${plannedSeconds(draft)}s · 1080 × 1920 / 30 FPS`,
      ...draft.beats.map((beat) => {
        const start = elapsed;
        elapsed += beat.seconds;
        return `## ${timecode(start)}–${timecode(elapsed)} · ${beat.title}\n\n### Narration\n\n${beat.narration}\n\n### Visual / sound\n\n${beat.visual}\n\n### Evidence / to verify\n\n${beat.evidence}`;
      }),
      `## Scratchpad\n\n${draft.notes}`,
    ].join('\n\n') + '\n'
  );
};
