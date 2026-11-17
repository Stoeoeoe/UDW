import { z } from 'zod';

export const episodeIdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
    'Use lowercase kebab-case, starting with a letter',
  );
export const episodeSchema = z
  .object({
    id: episodeIdSchema,
    title: z.string().trim().min(1),
    width: z.number().int().positive().multipleOf(2),
    height: z.number().int().positive().multipleOf(2),
    fps: z.number().int().positive(),
    durationInFrames: z.number().int().positive(),
    assets: z.array(z.string().min(1)),
  })
  .strict();
export type EpisodeMetadata = z.infer<typeof episodeSchema>;
const frame = z.number().int().nonnegative();
export const timelineSchema = z
  .object({
    scenes: z.record(
      z.string().min(1),
      z
        .object({ from: frame, durationInFrames: z.number().int().positive() })
        .strict(),
    ),
    cues: z.record(z.string().min(1), frame),
  })
  .strict();
export type EpisodeTimeline = z.infer<typeof timelineSchema>;
