import React, { useMemo } from 'react';
import {
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
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
              const Comp = (GiIcons as Record<string, React.FC<{ size?: number }>>)[name];
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
    ) : (
      <EmptyScreen
        icon="👤"
        title="No Actor Selected"
        description="Select an actor from the list to edit details."
      />
    );

  const centerContent = selectedActor ? (
    <Box h="full" overflowY="auto" p={6}>
      <Box
        w="80%"
        maxW="900px"
        mx="auto"
        bg="editor.panelBg"
        border="1px"
        borderColor="whiteAlpha.100"
        borderRadius="lg"
        overflow="hidden"
      >
        <ActorDetail
          actor={selectedActor}
          onUpdate={updateActor}
          onDelete={async () => deleteActorById(selectedActor.id, selectedActor.name)}
        />
      </Box>
    </Box>
  ) : (
    content
  );

  return (
    <>
      <ResizableEditorLayout
        header={{
          title: 'Actors',
          subtitle: `${actors.length} actor${actors.length !== 1 ? 's' : ''} defined`,
        }}
        content={centerContent}
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
  <Box p={6}>
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
            size="sm"
            bg="gray.950"
            color="white"
            value={actor.name}
            onChange={(e) => onUpdate(actor.id, { name: e.target.value })}
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

      <Button
        size="xs"
        colorScheme="red"
        variant="outline"
        leftIcon={<DeleteIcon fontSize="10px" />}
        onClick={onDelete}
        alignSelf="flex-start"
      >
        Delete Actor
      </Button>
    </VStack>
  </Box>
);

export default ActorEditor;
