import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { Actor } from '../../../types/schema';

const COMMON_ICONS = [
  '👤',
  '🧙',
  '👸',
  '🤴',
  '🧝',
  '🧟',
  '🧛',
  '🧜',
  '🧚',
  '🥷',
  '👮',
  '💂',
  '👨‍🌾',
  '👨‍🍳',
  '👨‍⚕️',
  '👨‍🔧',
  '👨‍💼',
  '🧓',
  '👴',
  '👵',
  '🐾',
  '🐺',
  '🦊',
  '🐻',
  '🐗',
  '🦝',
  '🐴',
  '🐑',
  '🐄',
  '🐓',
];

interface CreateActorDialogProps {
  onClose: () => void;
}

export const CreateActorDialog: React.FC<CreateActorDialogProps> = ({ onClose }) => {
  const actors = useEditorStore((state) => state.actors);
  const addActor = useEditorStore((state) => state.addActor);

  const [name, setName] = useState('');
  const [customId, setCustomId] = useState('');
  const [icon, setIcon] = useState('👤');

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
    <Box p={6} minW="380px" bg="gray.900" border="1px" borderColor="gray.700" borderRadius="md">
      <VStack spacing={5} align="stretch">
        <Text fontWeight="bold" fontSize="lg" color="white">
          New Actor
        </Text>

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
          <FormLabel fontSize="xs" color="gray.400">
            Icon
          </FormLabel>
          <Flex gap={1} flexWrap="wrap">
            {COMMON_ICONS.map((ic) => (
              <Box
                key={ic}
                w="28px"
                h="28px"
                display="flex"
                alignItems="center"
                justifyContent="center"
                cursor="pointer"
                borderRadius="md"
                bg={icon === ic ? 'blue.800' : 'transparent'}
                borderWidth="1px"
                borderColor={icon === ic ? 'blue.500' : 'transparent'}
                _hover={{ bg: 'whiteAlpha.100' }}
                onClick={() => setIcon(ic)}
                fontSize="sm"
              >
                {ic}
              </Box>
            ))}
          </Flex>
        </FormControl>

        <HStack justify="flex-end" spacing={3} pt={2}>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" colorScheme="blue" isDisabled={!isValid} onClick={handleCreate}>
            Create Actor
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
};
