import React, { useState } from 'react';
import {
  Button,
  Checkbox,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { musicApi, type MidiFileInfo } from '../../../lib/musicApi';
import { useMusicStore } from '../../../store/useMusicStore';
import { Field } from '../../common/Fields';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImported: (cueId: string) => void | Promise<void>;
}

const slug = (file: string) =>
  (file.split(/[\\/]/).pop() ?? file)
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Imports a MIDI and SoundFont as a new cue; Apollo discovers tracks and renders the stems. */
export const ImportCueDialog: React.FC<Props> = ({ isOpen, onClose, onImported }) => {
  const projectPath = useEditorStore((state) => state.projectPath);
  const [cueId, setCueId] = useState('base:');
  const [midiPath, setMidiPath] = useState('');
  const [soundFontPath, setSoundFontPath] = useState('');
  // The MIDI's note tracks; every one is imported unless unchecked.
  const [noteTracks, setNoteTracks] = useState<MidiFileInfo['tracks']>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickMidi = async () => {
    const file = await musicApi.pickMidi();
    if (!file) return;
    try {
      const info = await musicApi.inspectMidi(file);
      const tracks = info.tracks.filter((track) => track.notes > 0);
      setNoteTracks(tracks);
      setSelected(tracks.map((track) => track.index));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setMidiPath(file);
    if (cueId === 'base:') setCueId(`base:${slug(file)}`);
  };

  const pickSoundFont = async () => {
    const file = await musicApi.pickSoundFont();
    if (file) setSoundFontPath(file);
  };

  const submit = async () => {
    if (!projectPath) return;
    setBusy(true);
    setError(null);
    try {
      await musicApi.import(projectPath, { cueId, midiPath, soundFontPath, tracks: selected });
      await useMusicStore.getState().refresh(projectPath);
      await onImported(cueId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={busy ? () => undefined : onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Import music</ModalHeader>
        <ModalCloseButton isDisabled={busy} />
        <ModalBody>
          <VStack align="stretch" spacing={3}>
            <Field label="Cue ID" helperText="Namespaced and permanent, for example base:forest.">
              <Input size="sm" value={cueId} onChange={(e) => setCueId(e.target.value)} />
            </Field>
            <Field label="MIDI file">
              <HStack>
                <Input size="sm" isReadOnly value={midiPath} />
                <Button size="sm" onClick={pickMidi}>
                  Browse
                </Button>
              </HStack>
            </Field>
            {noteTracks.length ? (
              <Field
                label="Tracks"
                helperText="Unchecked tracks are ignored; you can change this later."
              >
                <VStack align="stretch" spacing={1}>
                  {noteTracks.map((track) => (
                    <Checkbox
                      key={track.index}
                      size="sm"
                      isChecked={selected.includes(track.index)}
                      onChange={(e) =>
                        setSelected((current) =>
                          e.target.checked
                            ? [...current, track.index]
                            : current.filter((index) => index !== track.index),
                        )
                      }
                    >
                      {track.index} {track.name || track.instrument || 'Unnamed'}
                      <Text as="span" color="editorMutedText">
                        {' '}
                        ({track.notes} notes)
                      </Text>
                    </Checkbox>
                  ))}
                </VStack>
              </Field>
            ) : null}
            <Field label="SoundFont">
              <HStack>
                <Input size="sm" isReadOnly value={soundFontPath} />
                <Button size="sm" onClick={pickSoundFont}>
                  Browse
                </Button>
              </HStack>
            </Field>
            {busy ? (
              <Text fontSize="sm" color="editorMutedText">
                Importing and rendering stems. This can take a minute.
              </Text>
            ) : null}
            {error ? (
              <Text fontSize="sm" color="red.300" whiteSpace="pre-wrap">
                {error}
              </Text>
            ) : null}
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button size="sm" variant="ghost" onClick={onClose} isDisabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            colorScheme="blue"
            onClick={submit}
            isLoading={busy}
            isDisabled={!midiPath || !soundFontPath || !cueId || !selected.length}
          >
            Import
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
