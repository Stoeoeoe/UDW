import React, { useEffect, useRef, useState } from 'react';
import { Button, HStack, Select, Spinner, Text, VStack, useToast } from '@chakra-ui/react';
import { GiMusicalNotes } from 'react-icons/gi';
import { useEditorStore } from '../../../store/useEditorStore';
import { useMusicStore } from '../../../store/useMusicStore';
import { musicApi } from '../../../lib/musicApi';
import { CuePreview } from '../../../lib/musicPreview';
import { EmptyScreen } from '../common/EmptyScreen';
import { CueDetail } from './CueDetail';
import { PianoRoll } from './PianoRoll';
import { SourceMidi } from './SourceMidi';

/**
 * Edits one Apollo music cue: loop, instruments and mixes. Edits are saved with the global
 * Save; Render writes the Unity export (saving the cue first when it has unsaved edits).
 */
export const MusicEditor: React.FC<{ cueId: string }> = ({ cueId }) => {
  const projectPath = useEditorStore((state) => state.projectPath);
  const cue = useMusicStore((state) => state.drafts[cueId]);
  // A tab can outlive its cue, for example after it was deleted from the explorer.
  const missing = useMusicStore((state) => state.loaded && !state.cues.some((c) => c.id === cueId));
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [mix, setMix] = useState('full');
  const preview = useRef<CuePreview | null>(null);

  const stopPreview = () => {
    void preview.current?.dispose();
    preview.current = null;
    setPreviewState('idle');
  };
  // Leaving the cue stops its preview.
  useEffect(() => stopPreview, [cueId]);

  useEffect(() => {
    if (!projectPath) return;
    setError(null);
    useMusicStore
      .getState()
      .load(projectPath, cueId)
      .catch((e: Error) => setError(e.message));
  }, [projectPath, cueId]);

  if (!cue) {
    return (
      <EmptyScreen
        icon={<GiMusicalNotes />}
        title={missing ? 'Cue not found' : error ? 'Could not open cue' : 'Loading…'}
        description={missing ? 'It may have been deleted.' : (error ?? cueId)}
      />
    );
  }

  const mixes = cue.config.presets?.map((preset) => preset.id) ?? ['full'];
  const activeMix = mixes.includes(mix) ? mix : mixes[0];

  // Renders the current (even unsaved) config, then loops it; the Unity export is untouched.
  const togglePreview = async () => {
    if (previewState === 'playing') return stopPreview();
    if (!projectPath) return;
    setPreviewState('loading');
    setError(null);
    try {
      const result = await musicApi.preview(projectPath, cueId, cue.config);
      preview.current = await CuePreview.create(result);
      preview.current.play(activeMix);
      setPreviewState('playing');
    } catch (e) {
      setError((e as Error).message);
      setPreviewState('idle');
    }
  };

  const changeMix = (id: string) => {
    setMix(id);
    preview.current?.setPreset(id);
  };

  const render = async () => {
    if (!projectPath) return;
    setRendering(true);
    setError(null);
    try {
      if (cue.config !== cue.saved) await useMusicStore.getState().save(cueId);
      const result = await musicApi.render(projectPath, cueId);
      toast({
        status: 'success',
        title: `Rendered ${cueId}`,
        description: `${result.stems} stems, ${result.bars} bars, ${result.sampleRate} Hz. Unity imports it automatically.`,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRendering(false);
    }
  };

  return (
    <VStack align="stretch" spacing={6}>
      <HStack justify="space-between">
        <Text fontWeight="bold">{cueId}</Text>
        <HStack>
          {rendering || previewState === 'loading' ? <Spinner size="sm" /> : null}
          <Select
            size="sm"
            w="40"
            value={activeMix}
            onChange={(e) => changeMix(e.target.value)}
            aria-label="Mix"
          >
            {mixes.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            isDisabled={previewState === 'loading' || rendering}
            onClick={togglePreview}
          >
            {previewState === 'playing' ? 'Stop' : 'Preview'}
          </Button>
          <Button size="sm" colorScheme="blue" isDisabled={rendering} onClick={render}>
            Render
          </Button>
        </HStack>
      </HStack>
      {error ? (
        <Text fontSize="sm" color="red.300" whiteSpace="pre-wrap">
          {error}
        </Text>
      ) : null}
      <PianoRoll
        midi={cue.midi}
        config={cue.config}
        position={() => preview.current?.position ?? null}
        playing={previewState === 'playing'}
        onSeek={(seconds) => preview.current?.seek(seconds)}
      />
      <SourceMidi cueId={cueId} midi={cue.midi} config={cue.config} />
      <CueDetail
        draft={cue.config}
        instruments={cue.instruments}
        onChange={(config) => useMusicStore.getState().edit(cueId, config)}
      />
    </VStack>
  );
};
