import { EditorFormSave } from '../../common/EditorFormSave';
import React, { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import {
  Box,
  Button,
  FormControl,
  GridItem,
  Input,
  SimpleGrid,
  useDisclosure,
  VStack,
  HStack,
  Text,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { CreateItemDialog } from '../../common/CreateItemDialog';
import { EmptyScreen } from '../common/EmptyScreen';
import { CompactNumberInput, ReadOnlyIdField } from '../../common/Fields';
import { FieldLabel } from '../../common/Typography.tsx';
import { GiPerson } from 'react-icons/gi';
import { EmotionSelect } from '../../common/EmotionSelect';
import { PortraitField, portraitFolder, usePickPortrait } from './PortraitField';
import { ManifestResourceSelect } from '../../common/ManifestResourceSelect';
import { DEFAULT_SOCIAL_STANDING, DEFAULT_WALK_SPEED, type Character } from '../../../types/schema';

export const CharacterEditor: React.FC = () => {
  const characters = useEditorStore((state) => state.characters);
  const selectedCharacterId = useEditorStore((state) => state.selectedCharacterId);
  const updateCharacter = useEditorStore((state) => state.updateCharacter);
  const addCharacter = useEditorStore((state) => state.addCharacter);
  const { isOpen, onOpen, onClose } = useDisclosure();

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
    <CharacterDetail
      key={selectedCharacter.id}
      character={selectedCharacter}
      onUpdate={updateCharacter}
    />
  ) : (
    content
  );

  return (
    <>
      {centerContent}

      <CreateItemDialog
        idPrefix={useEditorStore.getState().project?.idPrefix ?? 'base'}
        isOpen={isOpen}
        title="New Character"
        itemType="Character"
        existingIds={characters.map((a) => a.id)}
        onClose={onClose}
        onSubmit={async ({ id, name }) => {
          await addCharacter({ id, name });
          onClose();
        }}
      />
    </>
  );
};

const CharacterDetail: React.FC<{
  character: Character;
  onUpdate: (id: string, updates: Partial<Character>) => Promise<void>;
}> = ({ character, onUpdate }) => {
  let form: ReturnType<typeof useForm<any, any, any, any, any, any, any, any, any, any, any, any>>;
  form = useForm({
    defaultValues: {
      name: character.name,
    },
    onSubmit: async ({ value }) => {
      await onUpdate(character.id, value);
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
        </SimpleGrid>

        <PortraitsSection
          character={character}
          onUpdate={(updates) => onUpdate(character.id, updates)}
        />

        <VoiceSection
          character={character}
          onUpdate={(updates) => onUpdate(character.id, updates)}
        />

        <MovementSection
          character={character}
          onUpdate={(updates) => onUpdate(character.id, updates)}
        />

        <SocialStandingSection
          character={character}
          onUpdate={(updates) => onUpdate(character.id, updates)}
        />

        <form.Subscribe selector={(state) => ({ isDirty: state.isDirty, values: state.values })}>
          {({ isDirty, values }) => (
            <EditorFormSave
              kind="character"
              resourceId={character.id}
              isDirty={isDirty}
              values={values}
              onSave={() => form.handleSubmit()}
            />
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
  const folder = portraitFolder(character.id);
  const pickPortrait = usePickPortrait(folder);

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
        folder={folder}
        path={character.defaultPortrait}
        onChange={(path) => onUpdate({ defaultPortrait: path })}
      />
      {Object.entries(portraits).map(([emotionId, path]) => (
        <PortraitField
          key={emotionId}
          title={emotions.find((emotion) => emotion.id === emotionId)?.name ?? emotionId}
          folder={folder}
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
          onClick={async () => {
            const picked = await pickPortrait();
            if (!newEmotionId || !picked) return;
            setPortrait(newEmotionId, picked);
            setNewEmotionId(undefined);
          }}
        >
          Pick Image...
        </Button>
      </HStack>
    </VStack>
  );
};

const SocialStandingSection: React.FC<{
  character: Character;
  onUpdate: (updates: Partial<Character>) => void;
}> = ({ character, onUpdate }) => (
  <VStack align="stretch" spacing={2}>
    <FieldLabel>Starting social standing</FieldLabel>
    <HStack spacing={2}>
      <Box w="110px">
        <CompactNumberInput
          min={0}
          max={100}
          step={5}
          value={character.startingSocialStanding ?? ''}
          inputProps={{
            'aria-label': 'Starting social standing',
            placeholder: String(DEFAULT_SOCIAL_STANDING),
          }}
          onChange={(_, standing) =>
            onUpdate({
              startingSocialStanding: Number.isFinite(standing)
                ? Math.min(100, Math.max(0, Math.round(standing)))
                : undefined,
            })
          }
        />
      </Box>
      <Text fontSize="xs" color="editorMutedText">
        0 to 100 in a new game. Empty uses {DEFAULT_SOCIAL_STANDING}.
      </Text>
    </HStack>
  </VStack>
);

const MovementSection: React.FC<{
  character: Character;
  onUpdate: (updates: Partial<Character>) => void;
}> = ({ character, onUpdate }) => (
  <VStack align="stretch" spacing={2}>
    <FieldLabel>Walk speed</FieldLabel>
    <HStack spacing={2}>
      <Box w="110px">
        <CompactNumberInput
          min={0.1}
          step={0.5}
          value={character.walkSpeed ?? ''}
          inputProps={{ 'aria-label': 'Walk speed', placeholder: String(DEFAULT_WALK_SPEED) }}
          onChange={(_, speed) =>
            onUpdate({ walkSpeed: Number.isFinite(speed) && speed > 0 ? speed : undefined })
          }
        />
      </Box>
      <Text fontSize="xs" color="editorMutedText">
        tiles per second. Empty uses {DEFAULT_WALK_SPEED}. Routines use it to time each walk.
      </Text>
    </HStack>
  </VStack>
);

const VoiceSection: React.FC<{
  character: Character;
  onUpdate: (updates: Partial<Character>) => void;
}> = ({ character, onUpdate }) => {
  const emotions = useEditorStore((state) => state.emotions);
  const overrides = character.emotionTypewriterSounds ?? {};
  const [newEmotionId, setNewEmotionId] = useState<string | undefined>();
  const [newSoundId, setNewSoundId] = useState<string | undefined>();

  const setOverride = (emotionId: string, soundId: string) =>
    onUpdate({ emotionTypewriterSounds: { ...overrides, [emotionId]: soundId } });
  const removeOverride = (emotionId: string) => {
    const { [emotionId]: _removed, ...rest } = overrides;
    onUpdate({ emotionTypewriterSounds: rest });
  };

  return (
    <VStack align="stretch" spacing={3}>
      <FieldLabel>Typewriter sound</FieldLabel>
      <Box maxW="240px">
        <ManifestResourceSelect
          resourceType="typewriterSound"
          value={character.typewriterSound}
          onChange={(soundId) => onUpdate({ typewriterSound: soundId })}
          placeholder="Dialogue default"
        />
      </Box>
      {Object.entries(overrides).map(([emotionId, soundId]) => (
        <HStack key={emotionId}>
          <Text fontSize="sm" w="120px" noOfLines={1}>
            {emotions.find((emotion) => emotion.id === emotionId)?.name ?? emotionId}
          </Text>
          <Box w="200px">
            <ManifestResourceSelect
              resourceType="typewriterSound"
              value={soundId}
              onChange={(next) => (next ? setOverride(emotionId, next) : removeOverride(emotionId))}
            />
          </Box>
          <Button
            size="xs"
            variant="ghost"
            color="red.400"
            onClick={() => removeOverride(emotionId)}
          >
            Remove
          </Button>
        </HStack>
      ))}
      <HStack>
        <Box w="120px">
          <EmotionSelect
            value={newEmotionId}
            onChange={setNewEmotionId}
            excludeIds={Object.keys(overrides)}
            placeholder="Emotion..."
          />
        </Box>
        <Box w="200px">
          <ManifestResourceSelect
            resourceType="typewriterSound"
            value={newSoundId}
            onChange={setNewSoundId}
            placeholder="Sound..."
          />
        </Box>
        <Button
          size="xs"
          isDisabled={!newEmotionId || !newSoundId}
          onClick={() => {
            if (!newEmotionId || !newSoundId) return;
            setOverride(newEmotionId, newSoundId);
            setNewEmotionId(undefined);
            setNewSoundId(undefined);
          }}
        >
          Add
        </Button>
      </HStack>
    </VStack>
  );
};

export default CharacterEditor;
