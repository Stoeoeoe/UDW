import { z } from 'zod';

const common = {
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  name: z.string().min(1).max(100),
  direction: z.enum(['parchment', 'terracotta']),
  ornament: z.enum(['meander', 'laurel', 'wave', 'none']),
  durationFrames: z.number().int().min(5).max(1800),
};
const cue = z.number().int().nonnegative();
export const clipSchema = z
  .discriminatedUnion('scene', [
    z
      .object({
        ...common,
        scene: z.literal('curtain'),
        wordmark: z.string().max(24),
        holdFrames: cue,
        openingFrames: z.number().int().min(5),
        accent: z.string().regex(/^#[\da-f]{6}$/i),
      })
      .strict(),
    z
      .object({
        ...common,
        scene: z.literal('code'),
        heading: z.string().max(90),
        code: z.string().min(1).max(4000),
        filename: z.string().max(80),
        language: z.enum([
          'csharp',
          'typescript',
          'json',
          'lua',
          'shellscript',
        ]),
        revealAt: cue,
        focusAt: cue,
        emphasis: z.array(z.number().int().positive()),
      })
      .strict(),
    z
      .object({
        ...common,
        scene: z.literal('dependency'),
        heading: z.string().max(90),
        from: z.string().min(1).max(24),
        to: z.string().min(1).max(24),
        connection: z.string().max(24),
        revealAt: cue,
        focusAt: cue,
      })
      .strict(),
  ])
  .superRefine((clip, ctx) => {
    if (clip.scene === 'curtain') {
      if (clip.holdFrames + clip.openingFrames > clip.durationFrames)
        ctx.addIssue({
          code: 'custom',
          message: 'The closed hold and opening must fit inside the clip.',
        });
    } else {
      if (
        clip.revealAt >= clip.durationFrames ||
        clip.focusAt >= clip.durationFrames
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Reveal and focus cues must be inside the clip.',
        });
      if (
        clip.scene === 'code' &&
        clip.emphasis.some((line) => line > clip.code.split('\n').length)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'A highlighted line does not exist in the code.',
        });
    }
  });
export type ClipSpec = z.infer<typeof clipSchema>;
export type SceneKind = ClipSpec['scene'];
export const newClip = (scene: SceneKind, id: string): ClipSpec => {
  const base = {
    id,
    name:
      scene === 'curtain'
        ? 'Curtain intro'
        : scene === 'code'
          ? 'Code walkthrough'
          : 'Dependency',
    direction: 'parchment' as const,
    ornament: 'meander' as const,
  };
  if (scene === 'curtain')
    return {
      ...base,
      scene,
      durationFrames: 30,
      wordmark: 'ROEMER',
      holdFrames: 15,
      openingFrames: 15,
      accent: '#742d32',
    };
  if (scene === 'code')
    return {
      ...base,
      scene,
      durationFrames: 180,
      heading: '',
      code: '// Paste the excerpt to explain.',
      filename: 'Example.cs',
      language: 'csharp',
      revealAt: 0,
      focusAt: 60,
      emphasis: [],
    };
  return {
    ...base,
    scene,
    durationFrames: 180,
    heading: '',
    from: 'Caller',
    to: 'Dependency',
    connection: 'requires',
    revealAt: 15,
    focusAt: 90,
  };
};
