import React, { useMemo } from 'react';
import { useForm } from '@tanstack/react-form';
import {
  VStack,
  HStack,
  Text,
  Box,
  Input,
  Select,
  FormControl,
  Button,
  IconButton,
  useDisclosure,
  Divider,
  NumberInput,
  NumberInputField,
  Tooltip,
} from '@chakra-ui/react';
import { DeleteIcon, RepeatIcon, CheckIcon } from '@chakra-ui/icons';
import { fileSystem } from '../../../lib/fileSystem';

async function loadSpriteBlob(path: string): Promise<Blob> {
  const looksRelative = !path.match(/^([A-Za-z]:[/\\]|\/)/);
  if (looksRelative) return fileSystem.loadAsset(path);
  return fileSystem.readFileAsBlob(path);
}

import { useEditorStore } from '../../../store/useEditorStore';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { ListPanel, ListPanelItem } from '../common';
import { DetailPanel } from '../../common/DetailPanel';
import { GameIcon } from '../../common/GameIcon';
import { useFilteredList } from '../../../hooks/useFilteredList';
import { EntityType, EntityCategory } from '../../../types/schema';
import { CreateEntityTypeDialog } from './CreateEntityTypeDialog';
import { PropertyDefinitionEditor } from './PropertyDefinitionEditor';
import { EmptyScreen } from '../common/EmptyScreen';
import { IconPicker, ColorPicker } from '../common/FormFields';
import { FieldLabel } from '../../common/Typography.tsx';
import { SectionLabel } from '../../common/Typography.tsx';

const CATEGORIES: { value: EntityCategory; label: string; icon: string }[] = [
  { value: 'object', label: 'Object', icon: '📦' },
  { value: 'trigger', label: 'Trigger', icon: '⚡' },
  { value: 'spawn', label: 'Spawn', icon: '🎯' },
  { value: 'transition', label: 'Transition', icon: '🚪' },
  { value: 'decoration', label: 'Decoration', icon: '🌿' },
];

export const EntityEditor: React.FC = () => {
  const entityTypes = useEditorStore((state) => state.entityTypes);
  const selectedEntityTypeId = useEditorStore((state) => state.selectedEntityTypeId);
  const setSelectedEntityType = useEditorStore((state) => state.setSelectedEntityType);
  const updateEntityType = useEditorStore((state) => state.updateEntityType);
  const deleteEntityType = useEditorStore((state) => state.deleteEntityType);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [search, setSearch] = React.useState('');

  const selectedType = entityTypes.find((t) => t.id === selectedEntityTypeId);

  const entityItems: ListPanelItem[] = useMemo(
    () =>
      entityTypes.map((type) => ({
        id: type.id,
        label: type.displayName,
        sublabel: type.group ? `${type.group} • ${type.category}` : type.category.toUpperCase(),
        icon: <GameIcon iconName={type.icon} size={24} fallback="GiBox" />,
      })),
    [entityTypes],
  );

  const filteredEntityItems = useFilteredList(entityItems, search);

  const deleteEntityTypeById = async (id: string, displayName: string) => {
    if (!confirm(`Delete entity type "${displayName}"?`)) return;
    await deleteEntityType(id);
  };

  const existingGroups = useMemo(() => {
    const groups = new Set<string>();
    entityTypes.forEach((et) => {
      if (et.group) groups.add(et.group);
    });
    return Array.from(groups).sort();
  }, [entityTypes]);

  const leftPanel = (
    <ListPanel
      title="Entity Types"
      items={filteredEntityItems}
      selectedId={selectedEntityTypeId}
      onSelect={setSelectedEntityType}
      onAdd={onOpen}
      autoSelectFirst={true}
      emptyMessage="No entity types defined"
      topContent={
        <Input
          size="xs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search entity types..."
          bg="#0a0a0b"
          borderColor="#333"
          color="gray.100"
        />
      }
      onDeleteItem={async (item) => {
        const entityType = entityTypes.find((entry) => entry.id === item.id);
        if (!entityType) return;
        await deleteEntityTypeById(entityType.id, entityType.displayName);
      }}
      deleteActionLabel="Delete entity type"
    />
  );

  const emptyContent =
    entityTypes.length === 0 ? (
      <EmptyScreen
        icon={<GameIcon iconName="GiBox" size={48} />}
        title="No Entity Types"
        description="Define entity blueprints that can be placed on maps. Entity types describe objects, actors, triggers, and other game elements."
        buttonLabel="Create First Entity"
        onCreate={onOpen}
      />
    ) : (
      <EmptyScreen
        icon={<GameIcon iconName="GiBox" size={48} />}
        title="No Entity Type Selected"
        description="Select an entity type from the list to edit its data and property schema."
      />
    );

  const centerContent = selectedType ? (
    <DetailPanel key={selectedType.id} maxWidth="900px">
      <EntityTypeDetail
        key={selectedType.id}
        entityType={selectedType}
        existingGroups={existingGroups}
        onUpdate={updateEntityType}
        onDelete={async () => deleteEntityTypeById(selectedType.id, selectedType.displayName)}
      />
    </DetailPanel>
  ) : (
    emptyContent
  );

  return (
    <>
      <ResizableEditorLayout
        header={{
          title: 'Entity Types',
          subtitle: `${entityTypes.length} type${entityTypes.length !== 1 ? 's' : ''} defined`,
        }}
        content={centerContent}
        leftPanel={leftPanel}
        leftPanelDefaultSize={18}
      />

      <CreateEntityTypeDialog isOpen={isOpen} onClose={onClose} />
    </>
  );
};

