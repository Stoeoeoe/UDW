import React, { useMemo, useState } from 'react';
import {
  VStack,
  HStack,
  Text,
  Box,
  Input,
  Select,
  FormControl,
  FormLabel,
  Circle,
  Button,
  IconButton,
  useDisclosure,
  Divider,
  NumberInput,
  NumberInputField,
  Tooltip,
} from '@chakra-ui/react';
import { DeleteIcon, RepeatIcon } from '@chakra-ui/icons';
import { fileSystem } from '../../../lib/fileSystem';

/** Load a sprite blob — try relative path first, fall back to absolute for old files. */
async function loadSpriteBlob(path: string): Promise<Blob> {
  // Relative paths start with "assets/" or similar (no drive letter / leading slash)
  const looksRelative = !path.match(/^([A-Za-z]:[/\\]|\/)/);
  if (looksRelative) {
    return fileSystem.loadAsset(path);
  }
  // Absolute path (legacy) — read directly
  return fileSystem.readFileAsBlob(path);
}
import { useEditorStore } from '../../../store/useEditorStore';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { ListPanel, ListPanelItem } from '../common';
import { EntityType, PropertyDefinition, EntityCategory } from '../../../types/schema';
import { EditorModal } from '../../common/EditorModal';
import { CreateEntityTypeDialog } from './CreateEntityTypeDialog';
import { PropertyDefinitionEditor } from './PropertyDefinitionEditor';
import { EmptyScreen } from '../common/EmptyScreen';
import { IconPicker, ColorPicker } from '../common/FormFields';

const CATEGORIES: { value: EntityCategory; label: string; icon: string }[] = [
  { value: 'object', label: 'Object', icon: '📦' },
  { value: 'trigger', label: 'Trigger', icon: '⚡' },
  { value: 'spawn', label: 'Spawn', icon: '🎯' },
  { value: 'transition', label: 'Transition', icon: '🚪' },
  { value: 'decoration', label: 'Decoration', icon: '🌿' },
];

type EditableEntityTypeKey = keyof Pick<
  EntityType,
  | 'displayName'
  | 'category'
  | 'group'
  | 'icon'
  | 'placeholderColor'
  | 'description'
  | 'defaultSize'
  | 'sprite'
>;

/**
 * EntityEditor - Browse, create, edit, and delete entity type definitions.
 * Entity types are stored per-project and persisted to project.json.
 */
export const EntityEditor: React.FC = () => {
  const entityTypes = useEditorStore((state) => state.entityTypes);
  const selectedEntityTypeId = useEditorStore((state) => state.selectedEntityTypeId);
  const setSelectedEntityType = useEditorStore((state) => state.setSelectedEntityType);
  const updateEntityType = useEditorStore((state) => state.updateEntityType);
  const deleteEntityType = useEditorStore((state) => state.deleteEntityType);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [search, setSearch] = useState('');

  const selectedType = entityTypes.find((t) => t.id === selectedEntityTypeId);

  // Group entity items for the list panel
  const entityItems: ListPanelItem[] = useMemo(
    () =>
      entityTypes.map((type) => ({
        id: type.id,
        label: type.displayName,
        sublabel: type.group ? `${type.group} • ${type.category}` : type.category.toUpperCase(),
        icon: (
          <Box
            w="20px"
            h="20px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            bg={type.placeholderColor}
            borderRadius="sm"
            fontSize="11px"
          >
            {type.icon || '📦'}
          </Box>
        ),
      })),
    [entityTypes],
  );

  const filteredEntityItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entityItems;
    return entityItems.filter((item) => {
      const hitLabel = item.label.toLowerCase().includes(query);
      const hitSublabel = item.sublabel?.toLowerCase().includes(query);
      return hitLabel || Boolean(hitSublabel);
    });
  }, [entityItems, search]);

  const handlePropertyChange = (key: EditableEntityTypeKey, value: unknown) => {
    if (selectedEntityTypeId && selectedType) {
      updateEntityType(selectedEntityTypeId, { [key]: value } as Partial<EntityType>);
    }
  };

  const handlePropertiesChange = (properties: PropertyDefinition[]) => {
    if (selectedEntityTypeId) {
      updateEntityType(selectedEntityTypeId, { properties });
    }
  };

  const handleDelete = async () => {
    if (selectedEntityTypeId) {
      const selectedEntity = entityTypes.find((entry) => entry.id === selectedEntityTypeId);
      if (!selectedEntity) return;
      await deleteEntityTypeById(selectedEntity.id, selectedEntity.displayName);
    }
  };

  const deleteEntityTypeById = async (id: string, displayName: string) => {
    if (!confirm(`Delete entity type "${displayName}"?`)) return;
    await deleteEntityType(id);
  };

  // Collect existing groups for autocomplete
  const existingGroups = useMemo(() => {
    const groups = new Set<string>();
    entityTypes.forEach((et) => {
      if (et.group) groups.add(et.group);
    });
    return Array.from(groups).sort();
  }, [entityTypes]);

  // Left panel: entity type list
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

  // Main content: master-detail
  const content =
    entityTypes.length === 0 ? (
      <EmptyScreen
        icon="🎯"
        title="No Entity Types"
        description="Define entity blueprints that can be placed on maps. Entity types describe objects, actors, triggers, and other game elements."
        buttonLabel="Create First Entity"
        onCreate={onOpen}
      />
    ) : !selectedType ? (
      <EmptyScreen
        icon="🎯"
        title="No Entity Type Selected"
        description="Select an entity type from the list to edit its data and property schema."
      />
    ) : (
      <EntityTypeDetail
        selectedType={selectedType}
        existingGroups={existingGroups}
        onPropertyChange={handlePropertyChange}
        onPropertiesChange={handlePropertiesChange}
        onDelete={handleDelete}
      />
    );

  return (
    <>
      <ResizableEditorLayout
        header={{
          title: 'Entity Types',
          subtitle: `${entityTypes.length} type${entityTypes.length !== 1 ? 's' : ''} defined`,
        }}
        content={content}
        leftPanel={leftPanel}
        leftPanelDefaultSize={18}
      />

      <EditorModal isOpen={isOpen} onClose={onClose}>
        <CreateEntityTypeDialog onClose={onClose} />
      </EditorModal>
    </>
  );
};

