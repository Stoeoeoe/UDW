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
import { IconPicker } from '../common/FormFields';
import * as GiIcons from 'react-icons/gi';
import { useEditorStore } from '../../../store/useEditorStore';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { ListPanel, ListPanelItem } from '../common';
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
  const [search, setSearch] = React.useState('');

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
            {(() => {
              const name = actor.icon;
              if (!name) return '👤';
              const Comp = (GiIcons as any)[name];
              if (Comp) return <Comp size={14} />;
              return name;
            })()}
          </Box>
        ),
      })),
    [actors],
  );

  const filteredActorItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return actorItems;
    return actorItems.filter((item) => {
      const hitLabel = item.label.toLowerCase().includes(query);
      const hitSublabel = item.sublabel?.toLowerCase().includes(query);
      return hitLabel || Boolean(hitSublabel);
    });
  }, [actorItems, search]);

  const handleDelete = async () => {
    if (!selectedActor) return;
    await deleteActorById(selectedActor.id, selectedActor.name);
  };

  const deleteActorById = async (id: string, name: string) => {
    if (!confirm(`Delete actor "${name}"?`)) return;
    await deleteActor(id);
  };

  const leftPanel = (
    <ListPanel
      title="Actors"
      items={filteredActorItems}
      selectedId={selectedActorId}
      onSelect={setSelectedActor}
      onAdd={onOpen}
      autoSelectFirst={true}
      emptyMessage="No actors defined"
      topContent={
        <Input
          size="xs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search actors..."
          bg="#0a0a0b"
          borderColor="#333"
          color="gray.100"
        />
      }
      onDeleteItem={async (item) => {
        const actor = actors.find((entry) => entry.id === item.id);
        if (!actor) return;
        await deleteActorById(actor.id, actor.name);
      }}
      deleteActionLabel="Delete actor"
    />
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
    ) : !selectedActor ? (
      <EmptyScreen
        icon="👤"
        title="No Actor Selected"
        description="Select an actor from the list to edit details."
      />
    ) : (
      <ActorDetail actor={selectedActor} onUpdate={updateActor} onDelete={handleDelete} />
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
        leftPanelDefaultSize={18}
      />

      <EditorModal isOpen={isOpen} onClose={onClose}>
        <CreateActorDialog onClose={onClose} />
      </EditorModal>
    </>
  );
};

const ActorDetail: React.FC<{
  actor: { id: string; name: string; icon: string };
  onUpdate: (id: string, updates: Partial<{ name: string; icon: string }>) => void;
  onDelete: () => void;
}> = ({ actor, onUpdate, onDelete }) => (
  <Box p={6} overflowY="auto" h="full">
    <VStack align="stretch" spacing={5} maxW="680px" mx="auto">
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
            {actor.id}
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
            value={actor.name}
            onChange={(e) => onUpdate(actor.id, { name: e.target.value })}
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
          <IconPicker value={actor.icon} onChange={(v) => onUpdate(actor.id, { icon: v ?? '' })} />
        </FormControl>
      </VStack>

      <Divider borderColor="#071018" />

      <Box>
        <Text color="gray.500" fontSize="10px" fontWeight="black" textTransform="uppercase" mb={2}>
          Actions
        </Text>
        <Button
          size="xs"
          colorScheme="red"
          variant="outline"
          leftIcon={<DeleteIcon fontSize="10px" />}
          onClick={onDelete}
        >
          Delete Actor
        </Button>
      </Box>
    </VStack>
  </Box>
);

export default ActorEditor;
