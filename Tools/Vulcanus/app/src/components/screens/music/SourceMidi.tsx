import React, { useState } from 'react';
import { Button, HStack, Select, Text, VStack, useToast } from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { useMusicStore } from '../../../store/useMusicStore';
import { musicApi, type MidiInfo, type MusicConfig } from '../../../lib/musicApi';
import { InspectorSection } from '../../common/Fields';

interface Props {
  cueId: string;
  midi: MidiInfo;
  config: MusicConfig;
}

/** The stem a MIDI track belongs to, or "ignore" (the value of its stem dropdown). */
const usage = (config: MusicConfig, track: number) =>
  config.stems.find((stem) => stem.tracks.includes(track))?.id ??
  (config.ignoreTracks.includes(track) ? 'ignore' : '');

/** Shows what the cue's source.mid contains and lets it be replaced or revealed on disk. */
export const SourceMidi: React.FC<Props> = ({ cueId, midi, config }) => {
  const projectPath = useEditorStore((state) => state.projectPath);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  const replace = async () => {
    if (!projectPath) return;
    setError(null);
    try {
      const file = await musicApi.pickMidi();
      if (!file) return;
      await musicApi.replaceMidi(projectPath, cueId, file);
      await useMusicStore.getState().reloadMidi(projectPath, cueId);
      toast({
        status: 'success',
        title: 'MIDI replaced',
        description: 'Render to update the game.',
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Moves a track to another stem, a new stem or the ignored tracks; saved with the global Save.
  const assign = async (track: number, value: string) => {
    if (!projectPath) return;
    setError(null);
    try {
      const target = value === 'ignore' || value === 'new' ? value : { stem: value };
      await useMusicStore.getState().assignTrack(projectPath, cueId, track, target);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const tempo = midi.tempos[0]?.bpm ?? 120;
  const meter = midi.meters[0] ?? { numerator: 4, denominator: 4 };
  const tracks = midi.tracks.filter((track) => track.notes > 0);

  return (
    <InspectorSection title="Source MIDI">
      <HStack justify="space-between">
        <Text fontSize="sm" color="editorMutedText">
          {Math.round(tempo * 100) / 100} BPM, {meter.numerator}/{meter.denominator}
        </Text>
        <HStack>
          <Button size="xs" onClick={replace}>
            Replace…
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => projectPath && musicApi.revealMidi(projectPath, cueId)}
          >
            Show in folder
          </Button>
        </HStack>
      </HStack>
      {error ? (
        <Text fontSize="sm" color="red.300" whiteSpace="pre-wrap">
          {error}
        </Text>
      ) : null}
      <VStack align="stretch" spacing={1}>
        {tracks.map((track) => (
          <HStack key={track.index} fontSize="sm" spacing={3}>
            <Text w="6">{track.index}</Text>
            <Text flex="1" noOfLines={1}>
              {track.name || track.instrument || 'Unnamed'}
            </Text>
            <Text color="editorMutedText" w="24">
              {track.notes} notes
            </Text>
            <Text color="editorMutedText" w="24">
              ch {track.channels.map((channel) => channel + 1).join(', ')}
            </Text>
            <Select
              size="xs"
              w="40"
              value={usage(config, track.index)}
              onChange={(e) => assign(track.index, e.target.value)}
              aria-label={`Stem for track ${track.index}`}
            >
              <option value="ignore">Ignored</option>
              {config.stems.map((stem) => (
                <option key={stem.id} value={stem.id}>
                  {stem.name ?? stem.id}
                </option>
              ))}
              <option value="new">New stem</option>
            </Select>
          </HStack>
        ))}
      </VStack>
    </InspectorSection>
  );
};
