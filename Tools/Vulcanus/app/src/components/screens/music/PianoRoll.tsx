import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, HStack, Text } from '@chakra-ui/react';
import type { MidiInfo, MusicConfig } from '../../../lib/musicApi';
import { InspectorSection } from '../../common/Fields';

interface Props {
  midi: MidiInfo;
  config: MusicConfig;
  /** Seconds into the looping preview, or null when nothing is playing. */
  position: () => number | null;
  playing: boolean;
  /** Called with seconds into the loop when the roll is clicked or dragged during playback. */
  onSeek: (seconds: number) => void;
}

const HEIGHT = 200;
const UNASSIGNED = 'rgba(160,160,160,0.5)';

const stemColor = (index: number) => `hsl(${(index * 47) % 360} 65% 62%)`;

/** All notes over time, coloured by stem, with the loop marked and a playhead while previewing. */
export const PianoRoll: React.FC<Props> = ({ midi, config, position, playing, onSeek }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const lastSeek = useRef(0);
  const playhead = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  const layout = useMemo(() => {
    const meter = midi.meters[0] ?? { numerator: 4, denominator: 4 };
    const ticksPerBar = (midi.ticksPerBeat * meter.numerator * 4) / meter.denominator;
    const loopStart = (config.loop.startBar - 1) * ticksPerBar;
    const loopEnd = (config.loop.endBar - 1) * ticksPerBar;
    const total = Math.max(midi.endTick, loopEnd, 1);
    const pitches = midi.notes.map((note) => note.pitch);
    const low = Math.min(...pitches, 127) - 1;
    const high = Math.max(...pitches, 0) + 1;
    return { ticksPerBar, loopStart, loopEnd, total, low, high: Math.max(high, low + 12) };
  }, [midi, config.loop.startBar, config.loop.endBar]);

  const seek = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!playing) return;
    // While dragging, seeking restarts the audio, so it is limited to ten times a second.
    if (
      event.type === 'pointermove' &&
      (event.buttons !== 1 || event.timeStamp - lastSeek.current < 100)
    )
      return;
    lastSeek.current = event.timeStamp;
    const bounds = event.currentTarget.getBoundingClientRect();
    const tick = ((event.clientX - bounds.left) / bounds.width) * layout.total;
    const inLoop = Math.min(Math.max(tick, layout.loopStart), layout.loopEnd - 1);
    onSeek(((inLoop - layout.loopStart) / midi.ticksPerBeat) * (60 / (midi.tempos[0]?.bpm ?? 120)));
  };

  const colorOf = (track: number) => {
    const stem = config.stems.findIndex((s) => s.tracks.includes(track));
    return stem < 0 ? UNASSIGNED : stemColor(stem);
  };

  // Follow the container width.
  useEffect(() => {
    const element = canvas.current?.parentElement;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context || !width) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = width * ratio;
    element.height = HEIGHT * ratio;
    context.scale(ratio, ratio);
    const { ticksPerBar, loopStart, loopEnd, total, low, high } = layout;
    const x = (tick: number) => (tick / total) * width;
    const rows = high - low + 1;
    const rowHeight = HEIGHT / rows;

    context.fillStyle = 'rgba(255,255,255,0.04)';
    context.fillRect(0, 0, width, HEIGHT);

    // Bar lines, with the bar number every fourth bar.
    context.font = '10px sans-serif';
    for (let bar = 0; bar * ticksPerBar <= total; bar++) {
      const strong = bar % 4 === 0;
      context.fillStyle = strong ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)';
      context.fillRect(x(bar * ticksPerBar), 0, 1, HEIGHT);
      if (strong) {
        context.fillStyle = 'rgba(255,255,255,0.45)';
        context.fillText(String(bar + 1), x(bar * ticksPerBar) + 3, 10);
      }
    }

    for (const note of midi.notes) {
      context.fillStyle = colorOf(note.track);
      context.fillRect(
        x(note.start),
        (high - note.pitch) * rowHeight,
        Math.max(1, x(note.end) - x(note.start)),
        Math.max(1, rowHeight - 0.5),
      );
    }

    // Everything outside the loop is dimmed; its edges are marked.
    context.fillStyle = 'rgba(0,0,0,0.45)';
    context.fillRect(0, 0, x(loopStart), HEIGHT);
    context.fillRect(x(loopEnd), 0, width - x(loopEnd), HEIGHT);
    context.fillStyle = 'rgba(255,255,255,0.8)';
    context.fillRect(x(loopStart), 0, 2, HEIGHT);
    context.fillRect(x(loopEnd) - 2, 0, 2, HEIGHT);
  }, [width, layout, midi.notes, config.stems]);

  // The playhead moves every frame while previewing, so it bypasses React state.
  useEffect(() => {
    const head = playhead.current;
    if (!head) return;
    if (!playing) {
      head.style.display = 'none';
      return;
    }
    let frame = 0;
    const tick = () => {
      const seconds = position();
      if (seconds !== null) {
        const ticks =
          layout.loopStart +
          ((Math.max(0, seconds) * (midi.tempos[0]?.bpm ?? 120)) / 60) * midi.ticksPerBeat;
        head.style.display = 'block';
        head.style.left = `${(ticks / layout.total) * width}px`;
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [playing, position, layout, width, midi.tempos, midi.ticksPerBeat]);

  return (
    <InspectorSection title="Piano roll">
      <Box
        position="relative"
        w="full"
        h={`${HEIGHT}px`}
        borderRadius="md"
        overflow="hidden"
        cursor={playing ? 'pointer' : 'default'}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seek(e);
        }}
        onPointerMove={seek}
      >
        <canvas ref={canvas} style={{ width: '100%', height: HEIGHT, display: 'block' }} />
        <Box
          ref={playhead}
          position="absolute"
          top={0}
          bottom={0}
          w="2px"
          bg="white"
          display="none"
          pointerEvents="none"
        />
      </Box>
      <HStack spacing={4} wrap="wrap">
        {config.stems.map((stem, index) => (
          <HStack key={stem.id} spacing={1}>
            <Box w="2.5" h="2.5" borderRadius="sm" bg={stemColor(index)} />
            <Text fontSize="xs" color="editorMutedText">
              {stem.name ?? stem.id}
            </Text>
          </HStack>
        ))}
      </HStack>
    </InspectorSection>
  );
};
