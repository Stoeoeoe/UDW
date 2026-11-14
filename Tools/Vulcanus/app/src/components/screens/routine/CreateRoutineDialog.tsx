import React, { useState } from 'react';
import { Button, HStack, Text, VStack } from '@chakra-ui/react';
import { EditorModal } from '../../common/EditorModal';
import { CompactSelect, Field } from '../../common/Fields';
import { useEditorStore } from '../../../store/useEditorStore';
import { newRoutine } from '../../../lib/routines';
import type { RoutinePlace } from '../../../types/routine';

/** Creates the routine of a character that has none yet, starting from its home. */
export const CreateRoutineDialog: React.FC<{
  folderPath: string;
  onClose: () => void;
  onCreated: (routineId: string, label: string) => void;
}> = ({ folderPath, onClose, onCreated }) => {
  const characters = useEditorStore((state) => state.characters);
  const routines = useEditorStore((state) => state.routines);
  const maps = useEditorStore((state) => state.maps);
  const free = characters.filter(
    (character) => !routines.some((routine) => routine.character === character.id),
  );
  const [characterId, setCharacterId] = useState(free[0]?.id ?? '');
  const [home, setHome] = useState<RoutinePlace>({ map: maps[0]?.id ?? '', anchor: '' });
  const [error, setError] = useState<string | null>(null);
  const anchors = maps.find((map) => map.id === home.map)?.spatialPrimitives?.anchors ?? [];

  const create = async () => {
    const character = characters.find((entry) => entry.id === characterId)!;
    const id = `${character.id}_routine`;
    try {
      await useEditorStore.getState().addRoutine(newRoutine(id, character.id, home, folderPath));
      onCreated(id, character.name);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <EditorModal isOpen onClose={onClose} title="New Routine" size="md">
      <VStack align="stretch" spacing={4}>
        {free.length === 0 ? (
          <Text fontSize="sm" color="editorMutedText">
            Every character already has a routine.
          </Text>
        ) : (
          <>
            <Field label="Character">
              <CompactSelect
                value={characterId}
                onChange={(event) => setCharacterId(event.target.value)}
              >
                {free.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </CompactSelect>
            </Field>
            <Field
              label="Home map"
              helperText="Where the character starts each morning and sleeps."
            >
              <CompactSelect
                value={home.map}
                onChange={(event) => setHome({ map: event.target.value, anchor: '' })}
              >
                {maps.map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.name}
                  </option>
                ))}
              </CompactSelect>
            </Field>
            <Field
              label="Home anchor"
              helperText={
                anchors.length
                  ? undefined
                  : 'This map has no anchors; pick one later in the editor.'
              }
            >
              <CompactSelect
                value={home.anchor}
                onChange={(event) => setHome({ ...home, anchor: event.target.value })}
              >
                <option value="">Choose later</option>
                {anchors.map((anchor) => (
                  <option key={anchor.id} value={anchor.id}>
                    {anchor.id}
                  </option>
                ))}
              </CompactSelect>
            </Field>
          </>
        )}
        {error && (
          <Text fontSize="xs" color="editorDangerText">
            {error}
          </Text>
        )}
        <HStack justify="end">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            colorScheme="blue"
            isDisabled={!characterId || !home.map}
            onClick={create}
          >
            Create
          </Button>
        </HStack>
      </VStack>
    </EditorModal>
  );
};
