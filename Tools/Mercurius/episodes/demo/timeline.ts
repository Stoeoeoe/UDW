import type { EpisodeTimeline } from '../../src/shared/episode';
import { motion } from '../../src/shared/theme/motion';

const titleEnd = 138;
const explanationStart = titleEnd - motion.transitionFrames;
const explanationEnd = 558;
const proofStart = explanationEnd - motion.transitionFrames;
export const timeline = {
  scenes: {
    title: { from: 0, durationInFrames: titleEnd },
    explanation: {
      from: explanationStart,
      durationInFrames: explanationEnd - explanationStart,
    },
    proof: { from: proofStart, durationInFrames: 180 },
  },
  cues: {
    revealCode: explanationStart + 18,
    revealDependency: explanationStart + 72,
    emphasizeConstructor: explanationStart + 144,
    showTradeoff: explanationStart + 246,
  },
} satisfies EpisodeTimeline;
