import { AbsoluteFill } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { TitleCard } from '../../src/shared/components/TitleCard';
import { Presentation } from '../../src/shared/theme/Presentation';
import { motion } from '../../src/shared/theme/motion';
import { timeline } from './timeline';
import { DependencyScene } from './scenes/DependencyScene';
import { ProofScene } from './scenes/ProofScene';

export const Episode = () => (
  <Presentation>
    <TransitionSeries>
      <TransitionSeries.Sequence
        durationInFrames={timeline.scenes.title.durationInFrames}
      >
        <AbsoluteFill className="bg-canvas p-safe">
          <TitleCard
            title="Make the dependency visible."
            subtitle="A small code example. One relationship. A visible cost."
            kicker="Roemer / Component study 001"
          />
        </AbsoluteFill>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: motion.transitionFrames })}
      />
      <TransitionSeries.Sequence
        durationInFrames={timeline.scenes.explanation.durationInFrames}
      >
        <AbsoluteFill className="bg-canvas p-safe">
          <DependencyScene />
        </AbsoluteFill>
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: motion.transitionFrames })}
      />
      <TransitionSeries.Sequence
        durationInFrames={timeline.scenes.proof.durationInFrames}
      >
        <AbsoluteFill className="bg-canvas p-safe">
          <ProofScene />
        </AbsoluteFill>
      </TransitionSeries.Sequence>
    </TransitionSeries>
    <div className="absolute bottom-7 left-safe right-safe flex justify-between font-mono text-lg text-muted">
      <span>MERCURIUS / VISUAL STUDY</span>
      <span>ROEMER · DEVLOG FOUNDATION</span>
    </div>
  </Presentation>
);
