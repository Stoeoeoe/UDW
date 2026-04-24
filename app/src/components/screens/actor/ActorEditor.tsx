import React, { useMemo, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import {
  Badge,
  Box,
  Button,
  Divider,
  FormControl,
  GridItem,
  Input,
  SimpleGrid,
  useDisclosure,
  VStack,
  HStack,
  Text,
} from '@chakra-ui/react';
import { DeleteIcon, CheckIcon } from '@chakra-ui/icons';
import { IconPicker } from '../common/FormFields';
import { useEditorStore } from '../../../store/useEditorStore';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { DetailPanel } from '../../common/DetailPanel';
import { GameIcon } from '../../common/GameIcon';
import { CreateItemDialog } from '../../common/CreateItemDialog';
import { EmptyScreen } from '../common/EmptyScreen';
import { ReadOnlyIdField } from '../../common/Fields';
import { FormLabelUppercase } from '../../common/FormLabel';
import { FieldLabel } from '../../common/Typography.tsx';
import { GiPerson } from 'react-icons/gi';

export const ActorEditor: React.FC = () => {
  const actors = useEditorStore((state) => state.actors);
  const selectedActorId = useEditorStore((state) => state.selectedActorId);
  const updateActor = useEditorStore((state) => state.updateActor);
  const deleteActor = useEditorStore((state) => state.deleteActor);
  const addActor = useEditorStore((state) => state.addActor);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [newActorIcon, setNewActorIcon] = useState('GiPerson');

  const selectedActor = actors.find((a) => a.id === selectedActorId);

  const deleteActorById = async (id: string, name: string) => {
    if (!confirm(`Delete actor "${name}"?`)) return;
    await deleteActor(id);
  };

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
    <DetailPanel key={selectedActor.id} maxWidth="1180px">
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
      <VStack align="stretch" spacing={6}>
        <Box
          border="1px"
          borderColor="whiteAlpha.100"
          bg="whiteAlpha.50"
          borderRadius="xl"
          px={5}
          py={4}
        >
          <HStack justify="space-between" align="start" spacing={4}>
            <HStack spacing={4} align="center">
              <Box
                boxSize="56px"
                borderRadius="xl"
                bg="editorInlineBg"
                border="1px"
                borderColor="editorInlineBorder"
                display="flex"
                alignItems="center"
                justifyContent="center"
                flexShrink={0}
              >
                <GameIcon iconName={actor.icon} size={26} fallback={<GiPerson />} />
              </Box>
              <VStack align="start" spacing={1}>
                <Text fontSize="lg" fontWeight="bold" color="editorText" lineHeight={1.1}>
                  {actor.name}
                </Text>
                <Text textStyle="monoMeta">{actor.id}</Text>
                <Badge variant="editor">Actor</Badge>
              </VStack>
            </HStack>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting, state.isDirty]}
            >
              {([canSubmit, isSubmitting, isDirty]) => (
                <Button
                  size="sm"
                  colorScheme="blue"
                  type="submit"
                  disabled={!canSubmit}
                  isLoading={isSubmitting}
                  opacity={isDirty ? 1 : 0.6}
                  leftIcon={<CheckIcon fontSize="10px" />}
                >
                  Save Changes
                </Button>
              )}
            </form.Subscribe>
          </HStack>
        </Box>

        <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={6} alignItems="start">
          <GridItem>
            <VStack align="stretch" spacing={4}>
              <FormControl>
                <FieldLabel>ID</FieldLabel>
                <ReadOnlyIdField value={actor.id} />
              </FormControl>

              <form.Field name="name">
                {(field) => (
                  <FormControl>
                    <FieldLabel>Name</FieldLabel>
                    <Input
                      size="sm"
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  </FormControl>
                )}
              </form.Field>
            </VStack>
          </GridItem>

          <GridItem>
            <VStack align="stretch" spacing={4}>
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
          </GridItem>
        </SimpleGrid>

        <Divider />

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
                size="sm"
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
