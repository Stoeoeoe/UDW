import React from 'react';
import { Box, HStack, Input, Select, Text, VStack } from '@chakra-ui/react';
import type { MusicConfig, MusicCue } from '../../../lib/musicApi';
import { CompactNumberInput, Field, FieldStack, InspectorSection } from '../../common/Fields';
import { FieldLabel } from '../../common/Typography.tsx';

type Stem = MusicConfig['stems'][number];
type Override = Stem['instruments'][number];

interface Props {
  draft: MusicConfig;
  instruments: MusicCue['instruments'];
  onChange: (config: MusicConfig) => void;
}

const number = (value: number, fallback: number) => (Number.isNaN(value) ? fallback : value);

/** Edits everything in an Apollo config except the cue ID, SoundFont and track assignments. */
export const CueDetail: React.FC<Props> = ({ draft, instruments, onChange }) => {
  const set = (changes: Partial<MusicConfig>) => onChange({ ...draft, ...changes });
  const setLoop = (changes: Partial<MusicConfig['loop']>) =>
    set({ loop: { ...draft.loop, ...changes } });
  const setOverride = (stemIndex: number, overrideIndex: number, preset: string) =>
    set({
      stems: draft.stems.map((stem, i) =>
        i === stemIndex
          ? {
              ...stem,
              instruments: stem.instruments.map((o, j) =>
                j === overrideIndex ? ({ channel: o.channel, preset } as Override) : o,
              ),
            }
          : stem,
      ),
    });
  const setGain = (presetIndex: number, stemId: string, gain: number) =>
    set({
      presets: draft.presets?.map((preset, i) =>
        i === presetIndex
          ? { ...preset, gains: preset.gains.map((g) => (g.stem === stemId ? { ...g, gain } : g)) }
          : preset,
      ),
    });
  const names = [...new Set(instruments.map((i) => i.name))];

  return (
    <VStack align="stretch" spacing={6}>
      <InspectorSection title="Loop and output">
        <FieldStack>
          <Field
            label="Theme"
            helperText="Shared by arrangements of the same music, for example base:shrine."
          >
            <Input
              size="sm"
              value={draft.theme ?? ''}
              onChange={(e) => set({ theme: e.target.value || undefined })}
            />
          </Field>
          <HStack align="start">
            <Field label="Start bar">
              <CompactNumberInput
                min={1}
                value={draft.loop.startBar}
                onChange={(_, v) => setLoop({ startBar: number(v, 1) })}
              />
            </Field>
            <Field label="End bar (exclusive)">
              <CompactNumberInput
                min={2}
                value={draft.loop.endBar}
                onChange={(_, v) => setLoop({ endBar: number(v, draft.loop.endBar) })}
              />
            </Field>
            <Field label="Fade out (s)">
              <CompactNumberInput
                min={0}
                step={0.25}
                value={draft.loop.fadeOutSeconds}
                onChange={(_, v) => setLoop({ fadeOutSeconds: number(v, 0) })}
              />
            </Field>
          </HStack>
          <HStack align="start">
            <Field label="Tail">
              <Select
                size="sm"
                value={draft.loop.tail}
                onChange={(e) => setLoop({ tail: e.target.value as 'cut' | 'wrap' })}
              >
                <option value="cut">Cut at the end</option>
                <option value="wrap">Wrap into the start</option>
              </Select>
            </Field>
            <Field label="Gain">
              <CompactNumberInput
                min={0}
                max={10}
                step={0.05}
                value={draft.gain}
                onChange={(_, v) => set({ gain: number(v, 0.2) })}
              />
            </Field>
            <Field label="Sample rate">
              <CompactNumberInput
                min={8000}
                max={96000}
                step={1000}
                value={draft.sampleRate}
                onChange={(_, v) => set({ sampleRate: number(v, 48000) })}
              />
            </Field>
          </HStack>
        </FieldStack>
      </InspectorSection>

      <InspectorSection title="Stems">
        {draft.stems.map((stem, stemIndex) => (
          <Box key={stem.id} borderWidth="1px" borderColor="whiteAlpha.100" borderRadius="md" p={3}>
            <VStack align="stretch" spacing={2}>
              <HStack justify="space-between">
                <Text fontSize="sm" fontWeight="semibold">
                  {stem.name ?? stem.id}
                </Text>
                <Text fontSize="xs" color="editorMutedText">
                  {stem.id} · MIDI track {stem.tracks.join(', ')}
                </Text>
              </HStack>
              {stem.instruments.length === 0 ? (
                <Text fontSize="xs" color="editorMutedText">
                  Instrument comes from the MIDI file.
                </Text>
              ) : null}
              {stem.instruments.map((override, overrideIndex) => (
                <HStack key={override.channel}>
                  <FieldLabel mb={0} w="90px" flexShrink={0}>
                    Channel {override.channel}
                  </FieldLabel>
                  {'preset' in override ? (
                    <Select
                      size="sm"
                      value={override.preset}
                      onChange={(e) => setOverride(stemIndex, overrideIndex, e.target.value)}
                    >
                      {names.includes(override.preset) ? null : (
                        <option value={override.preset}>{override.preset} (not in font)</option>
                      )}
                      {names.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Text fontSize="sm" color="editorMutedText">
                      Bank {override.bank}, program {override.program}
                    </Text>
                  )}
                </HStack>
              ))}
            </VStack>
          </Box>
        ))}
      </InspectorSection>

      {draft.presets ? (
        <InspectorSection title="Mixes">
          {draft.presets.map((preset, presetIndex) => (
            <Box
              key={preset.id}
              borderWidth="1px"
              borderColor="whiteAlpha.100"
              borderRadius="md"
              p={3}
            >
              <VStack align="stretch" spacing={2}>
                <Text fontSize="sm" fontWeight="semibold">
                  {preset.id}
                </Text>
                {preset.gains.map((g) => (
                  <HStack key={g.stem}>
                    <Text fontSize="xs" flex={1}>
                      {g.stem}
                    </Text>
                    <Box w="90px">
                      <CompactNumberInput
                        min={0}
                        max={1}
                        step={0.1}
                        value={g.gain}
                        onChange={(_, v) => setGain(presetIndex, g.stem, number(v, 0))}
                      />
                    </Box>
                  </HStack>
                ))}
              </VStack>
            </Box>
          ))}
        </InspectorSection>
      ) : (
        <Text fontSize="xs" color="editorMutedText">
          This cue has a single default mix (every stem at full gain).
        </Text>
      )}
    </VStack>
  );
};
