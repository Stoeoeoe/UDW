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
        <AbsoluteFill className="bg-canvas video-safe">
          <TitleCard
            title="Make the dependency visible."
            subtitle="How Delivery receives its Inventory."
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
        <AbsoluteFill className="bg-canvas video-safe">
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
        <AbsoluteFill className="bg-canvas video-safe">
          <ProofScene />
        </AbsoluteFill>
      </TransitionSeries.Sequence>
    </TransitionSeries>
    <div className="absolute top-20 left-safe right-safe font-mono text-2xl text-muted">
      <span>MERCURIUS / ROEMER</span>
    </div>
  </Presentation>
);
