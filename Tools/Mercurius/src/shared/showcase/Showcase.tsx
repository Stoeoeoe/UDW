import { Badge, Button, Group } from '@mantine/core';
import { AbsoluteFill, Sequence } from 'remotion';
import { DependencyScene } from '../../../episodes/demo/scenes/DependencyScene';
import { ProofScene } from '../../../episodes/demo/scenes/ProofScene';
import { TitleCard } from '../components/TitleCard';
import { Presentation } from '../theme/Presentation';

export const showcaseDuration = 720;
export const Showcase = () => (
  <Presentation>
    <Sequence durationInFrames={120}>
      <AbsoluteFill className="video-safe">
        <TitleCard
          title="A shared visual vocabulary."
          subtitle="Title → code + diagram → media + callout. Scrub to inspect every state."
          kicker="Mercurius / Component showcase"
        />
      </AbsoluteFill>
    </Sequence>
    <Sequence from={120} durationInFrames={420}>
      <AbsoluteFill className="video-safe">
        <DependencyScene />
      </AbsoluteFill>
    </Sequence>
    <Sequence from={540}>
      <AbsoluteFill className="video-safe">
        <ProofScene />
      </AbsoluteFill>
    </Sequence>
    <Group className="absolute bottom-32 left-safe" gap="md">
      <Badge className="border-accent bg-canvas font-mono text-accent">
        Mantine + Tailwind
      </Badge>
      <Button className="border border-border bg-raised text-ink" size="md">
        Utility override check
      </Button>
    </Group>
  </Presentation>
);
