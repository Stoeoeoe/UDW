import React, { useMemo } from 'react';
import {
  Box,
  Button,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Text,
  useDisclosure,
  VStack,
} from '@chakra-ui/react';
import { DeleteIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../../store/useEditorStore';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { InspectorEmptyState, InspectorPanel, ListPanel, ListPanelItem } from '../common';
import { EditorModal } from '../../common/EditorModal';
import { CreateActorDialog } from './CreateActorDialog';
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

export const ActorEditor: React.FC = () => {
  const actors = useEditorStore((state) => state.actors);
  const selectedActorId = useEditorStore((state) => state.selectedActorId);
  const setSelectedActor = useEditorStore((state) => state.setSelectedActor);
  const updateActor = useEditorStore((state) => state.updateActor);
  const deleteActor = useEditorStore((state) => state.deleteActor);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const selectedActor = actors.find((a) => a.id === selectedActorId);

  const actorItems: ListPanelItem[] = useMemo(
    () =>
      actors.map((actor) => ({
        id: actor.id,
        label: actor.name,
        sublabel: actor.id,
        icon: (
          <Box
            w="20px"
            h="20px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            fontSize="12px"
          >
            {actor.icon}
          </Box>
        ),
      })),
    [actors],
  );

  const handleDelete = async () => {
    if (selectedActorId) {
      await deleteActor(selectedActorId);
    }
  };

  const leftPanel = (
    <ListPanel
      title="Actors"
      items={actorItems}
      selectedId={selectedActorId}
      onSelect={setSelectedActor}
      onAdd={onOpen}
      autoSelectFirst={true}
      emptyMessage="No actors defined"
    />
  );

  const rightPanel = (
    <InspectorPanel
      title={selectedActor?.name || 'Actor'}
      subtitle={selectedActor ? selectedActor.id : undefined}
      emptyState={
        <InspectorEmptyState icon="👤" message="No Actor Selected" hint="Select an actor to edit" />
      }
    >
      {selectedActor && (
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
                {selectedActor.id}
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
                value={selectedActor.name}
                onChange={(e) => updateActor(selectedActor.id, { name: e.target.value })}
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
                <Text fontSize="2xl">{selectedActor.icon}</Text>
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
                    bg={selectedActor.icon === ic ? 'blue.800' : 'transparent'}
                    borderWidth="1px"
                    borderColor={selectedActor.icon === ic ? 'blue.500' : 'transparent'}
                    _hover={{ bg: 'whiteAlpha.100' }}
                    onClick={() => updateActor(selectedActor.id, { icon: ic })}
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
              Delete Actor
            </Button>
          </Box>
        </VStack>
      )}
    </InspectorPanel>
  );

  const content =
    actors.length === 0 ? (
      <EmptyScreen
        icon="👤"
        title="No Actors"
        description="Define characters or named roles available to dialogue and gameplay systems."
        buttonLabel="Create First Actor"
        onCreate={onOpen}
      />
    ) : (
      <ActorGrid actors={actors} selectedId={selectedActorId} onSelect={setSelectedActor} />
    );

  return (
    <>
      <ResizableEditorLayout
        header={{
          title: 'Actors',
          subtitle: `${actors.length} actor${actors.length !== 1 ? 's' : ''} defined`,
        }}
        content={content}
        leftPanel={leftPanel}
        rightPanel={rightPanel}
        leftPanelDefaultSize={18}
        rightPanelDefaultSize={25}
      />

      <EditorModal isOpen={isOpen} onClose={onClose}>
        <CreateActorDialog onClose={onClose} />
      </EditorModal>
    </>
  );
};

const ActorGrid: React.FC<{
  actors: { id: string; name: string; icon: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}> = ({ actors, selectedId, onSelect }) => (
  <Box p={6} overflowY="auto" h="full">
    <Box
      display="grid"
      gridTemplateColumns="repeat(auto-fill, minmax(140px, 1fr))"
      gap={3}
      maxW="800px"
      mx="auto"
    >
      {actors.map((actor) => (
        <Box
          key={actor.id}
          p={3}
          bg={selectedId === actor.id ? 'blue.900' : '#0a0a0b'}
          borderWidth="1px"
          borderColor={selectedId === actor.id ? 'blue.500' : '#1a1a2e'}
          borderRadius="md"
          cursor="pointer"
          _hover={{
            bg: selectedId === actor.id ? 'blue.900' : '#0f0f1a',
            borderColor: selectedId === actor.id ? 'blue.500' : 'gray.600',
          }}
          transition="all 0.1s"
          onClick={() => onSelect(actor.id)}
        >
          <VStack spacing={2} align="center">
            <Text fontSize="3xl">{actor.icon}</Text>
            <VStack spacing={0}>
              <Text fontSize="xs" fontWeight="bold" color="white" textAlign="center" noOfLines={1}>
                {actor.name}
              </Text>
              <Text fontSize="10px" color="gray.600" fontFamily="mono" noOfLines={1}>
                {actor.id}
              </Text>
            </VStack>
          </VStack>
        </Box>
      ))}
    </Box>
  </Box>
);

export default ActorEditor;
