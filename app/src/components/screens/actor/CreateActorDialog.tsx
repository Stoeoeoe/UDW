import React, { useMemo, useState } from 'react';
import { Box, Flex, FormControl, FormLabel, Input, Text } from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { Actor } from '../../../types/schema';
import { EntityFormDialog } from '../common';
import { IconPicker } from '../common/FormFields';

interface CreateActorDialogProps {
  onClose: () => void;
}

export const CreateActorDialog: React.FC<CreateActorDialogProps> = ({ onClose }) => {
  const actors = useEditorStore((state) => state.actors);
  const addActor = useEditorStore((state) => state.addActor);

  const [name, setName] = useState('');
  const [customId, setCustomId] = useState('');
  const [icon, setIcon] = useState('GiPerson');

  const derivedId = useMemo(
    () =>
      name
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, ''),
    [name],
  );

  const id = customId.trim() || derivedId;
  const isDuplicate = actors.some((a) => a.id === id);
  const isValid = id.length > 0 && !isDuplicate;

  const handleCreate = async () => {
    if (!isValid) return;
    const actor: Actor = { id, name: name.trim(), icon, emotions: [] };
    await addActor(actor);
    onClose();
  };

  return (
    <EntityFormDialog
      title="New Actor"
      onCancel={onClose}
      onSubmit={handleCreate}
      submitLabel="Create Actor"
      isSubmitDisabled={!isValid}
      minWidth="380px"
    >
      <FormControl isRequired>
        <FormLabel fontSize="xs" color="gray.400">
          Name
        </FormLabel>
        <Input
          size="sm"
          bg="gray.800"
          color="white"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Village Elder"
          autoFocus
        />
      </FormControl>

      <FormControl>
        <FormLabel fontSize="xs" color="gray.400">
          ID
        </FormLabel>
        <Input
          size="sm"
          bg="gray.800"
          color="white"
          fontFamily="mono"
          value={customId}
          onChange={(e) => setCustomId(e.target.value)}
          placeholder={derivedId || 'auto-generated from name'}
          isInvalid={isDuplicate}
        />
        {isDuplicate && (
          <Text fontSize="10px" color="red.400" mt={1}>
            ID already exists
          </Text>
        )}
        {!customId && derivedId && (
          <Text fontSize="10px" color="gray.600" mt={1}>
            Will use:{' '}
            <Box as="span" fontFamily="mono">
              {derivedId}
            </Box>
          </Text>
        )}
      </FormControl>
      <FormControl>
        <FormLabel
          color="gray.500"
          fontSize="10px"
          fontWeight="black"
          textTransform="uppercase"
          mb={1}
        >
          Icon
        </FormLabel>
        <IconPicker value={icon} onChange={(v) => setIcon(v ?? '')} />
      </FormControl>
    </EntityFormDialog>
  );
};