const EntityTypeDetail: React.FC<{
  entityType: EntityType;
  existingGroups: string[];
  onUpdate: (id: string, updates: Partial<EntityType>) => void;
  onDelete: () => void;
}> = ({ entityType, existingGroups, onUpdate, onDelete }) => {
  const form = useForm({
    defaultValues: {
      displayName: entityType.displayName,
      category: entityType.category,
      group: entityType.group,
      description: entityType.description,
      icon: entityType.icon,
      placeholderColor: entityType.placeholderColor,
      defaultSize: entityType.defaultSize,
      sprite: entityType.sprite,
      properties: entityType.properties,
    },
    onSubmit: async ({ value }) => {
      onUpdate(entityType.id, {
        displayName: value.displayName,
        category: value.category,
        group: value.group,
        description: value.description,
        icon: value.icon,
        placeholderColor: value.placeholderColor,
        defaultSize: value.defaultSize,
        sprite: value.sprite,
        properties: value.properties,
      });
    },
  });

  const [spritePath, setSpritePath] = React.useState(entityType.sprite?.path);
  const [spriteLoading, setSpriteLoading] = React.useState(false);
  const loadSprite = useEditorStore((state) => state.loadSprite);
  const loadedSprites = useEditorStore((state) => state.loadedSprites);
  const isLoaded = spritePath ? loadedSprites.has(spritePath) : false;

  const loadImageFromPath = async (path: string, blobHint?: Blob) => {
    setSpriteLoading(true);
    try {
      const blob = blobHint ?? (await loadSpriteBlob(path));
      await loadSprite(path, blob);
      const img = useEditorStore.getState().loadedSprites.get(path);
      if (img) {
        form.setFieldValue('defaultSize', [img.naturalWidth, img.naturalHeight]);
      }
    } catch (e) {
      console.error('Failed to load sprite:', e);
    } finally {
      setSpriteLoading(false);
    }
  };

  const handlePickSprite = async () => {
    try {
      const absolutePath = await fileSystem.selectAsset();
      if (!absolutePath) return;
      const blob = await fileSystem.readFileAsBlob(absolutePath);
      const filename = absolutePath.replace(/\\/g, '/').split('/').pop() || 'sprite.png';
      const relativePath = await fileSystem.saveAsset(filename, blob);
      setSpritePath(relativePath);
      form.setFieldValue('sprite', { path: relativePath });
      await loadImageFromPath(relativePath, blob);
    } catch (e) {
      console.error('Failed to pick sprite:', e);
    }
  };

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
              {entityType.id}
            </Text>
          </FormControl>

          <form.Field name="displayName">
            {(field) => (
              <FormControl>
                <FieldLabel>Display Name</FieldLabel>
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

          <HStack spacing={3}>
            <form.Field name="category">
              {(field) => (
                <FormControl flex={1}>
                  <FieldLabel>Category</FieldLabel>
                  <Select
                    size="sm"
                    bg="gray.950"
                    color="white"
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value as EntityCategory)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.icon} {c.label}
                      </option>
                    ))}
                  </Select>
                </FormControl>
              )}
            </form.Field>
            <form.Field name="group">
              {(field) => (
                <FormControl flex={1}>
                  <FieldLabel>Group</FieldLabel>
                  <Input
                    size="sm"
                    bg="gray.950"
                    color="white"
                    name={field.name}
                    value={field.state.value ?? ''}
                    onBlur={field.handleBlur}
                    onChange={(e) =>
                      field.handleChange(e.target.value ? e.target.value : undefined)
                    }
                    placeholder="Ungrouped"
                    list="entity-groups"
                  />
                  {existingGroups.length > 0 && (
                    <datalist id="entity-groups">
                      {existingGroups.map((g) => (
                        <option key={g} value={g} />
                      ))}
                    </datalist>
                  )}
                </FormControl>
              )}
            </form.Field>
          </HStack>

          <form.Field name="description">
            {(field) => (
              <FormControl>
                <FieldLabel>Description</FieldLabel>
                <Input
                  size="sm"
                  bg="gray.950"
                  color="white"
                  name={field.name}
                  value={field.state.value ?? ''}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value ? e.target.value : undefined)}
                  placeholder="Optional"
                />
              </FormControl>
            )}
          </form.Field>

          <HStack spacing={3}>
            <form.Field name="icon">
              {(field) => (
                <FormControl flex={1}>
                  <FieldLabel>Icon</FieldLabel>
                  <IconPicker
                    value={field.state.value}
                    onChange={(v) => field.handleChange(v ?? '')}
                  />
                </FormControl>
              )}
            </form.Field>
            <form.Field name="placeholderColor">
              {(field) => (
                <FormControl flex={1}>
                  <FieldLabel>Color</FieldLabel>
                  <ColorPicker value={field.state.value} onChange={(c) => field.handleChange(c)} />
                </FormControl>
              )}
            </form.Field>
          </HStack>
        </VStack>

        <Divider borderColor="#071018" />

        <VStack align="stretch" spacing={3}>
          <SectionLabel textStyle="fieldLabel">Size (px)</SectionLabel>
          <HStack spacing={2}>
            <Text fontSize="xs" color="gray.400" flexShrink={0}>
              W
            </Text>
            <form.Field name="defaultSize">
              {(field) => (
                <NumberInput
                  min={1}
                  value={field.state.value?.[0] ?? 16}
                  precision={0}
                  onChange={(_, val) => {
                    if (!isNaN(val))
                      field.handleChange([Math.round(val), field.state.value?.[1] ?? 16]);
                  }}
                  flex={1}
                >
                  <NumberInputField bg="gray.950" color="white" />
                </NumberInput>
              )}
            </form.Field>
            <Text fontSize="xs" color="gray.400" flexShrink={0}>
              H
            </Text>
            <form.Field name="defaultSize">
              {(field) => (
                <NumberInput
                  min={1}
                  value={field.state.value?.[1] ?? 16}
                  precision={0}
                  onChange={(_, val) => {
                    if (!isNaN(val))
                      field.handleChange([field.state.value?.[0] ?? 16, Math.round(val)]);
                  }}
                  flex={1}
                >
                  <NumberInputField bg="gray.950" color="white" />
                </NumberInput>
              )}
            </form.Field>
          </HStack>
        </VStack>

        <Divider borderColor="#071018" />

        <form.Field name="sprite">
          {(field) => (
            <EntitySpriteEditor
              spritePath={spritePath}
              isLoaded={isLoaded}
              loadedSprites={loadedSprites}
              spriteLoading={spriteLoading}
              onPathChange={(path) => {
                setSpritePath(path);
                field.handleChange(path ? { path } : undefined);
              }}
              onLoadImage={(path, blob) => loadImageFromPath(path, blob)}
              onPickSprite={handlePickSprite}
            />
          )}
        </form.Field>

        <Divider borderColor="#071018" />

        <form.Field name="properties">
          {(field) => (
            <PropertyDefinitionEditor
              properties={field.state.value ?? {}}
              onChange={(properties) => {
                field.handleChange(properties);
              }}
            />
          )}
        </form.Field>

        <Divider borderColor="#071018" />

        <HStack justify="space-between">
          <Button
            size="xs"
            colorScheme="red"
            variant="outline"
            leftIcon={<DeleteIcon fontSize="10px" />}
            onClick={onDelete}
          >
            Delete Entity Type
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

