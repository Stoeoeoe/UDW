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
import { EmotionSelect } from '../../common/EmotionSelect';
import { PortraitField } from './PortraitField';
import type { Character } from '../../../types/schema';

export const CharacterEditor: React.FC = () => {
  const characters = useEditorStore((state) => state.characters);
  const selectedCharacterId = useEditorStore((state) => state.selectedCharacterId);
  const updateCharacter = useEditorStore((state) => state.updateCharacter);
  const addCharacter = useEditorStore((state) => state.addCharacter);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [newCharacterIcon, setNewCharacterIcon] = useState('GiPerson');

  const selectedCharacter = characters.find((a) => a.id === selectedCharacterId);

  const content = (
    <EmptyScreen
      icon={<GiPerson />}
      title={characters.length ? 'No Character Selected' : 'No Characters'}
      description={
        characters.length
          ? 'Select an character from the list to edit details.'
          : 'Define characters or named roles available to dialogue and gameplay systems.'
      }
      buttonLabel={characters.length ? undefined : 'Create First Character'}
      onCreate={characters.length ? undefined : onOpen}
    />
  );

  const centerContent = selectedCharacter ? (
    <DetailPanel key={selectedCharacter.id} maxWidth="1180px">
      <CharacterDetail
        key={selectedCharacter.id}
        character={selectedCharacter}
        onUpdate={updateCharacter}
      />
    </DetailPanel>
  ) : (
    content
  );

  return (
    <>
      <ResizableEditorLayout
        header={{
          title: 'Characters',
          subtitle: `${characters.length} character${characters.length !== 1 ? 's' : ''} defined`,
        }}
        content={centerContent}
      />

      <CreateItemDialog
        idPrefix={useEditorStore.getState().project?.idPrefix ?? 'base'}
        isOpen={isOpen}
        title="New Character"
        itemType="Character"
        existingIds={characters.map((a) => a.id)}
        onClose={onClose}
        onSubmit={async ({ id, name }) => {
          await addCharacter({ id, name, icon: newCharacterIcon });
          setNewCharacterIcon('GiPerson');
          onClose();
        }}
        additionalFields={
          <FormControl>
            <FormLabelUppercase mb={1}>Icon</FormLabelUppercase>
            <IconPicker value={newCharacterIcon} onChange={(v) => setNewCharacterIcon(v ?? '')} />
          </FormControl>
        }
      />
    </>
  );
};

const CharacterDetail: React.FC<{
  character: Character;
  onUpdate: (id: string, updates: Partial<Character>) => void;
}> = ({ character, onUpdate }) => {
  let form: ReturnType<typeof useForm<any, any, any, any, any, any, any, any, any, any, any, any>>;
  form = useForm({
    defaultValues: {
      name: character.name,
      icon: character.icon,
    },
    onSubmit: async ({ value }) => {
      onUpdate(character.id, value);
      form.reset(value);
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
        <HStack
          justify="space-between"
          align="start"
          spacing={4}
          pb={4}
          borderBottom="1px"
          borderColor="whiteAlpha.100"
        >
          <HStack spacing={4} align="center">
            <Box
              boxSize="56px"
              borderRadius="xl"
              bg="whiteAlpha.50"
              display="flex"
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
            >
              <GameIcon iconName={character.icon} size={26} fallback={<GiPerson />} />
            </Box>
            <VStack align="start" spacing={1}>
              <Text fontSize="lg" fontWeight="bold" color="editorText" lineHeight={1.1}>
                {character.name}
              </Text>
              <Text textStyle="monoMeta">{character.id}</Text>
              <Badge variant="editor">Character</Badge>
            </VStack>
          </HStack>
        </HStack>

        <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={6} alignItems="start">
          <GridItem>
            <VStack align="stretch" spacing={4}>
              <FormControl>
                <FieldLabel>ID</FieldLabel>
                <ReadOnlyIdField value={character.id} />
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

        <PortraitsSection
          character={character}
          onUpdate={(updates) => onUpdate(character.id, updates)}
        />

        <form.Subscribe selector={(state) => ({ isDirty: state.isDirty, values: state.values })}>
          {({ isDirty, values }) => (
            <FormAutosave isDirty={isDirty} values={values} onSave={() => form.handleSubmit()} />
          )}
        </form.Subscribe>
      </VStack>
    </form>
  );
};

const PortraitsSection: React.FC<{
  character: Character;
  onUpdate: (updates: Partial<Character>) => void;
}> = ({ character, onUpdate }) => {
  const emotions = useEditorStore((state) => state.emotions);
  const portraits = character.portraits ?? {};
  const [newEmotionId, setNewEmotionId] = useState<string | undefined>();

  const setPortrait = (emotionId: string, path: string) =>
    onUpdate({ portraits: { ...portraits, [emotionId]: path } });
  const removePortrait = (emotionId: string) => {
    const { [emotionId]: _removed, ...rest } = portraits;
    onUpdate({ portraits: rest });
  };

  return (
    <VStack align="stretch" spacing={4}>
      <FieldLabel>Portraits</FieldLabel>
      <PortraitField
        title="Default (used when an emotion has no portrait)"
        path={character.defaultPortrait}
        onChange={(path) => onUpdate({ defaultPortrait: path })}
      />
      {Object.entries(portraits).map(([emotionId, path]) => (
        <PortraitField
          key={emotionId}
          title={emotions.find((emotion) => emotion.id === emotionId)?.name ?? emotionId}
          path={path}
          onChange={(next) => next && setPortrait(emotionId, next)}
          onRemove={() => removePortrait(emotionId)}
        />
      ))}
      <HStack>
        <Box flex={1} maxW="240px">
          <EmotionSelect
            value={newEmotionId}
            onChange={setNewEmotionId}
            excludeIds={Object.keys(portraits)}
            placeholder="Add a portrait for..."
          />
        </Box>
        <Button
          size="xs"
          isDisabled={!newEmotionId}
          onClick={() => {
            if (!newEmotionId) return;
            // An emotion row starts with the default image, so it is never empty.
            setPortrait(newEmotionId, character.defaultPortrait ?? '');
            setNewEmotionId(undefined);
          }}
        >
          Add
        </Button>
      </HStack>
    </VStack>
  );
};

const FormAutosave: React.FC<{
  isDirty: boolean;
  values: unknown;
  onSave: () => void | Promise<void>;
}> = ({ isDirty, values, onSave }) => {
  React.useEffect(() => {
    if (!isDirty) return;
    const timeout = window.setTimeout(() => {
      void onSave();
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [isDirty, onSave, values]);

  return null;
};

export default CharacterEditor;
