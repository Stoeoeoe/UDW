import React, { useMemo, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import {
  Button,
  Divider,
  FormControl,
  Input,
  Text,
  useDisclosure,
  VStack,
  HStack,
} from '@chakra-ui/react';
import { DeleteIcon, CheckIcon } from '@chakra-ui/icons';
import { IconPicker } from '../common/FormFields';
import { useEditorStore } from '../../../store/useEditorStore';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { ListPanel, ListPanelItem } from '../common';
import { DetailPanel } from '../../common/DetailPanel';
import { GameIcon } from '../../common/GameIcon';
import { useFilteredList } from '../../../hooks/useFilteredList';
import { CreateItemDialog } from '../../common/CreateItemDialog';
import { EmptyScreen } from '../common/EmptyScreen';
import { FormLabelUppercase } from '../../common/FormLabel';
import { FieldLabel } from '../../common/Typography.tsx';
import { GiPerson } from 'react-icons/gi';

export const ActorEditor: React.FC = () => {
  const actors = useEditorStore((state) => state.actors);
  const selectedActorId = useEditorStore((state) => state.selectedActorId);
  const setSelectedActor = useEditorStore((state) => state.setSelectedActor);
  const updateActor = useEditorStore((state) => state.updateActor);
  const deleteActor = useEditorStore((state) => state.deleteActor);
  const addActor = useEditorStore((state) => state.addActor);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [newActorIcon, setNewActorIcon] = useState('GiPerson');
  const [search, setSearch] = React.useState('');

  const selectedActor = actors.find((a) => a.id === selectedActorId);

  const actorItems: ListPanelItem[] = useMemo(
    () =>
      actors.map((actor) => ({
        id: actor.id,
        label: actor.name,
        sublabel: actor.id,
        icon: <GameIcon iconName={actor.icon} size={24} fallback={<GiPerson />} />,
      })),
    [actors],
  );

  const filteredActorItems = useFilteredList(actorItems, search);

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
        icon={<GiPerson />}
        title="No Actors"
        description="Define characters or named roles available to dialogue and gameplay systems."
        buttonLabel="Create First Actor"
        onCreate={onOpen}
      />
    ) : (
      <EmptyScreen
        icon={<GiPerson />}
        title="No Actor Selected"
        description="Select an actor from the list to edit details."
      />
    );

  const centerContent = selectedActor ? (
    <DetailPanel key={selectedActor.id}>
      <ActorDetail
        key={selectedActor.id}
        actor={selectedActor}
        onUpdate={updateActor}
        onDelete={async () => deleteActorById(selectedActor.id, selectedActor.name)}
      />
    </DetailPanel>
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

      <CreateItemDialog
        isOpen={isOpen}
        title="New Actor"
        itemType="Actor"
        existingIds={actors.map((a) => a.id)}
        onClose={onClose}
        onSubmit={async ({ id, name }) => {
          await addActor({ id, name, icon: newActorIcon, emotions: [] });
          setNewActorIcon('GiPerson');
          onClose();
        }}
        additionalFields={
          <FormControl>
            <FormLabelUppercase mb={1}>Icon</FormLabelUppercase>
            <IconPicker value={newActorIcon} onChange={(v) => setNewActorIcon(v ?? '')} />
          </FormControl>
        }
      />
    </>
  );
};

const ActorDetail: React.FC<{
  actor: { id: string; name: string; icon: string };
  onUpdate: (id: string, updates: Partial<{ name: string; icon: string }>) => void;
  onDelete: () => void;
}> = ({ actor, onUpdate, onDelete }) => {
  const form = useForm({
    defaultValues: {
      name: actor.name,
      icon: actor.icon,
    },
    onSubmit: async ({ value }) => {
      onUpdate(actor.id, value);
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <VStack align="stretch" spacing={5}>
        <VStack align="stretch" spacing={3}>
          <FormControl>
            <FieldLabel>ID</FieldLabel>
            <Text fontSize="xs" fontFamily="mono" color="gray.400">
              {actor.id}
            </Text>
          </FormControl>

          <form.Field name="name">
            {(field) => (
              <FormControl>
                <FieldLabel>Name</FieldLabel>
                <Input
                  size="sm"
                  bg="gray.950"
                  color="white"
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </FormControl>
            )}
          </form.Field>

          <form.Field name="icon">
            {(field) => (
              <FormControl>
                <FieldLabel>Icon</FieldLabel>
                <IconPicker
                  value={field.state.value}
                  onChange={(v) => field.handleChange(v ?? '')}
                />
              </FormControl>
            )}
          </form.Field>
        </VStack>

        <Divider borderColor="#071018" />

        <HStack justify="space-between">
          <Button
            size="xs"
            colorScheme="red"
            variant="outline"
            leftIcon={<DeleteIcon fontSize="10px" />}
            onClick={onDelete}
          >
            Delete Actor
          </Button>

          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting, state.isDirty]}
          >
            {([canSubmit, isSubmitting, isDirty]) => (
              <Button
                size="xs"
                colorScheme="blue"
                type="submit"
                disabled={!canSubmit}
                isLoading={isSubmitting}
                opacity={isDirty ? 1 : 0.5}
                leftIcon={<CheckIcon fontSize="10px" />}
              >
                Save Changes
              </Button>
            )}
          </form.Subscribe>
        </HStack>
      </VStack>
    </form>
  );
};

export default ActorEditor;