const EntityTypeDetail: React.FC<{
  selectedType: EntityType;
  existingGroups: string[];
  onPropertyChange: (key: EditableEntityTypeKey, value: unknown) => void;
  onPropertiesChange: (properties: PropertyDefinition[]) => void;
  onDelete: () => void;
}> = ({ selectedType, existingGroups, onPropertyChange, onPropertiesChange, onDelete }) => {
  return (
    <Box p={6} overflowY="auto" h="full">
      <VStack align="stretch" spacing={5} maxW="760px" mx="auto">
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
              {selectedType.id}
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
              Display Name
            </FormLabel>
            <Input
              size="xs"
              variant="filled"
              bg="#0a0a0b"
              color="white"
              value={selectedType.displayName}
              onChange={(e) => onPropertyChange('displayName', e.target.value)}
              _hover={{ bg: '#071018' }}
            />
          </FormControl>

          <HStack spacing={3}>
            <FormControl flex={1}>
              <FormLabel
                color="gray.500"
                fontSize="10px"
                fontWeight="black"
                textTransform="uppercase"
                mb={1}
              >
                Category
              </FormLabel>
              <Select
                size="xs"
                bg="#0a0a0b"
                borderColor="#1a1a2e"
                color="white"
                value={selectedType.category}
                onChange={(e) => onPropertyChange('category', e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value} style={{ background: '#0a0a0b' }}>
                    {c.icon} {c.label}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl flex={1}>
              <FormLabel
                color="gray.500"
                fontSize="10px"
                fontWeight="black"
                textTransform="uppercase"
                mb={1}
              >
                Group
              </FormLabel>
              <Input
                size="xs"
                variant="filled"
                bg="#0a0a0b"
                color="white"
                value={selectedType.group ?? ''}
                onChange={(e) => onPropertyChange('group', e.target.value || undefined)}
                placeholder="Ungrouped"
                list="entity-groups"
                _hover={{ bg: '#071018' }}
              />
              {existingGroups.length > 0 && (
                <datalist id="entity-groups">
                  {existingGroups.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              )}
            </FormControl>
          </HStack>

          <FormControl>
            <FormLabel
              color="gray.500"
              fontSize="10px"
              fontWeight="black"
              textTransform="uppercase"
              mb={1}
            >
              Description
            </FormLabel>
            <Input
              size="xs"
              variant="filled"
              bg="#0a0a0b"
              color="white"
              value={selectedType.description ?? ''}
              onChange={(e) => onPropertyChange('description', e.target.value || undefined)}
              placeholder="Optional"
              _hover={{ bg: '#071018' }}
            />
          </FormControl>

          <VStack align="stretch" spacing={3}>
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
              <IconPicker value={selectedType.icon} onChange={(v) => onPropertyChange('icon', v)} />
            </FormControl>

            <FormControl>
              <FormLabel
                color="gray.500"
                fontSize="10px"
                fontWeight="black"
                textTransform="uppercase"
                mb={1}
              >
                Color
              </FormLabel>
              <ColorPicker
                value={selectedType.placeholderColor}
                onChange={(c) => onPropertyChange('placeholderColor', c)}
              />
            </FormControl>
          </VStack>
        </VStack>

        <Divider borderColor="#071018" />

        <VStack align="stretch" spacing={3}>
          <Text color="gray.500" fontSize="10px" fontWeight="black" textTransform="uppercase">
            Size (px)
          </Text>
          <HStack spacing={2}>
            <Text fontSize="xs" color="gray.400" flexShrink={0}>
              W
            </Text>
            <NumberInput
              size="xs"
              min={1}
              value={selectedType.defaultSize?.[0] ?? 16}
              precision={0}
              onChange={(_, val) => {
                if (!isNaN(val)) {
                  onPropertyChange('defaultSize', [
                    Math.round(val),
                    selectedType.defaultSize?.[1] ?? 16,
                  ]);
                }
              }}
              flex={1}
            >
              <NumberInputField bg="#0a0a0b" borderColor="#1a1a2e" color="white" />
            </NumberInput>
            <Text fontSize="xs" color="gray.400" flexShrink={0}>
              H
            </Text>
            <NumberInput
              size="xs"
              min={1}
              value={selectedType.defaultSize?.[1] ?? 16}
              precision={0}
              onChange={(_, val) => {
                if (!isNaN(val)) {
                  onPropertyChange('defaultSize', [
                    selectedType.defaultSize?.[0] ?? 16,
                    Math.round(val),
                  ]);
                }
              }}
              flex={1}
            >
              <NumberInputField bg="#0a0a0b" borderColor="#1a1a2e" color="white" />
            </NumberInput>
          </HStack>
        </VStack>

        <Divider borderColor="#071018" />

        <EntitySpriteEditor
          spritePath={selectedType.sprite?.path}
          onPathChange={(path) => onPropertyChange('sprite', path ? { path } : undefined)}
          onSizeChange={(size) => onPropertyChange('defaultSize', size)}
        />

        <Divider borderColor="#071018" />

        <PropertyDefinitionEditor
          properties={selectedType.properties}
          onChange={onPropertiesChange}
        />

        <Divider borderColor="#071018" />

        <Box>
          <Text
            color="gray.500"
            fontSize="10px"
            fontWeight="black"
            textTransform="uppercase"
            mb={2}
          >
            Actions
          </Text>
          <Button
            size="xs"
            colorScheme="red"
            variant="outline"
            leftIcon={<DeleteIcon fontSize="10px" />}
            onClick={onDelete}
          >
            Delete Entity Type
          </Button>
        </Box>
      </VStack>
    </Box>
  );
};

interface EntitySpriteEditorProps {
  spritePath: string | undefined;
  onPathChange: (path: string | undefined) => void;
  onSizeChange: (size: [number, number]) => void;
}

const EntitySpriteEditor: React.FC<EntitySpriteEditorProps> = ({
  spritePath,
  onPathChange,
  onSizeChange,
}) => {
  const [loading, setLoading] = useState(false);
  const loadSprite = useEditorStore((state) => state.loadSprite);
  const loadedSprites = useEditorStore((state) => state.loadedSprites);
  const isLoaded = spritePath ? loadedSprites.has(spritePath) : false;

  const handlePick = async () => {
    try {
      const absolutePath = await fileSystem.selectAsset();
      if (!absolutePath) return;
      // Copy asset into project assets folder and store relative path
      const blob = await fileSystem.readFileAsBlob(absolutePath);
      const filename = absolutePath.replace(/\\/g, '/').split('/').pop() || 'sprite.png';
      const relativePath = await fileSystem.saveAsset(filename, blob);
      onPathChange(relativePath);
      await loadImageFromPath(relativePath, blob);
    } catch (e) {
      console.error('Failed to pick sprite:', e);
    }
  };

  const loadImageFromPath = async (path: string, blobHint?: Blob) => {
    setLoading(true);
    try {
      const blob = blobHint ?? (await loadSpriteBlob(path));
      await loadSprite(path, blob);
      const img = useEditorStore.getState().loadedSprites.get(path);
      if (img) {
        onSizeChange([img.naturalWidth, img.naturalHeight]);
      }
    } catch (e) {
      console.error('Failed to load sprite:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleReload = async () => {
    if (!spritePath) return;
    await loadImageFromPath(spritePath);
  };

  const handleClear = () => {
    onPathChange(undefined);
  };

  return (
    <VStack align="stretch" spacing={3}>
      <Text color="gray.500" fontSize="10px" fontWeight="black" textTransform="uppercase">
        Sprite
      </Text>
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
                isLoading={loading}
                onClick={handleReload}
              />
            </Tooltip>
            <Button size="xs" variant="ghost" color="gray.400" onClick={handlePick}>
              Change
            </Button>
            <Button size="xs" variant="ghost" color="red.400" onClick={handleClear}>
              Remove
            </Button>
          </HStack>
        </VStack>
      ) : (
        <Button
          size="xs"
          variant="outline"
          colorScheme="gray"
          onClick={handlePick}
          isLoading={loading}
        >
          Pick Image…
        </Button>
      )}
    </VStack>
  );
};

export default EntityEditor;