const EntitySpriteEditor: React.FC<{
  spritePath: string | undefined;
  isLoaded: boolean;
  loadedSprites: Map<string, HTMLImageElement>;
  spriteLoading: boolean;
  onPathChange: (path: string | undefined) => void;
  onLoadImage: (path: string, blob?: Blob) => Promise<void>;
  onPickSprite: () => Promise<void>;
}> = ({
  spritePath,
  isLoaded,
  loadedSprites,
  spriteLoading,
  onPathChange,
  onLoadImage,
  onPickSprite,
}) => {
  return (
    <VStack align="stretch" spacing={3}>
      <SectionLabel textStyle="fieldLabel">Sprite</SectionLabel>
      {spritePath ? (
        <VStack align="stretch" spacing={2}>
          {isLoaded && (
            <Box
              bg="#0a0a0b"
              border="1px"
              borderColor="#1a1a2e"
              borderRadius="md"
              p={2}
              display="flex"
              alignItems="center"
              justifyContent="center"
              minH="60px"
            >
              <img
                src={loadedSprites.get(spritePath)?.src}
                alt="Sprite preview"
                style={{
                  maxWidth: '100%',
                  maxHeight: '120px',
                  objectFit: 'contain',
                  imageRendering: 'pixelated',
                }}
              />
            </Box>
          )}
          <Text
            fontSize="xs"
            color="gray.500"
            fontFamily="mono"
            noOfLines={2}
            wordBreak="break-all"
          >
            {spritePath}
          </Text>
          <HStack spacing={2}>
            <Tooltip label="Reload from disk" hasArrow>
              <IconButton
                aria-label="Reload sprite"
                icon={<RepeatIcon />}
                size="xs"
                variant="outline"
                colorScheme="blue"
                isLoading={spriteLoading}
                onClick={() => onLoadImage(spritePath)}
              />
            </Tooltip>
            <Button size="xs" variant="ghost" color="gray.400" onClick={onPickSprite}>
              Change
            </Button>
            <Button
              size="xs"
              variant="ghost"
              color="red.400"
              onClick={() => onPathChange(undefined)}
            >
              Remove
            </Button>
          </HStack>
        </VStack>
      ) : (
        <Button
          size="xs"
          variant="outline"
          colorScheme="gray"
          onClick={onPickSprite}
          isLoading={spriteLoading}
        >
          Pick Image…
        </Button>
      )}
    </VStack>
  );
};

export default EntityEditor;
