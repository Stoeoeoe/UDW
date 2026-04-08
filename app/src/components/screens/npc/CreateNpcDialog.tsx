import React, { useState, useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  FormControl,
  FormLabel,
  Button,
  Flex,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { Npc } from '../../../types/schema';

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

interface CreateNpcDialogProps {
  onClose: () => void;
}

export const CreateNpcDialog: React.FC<CreateNpcDialogProps> = ({ onClose }) => {
  const npcs = useEditorStore((state) => state.npcs);
  const addNpc = useEditorStore((state) => state.addNpc);

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
  const isDuplicate = npcs.some((n) => n.id === id);
  const isValid = id.length > 0 && !isDuplicate;

  const handleCreate = async () => {
    if (!isValid) return;
    const npc: Npc = { id, name: name.trim(), icon };
    await addNpc(npc);
    onClose();
  };

  return (
    <Box p={6} minW="380px" bg="gray.900" border="1px" borderColor="gray.700" borderRadius="md">
      <VStack spacing={5} align="stretch">
        <Text fontWeight="bold" fontSize="lg" color="white">
          New NPC
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
            Create NPC
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
};
