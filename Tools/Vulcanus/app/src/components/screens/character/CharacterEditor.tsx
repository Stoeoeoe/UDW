import { EditorFormSave } from '../../common/EditorFormSave';
import React, { useState } from 'react';
import { useForm } from '@tanstack/react-form';
import {
  Badge,
  Box,
  Button,
  FormControl,
  GridItem,
  Input,
  Select,
  SimpleGrid,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useDisclosure,
  VStack,
  HStack,
  Text,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { CreateItemDialog } from '../../common/CreateItemDialog';
import { EmptyScreen } from '../common/EmptyScreen';
import { TopTabbedEditorLayout } from '../common/TopTabbedEditorLayout';
import { CompactNumberInput, ReadOnlyIdField } from '../../common/Fields';
import { FieldLabel } from '../../common/Typography.tsx';
import { GiPerson } from 'react-icons/gi';
import { FiArrowDown, FiArrowUp } from 'react-icons/fi';
import { EmotionSelect } from '../../common/EmotionSelect';
import { PortraitField, portraitFolder, usePickPortrait } from './PortraitField';
import { ManifestResourceSelect } from '../../common/ManifestResourceSelect';
import {
  DEFAULT_SOCIAL_STANDING,
  DEFAULT_WALK_SPEED,
  type Character,
  type DialogueRule,
} from '../../../types/schema';
import { bandOf } from '../../../lib/socialStandingBands';
import {
  compileRules,
  knownOccupations,
  rulesOf,
  standingOptions,
} from '../../../lib/dialogueRules';
import { DialogueSelect } from '../routine/DialogueSelect';
import { ConditionEditor } from '../scripting/ConditionEditor';
import { GhostIconButton } from '../../common/IconButtons';

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

  const [tab, setTab] = useState<CharacterTab>('general');
  const update = (updates: Partial<Character>) => onUpdate(character.id, updates);

  return (
    <form
      style={{ height: '100%' }}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <TopTabbedEditorLayout
        title=""
        tabs={[
          { id: 'general', label: 'General' },
          {
            id: 'portraits',
            label: 'Portraits',
            badge: Object.keys(character.portraits ?? {}).length,
          },
          {
            id: 'voice',
            label: 'Voice',
            badge:
              (character.typewriterSound ? 1 : 0) +
              Object.keys(character.emotionTypewriterSounds ?? {}).length,
          },
          { id: 'dialogues', label: 'Dialogues', badge: character.dialogues?.length ?? 0 },
        ]}
        activeTab={tab}
        onTabChange={setTab}
        mainContent={
          <Box h="full" overflowY="auto" p={6} bg="editorWorkspaceBg">
            <Box w="full" maxW="1120px" mx="auto">
              {tab === 'general' && (
                <VStack align="stretch" spacing={5} maxW="420px">
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

                  <MovementSection character={character} onUpdate={update} />
                  <SocialStandingSection character={character} onUpdate={update} />
                </VStack>
              )}
              {tab === 'portraits' && <PortraitsSection character={character} onUpdate={update} />}
              {tab === 'voice' && <VoiceSection character={character} onUpdate={update} />}
              {tab === 'dialogues' && <DialoguesSection character={character} onUpdate={update} />}
            </Box>
          </Box>
        }
        footerContent={
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
        }
      />
    </form>
  );
};

type CharacterTab = 'general' | 'portraits' | 'voice' | 'dialogues';

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
      <SimpleGrid columns={{ base: 2, md: 3, xl: 5 }} spacing={3}>
        <PortraitField
          title="Default"
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
      </SimpleGrid>
      <Text fontSize="xs" color="editorMutedText">
        The default is used when an emotion has no portrait of its own.
      </Text>
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
      <Badge variant="editor" aria-label="Starting band">
        {bandOf(character.startingSocialStanding ?? DEFAULT_SOCIAL_STANDING).name}
      </Badge>
      <Text fontSize="xs" color="editorMutedText">
        0 to 100 in a new game. Empty uses {DEFAULT_SOCIAL_STANDING}.
      </Text>
    </HStack>
  </VStack>
);

/**
 * What the character says when no quest objective and no routine sets a dialogue, as a decision table: each row says
 * a dialogue when every column it sets holds when the player starts talking. The first matching row wins, so the order
 * matters; with no match the character cannot be talked to. Saving compiles the rows into Lua conditions.
 */
