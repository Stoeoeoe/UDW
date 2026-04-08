import React, { useMemo } from 'react';
import {
  VStack,
  HStack,
  Text,
  Box,
  Input,
  FormControl,
  FormLabel,
  Button,
  Flex,
  useDisclosure,
  Divider,
} from '@chakra-ui/react';
import { DeleteIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../../store/useEditorStore';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { ListPanel, ListPanelItem, InspectorPanel, InspectorEmptyState } from '../common';
import { EditorModal } from '../../common/EditorModal';
import { CreateNpcDialog } from './CreateNpcDialog';
import { EmptyScreen } from '../common/EmptyScreen';

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

export const NpcEditor: React.FC = () => {
  const npcs = useEditorStore((state) => state.npcs);
  const selectedNpcId = useEditorStore((state) => state.selectedNpcId);
  const setSelectedNpc = useEditorStore((state) => state.setSelectedNpc);
  const updateNpc = useEditorStore((state) => state.updateNpc);
  const deleteNpc = useEditorStore((state) => state.deleteNpc);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const selectedNpc = npcs.find((n) => n.id === selectedNpcId);

  const npcItems: ListPanelItem[] = useMemo(
    () =>
      npcs.map((npc) => ({
        id: npc.id,
        label: npc.name,
        sublabel: npc.id,
        icon: (
          <Box
            w="20px"
            h="20px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            fontSize="12px"
          >
            {npc.icon}
          </Box>
        ),
      })),
    [npcs],
  );

  const handleDelete = async () => {
    if (selectedNpcId) {
      await deleteNpc(selectedNpcId);
    }
  };

  const leftPanel = (
    <ListPanel
      title="NPCs"
      items={npcItems}
      selectedId={selectedNpcId}
      onSelect={setSelectedNpc}
      onAdd={onOpen}
      autoSelectFirst={true}
      emptyMessage="No NPCs defined"
    />
  );

  const rightPanel = (
    <InspectorPanel
      title={selectedNpc?.name || 'NPC'}
      subtitle={selectedNpc ? selectedNpc.id : undefined}
      emptyState={
        <InspectorEmptyState icon="👤" message="No NPC Selected" hint="Select an NPC to edit" />
      }
    >
      {selectedNpc && (
        <VStack align="stretch" spacing={5}>
          <VStack align="stretch" spacing={3}>
            <FormControl>
              <FormLabel
                color="gray.500"
                fontSize="10px"
                fontWeight="black"
                textTransform="uppercase"
                mb={1}
              >
                ID
              </FormLabel>
              <Text fontSize="xs" fontFamily="mono" color="gray.400">
                {selectedNpc.id}
              </Text>
            </FormControl>

            <FormControl>
              <FormLabel
                color="gray.500"
                fontSize="10px"
                fontWeight="black"
                textTransform="uppercase"
                mb={1}
              >
                Name
              </FormLabel>
              <Input
                size="xs"
                variant="filled"
                bg="#0a0a0b"
                color="white"
                value={selectedNpc.name}
                onChange={(e) => updateNpc(selectedNpc.id, { name: e.target.value })}
                _hover={{ bg: '#071018' }}
              />
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
              <HStack spacing={2} mb={2}>
                <Text fontSize="2xl">{selectedNpc.icon}</Text>
              </HStack>
              <Flex gap={1} flexWrap="wrap">
                {COMMON_ICONS.map((ic) => (
                  <Box
                    key={ic}
                    w="26px"
                    h="26px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    cursor="pointer"
                    borderRadius="md"
                    bg={selectedNpc.icon === ic ? 'blue.800' : 'transparent'}
                    borderWidth="1px"
                    borderColor={selectedNpc.icon === ic ? 'blue.500' : 'transparent'}
                    _hover={{ bg: 'whiteAlpha.100' }}
                    onClick={() => updateNpc(selectedNpc.id, { icon: ic })}
                    fontSize="sm"
                  >
                    {ic}
                  </Box>
                ))}
              </Flex>
            </FormControl>
          </VStack>

          <Divider borderColor="#071018" />

          <Box>
            <Text
              color="gray.500"
              fontSize="10px"
              fontWeight="black"
              textTransform="uppercase"
              mb={2}
            >
              Danger Zone
            </Text>
            <Button
              size="xs"
              colorScheme="red"
              variant="outline"
              leftIcon={<DeleteIcon fontSize="10px" />}
              onClick={handleDelete}
            >
              Delete NPC
            </Button>
          </Box>
        </VStack>
      )}
    </InspectorPanel>
  );

  const content =
    npcs.length === 0 ? (
      <EmptyScreen
        icon="👤"
        title="No NPCs"
        description="Define the characters that populate your world. NPCs can be assigned daily routines and placed on maps."
        buttonLabel="Create First NPC"
        onCreate={onOpen}
      />
    ) : (
      <NpcGrid npcs={npcs} selectedId={selectedNpcId} onSelect={setSelectedNpc} />
    );

  return (
    <>
      <ResizableEditorLayout
        header={{
          title: 'NPCs',
          subtitle: `${npcs.length} NPC${npcs.length !== 1 ? 's' : ''} defined`,
        }}
        content={content}
        leftPanel={leftPanel}
        rightPanel={rightPanel}
        leftPanelDefaultSize={18}
        rightPanelDefaultSize={25}
      />

      <EditorModal isOpen={isOpen} onClose={onClose}>
        <CreateNpcDialog onClose={onClose} />
      </EditorModal>
    </>
  );
};

const NpcGrid: React.FC<{
  npcs: { id: string; name: string; icon: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}> = ({ npcs, selectedId, onSelect }) => (
  <Box p={6} overflowY="auto" h="full">
    <Box
      display="grid"
      gridTemplateColumns="repeat(auto-fill, minmax(140px, 1fr))"
      gap={3}
      maxW="800px"
      mx="auto"
    >
      {npcs.map((npc) => (
        <Box
          key={npc.id}
          p={3}
          bg={selectedId === npc.id ? 'blue.900' : '#0a0a0b'}
          borderWidth="1px"
          borderColor={selectedId === npc.id ? 'blue.500' : '#1a1a2e'}
          borderRadius="md"
          cursor="pointer"
          _hover={{
            bg: selectedId === npc.id ? 'blue.900' : '#0f0f1a',
            borderColor: selectedId === npc.id ? 'blue.500' : 'gray.600',
          }}
          transition="all 0.1s"
          onClick={() => onSelect(npc.id)}
        >
          <VStack spacing={2} align="center">
            <Text fontSize="3xl">{npc.icon}</Text>
            <VStack spacing={0}>
              <Text fontSize="xs" fontWeight="bold" color="white" textAlign="center" noOfLines={1}>
                {npc.name}
              </Text>
              <Text fontSize="10px" color="gray.600" fontFamily="mono" noOfLines={1}>
                {npc.id}
              </Text>
            </VStack>
          </VStack>
        </Box>
      ))}
    </Box>
  </Box>
);

export default NpcEditor;