const DialoguesSection: React.FC<{
  character: Character;
  onUpdate: (updates: Partial<Character>) => void;
}> = ({ character, onUpdate }) => {
  const rules = rulesOf(character);
  const [luaOpen, setLuaOpen] = useState<number | null>(null);
  const occupations = knownOccupations(useEditorStore((state) => state.routines));
  const save = (next: DialogueRule[]) =>
    onUpdate({
      dialogueRules: next.length ? next : undefined,
      dialogues: next.length ? compileRules(character.id, next) : undefined,
    });
  const change = (index: number, rule: DialogueRule) =>
    save(rules.map((r, i) => (i === index ? rule : r)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...rules];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    save(next);
  };
  /** Sets or clears one column of a row. */
  const column = (
    index: number,
    key: 'standing' | 'occupation' | 'weather',
    value: string | undefined,
  ) => {
    const { [key]: _old, ...rest } = rules[index];
    change(index, value ? { ...rest, [key]: value } : rest);
  };

  return (
    <VStack align="stretch" spacing={3}>
      <Text fontSize="xs" color="editorMutedText">
        Said when no quest or routine sets one. The first row that holds when the player starts
        talking wins; a column left on "any" does not matter. Without a match the character cannot
        be talked to.
      </Text>
      <Box
        overflowX="auto"
        borderWidth="1px"
        borderColor="editorShellBorder"
        borderRadius="md"
        bg="editorPanelBg"
      >
        <Table size="sm" variant="unstyled" sx={{ 'td, th': { px: 3, py: 1.5 } }}>
          <Thead
            sx={{
              th: {
                fontSize: '10px',
                letterSpacing: 'widest',
                textTransform: 'uppercase',
                color: 'editorMutedText',
                fontWeight: 'bold',
              },
            }}
          >
            <Tr bg="editorSectionBg" borderBottomWidth="1px" borderColor="editorShellBorder">
              <Th w="40px">#</Th>
              <Th minW="220px">Says</Th>
              <Th minW="150px">Standing</Th>
              <Th minW="130px">Busy with</Th>
              <Th minW="130px">Weather</Th>
              <Th w="1%">Lua Condition</Th>
              <Th w="1%" />
            </Tr>
          </Thead>
          <Tbody>
            {rules.length === 0 && (
              <Tr>
                <Td colSpan={7}>
                  <Text fontSize="xs" color="editorMutedText">
                    No rows yet: the character cannot be talked to.
                  </Text>
                </Td>
              </Tr>
            )}
            {rules.map((rule, index) => (
              <React.Fragment key={index}>
                <Tr
                  data-group
                  borderBottomWidth="1px"
                  borderColor="editorShellBorder"
                  _hover={{ bg: 'editorHoverBg' }}
                >
                  <Td>
                    <Text fontSize="xs" fontWeight="bold" color="editorMutedText">
                      {index + 1}
                    </Text>
                  </Td>
                  <Td>
                    <DialogueSelect
                      label={`Dialogue ${index + 1}`}
                      value={rule.dialogue}
                      inherited={null}
                      onChange={(id) => id && change(index, { ...rule, dialogue: id })}
                      newName={`${character.name} – dialogue ${index + 1}`}
                      newFolder={character.name}
                    />
                  </Td>
                  <Td>
                    <Select
                      size="xs"
                      variant="compact"
                      color={rule.standing ? 'editorText' : 'editorMutedText'}
                      aria-label={`Standing ${index + 1}`}
                      value={rule.standing ?? ''}
                      onChange={(e) => column(index, 'standing', e.target.value || undefined)}
                    >
                      <option value="">any</option>
                      {standingOptions().map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td>
                    <Select
                      size="xs"
                      variant="compact"
                      color={rule.occupation ? 'editorText' : 'editorMutedText'}
                      aria-label={`Busy with ${index + 1}`}
                      value={rule.occupation ?? ''}
                      onChange={(e) => column(index, 'occupation', e.target.value || undefined)}
                    >
                      <option value="">any</option>
                      {rule.occupation && !occupations.includes(rule.occupation) && (
                        <option value={rule.occupation}>Missing: {rule.occupation}</option>
                      )}
                      {occupations.map((occupation) => (
                        <option key={occupation} value={occupation}>
                          {occupation}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td>
                    <ManifestResourceSelect
                      resourceType="weather"
                      value={rule.weather}
                      placeholder="any"
                      onChange={(weather) => column(index, 'weather', weather)}
                    />
                  </Td>
                  <Td>
                    <Button
                      size="xs"
                      variant={rule.condition ? 'solid' : 'ghost'}
                      colorScheme={rule.condition ? 'blue' : undefined}
                      aria-label={`Lua condition ${index + 1}`}
                      aria-expanded={luaOpen === index}
                      onClick={() => setLuaOpen(luaOpen === index ? null : index)}
                    >
                      {rule.condition ? 'Lua •' : 'Lua'}
                    </Button>
                  </Td>
                  <Td>
                    <HStack
                      spacing={0}
                      justify="flex-end"
                      opacity={0.35}
                      transition="opacity 0.15s"
                      _groupHover={{ opacity: 1 }}
                      _focusWithin={{ opacity: 1 }}
                    >
                      <GhostIconButton
                        aria-label={`Move dialogue ${index + 1} up`}
                        icon={<FiArrowUp />}
                        size="xs"
                        isDisabled={index === 0}
                        onClick={() => move(index, -1)}
                      />
                      <GhostIconButton
                        aria-label={`Move dialogue ${index + 1} down`}
                        icon={<FiArrowDown />}
                        size="xs"
                        isDisabled={index === rules.length - 1}
                        onClick={() => move(index, 1)}
                      />
                      <Button
                        size="xs"
                        variant="ghost"
                        color="red.400"
                        aria-label={`Remove dialogue ${index + 1}`}
                        onClick={() => save(rules.filter((_, i) => i !== index))}
                      >
                        Remove
                      </Button>
                    </HStack>
                  </Td>
                </Tr>
                {luaOpen === index && (
                  <Tr>
                    <Td colSpan={7} bg="editorSectionBg">
                      <ConditionEditor
                        label="And also, if (Lua, optional)"
                        value={rule.condition ?? ''}
                        onChange={(condition) =>
                          change(index, { ...rule, condition: condition || undefined })
                        }
                      />
                    </Td>
                  </Tr>
                )}
              </React.Fragment>
            ))}
          </Tbody>
        </Table>
      </Box>
      <Box maxW="320px">
        <DialogueSelect
          label="Add a dialogue"
          value={undefined}
          inherited={null}
          emptyLabel="Add a dialogue…"
          onChange={(id) => id && save([...rules, { dialogue: id }])}
          newName={`${character.name} – dialogue ${rules.length + 1}`}
          newFolder={character.name}
        />
      </Box>
    </VStack>
  );
};

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
