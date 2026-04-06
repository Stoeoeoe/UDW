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
  Badge,
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
import { ListPanel, ListPanelItem, InspectorPanel, InspectorEmptyState } from '../common';
import { EntityType, PropertyDefinition, EntityCategory } from '../../../types/schema';
import { EditorModal } from '../../common/EditorModal';
import { CreateEntityTypeDialog } from './CreateEntityTypeDialog';
import { PropertyDefinitionEditor } from './PropertyDefinitionEditor';
import { EmptyScreen } from '../common/EmptyScreen';

const CATEGORIES: { value: EntityCategory; label: string; icon: string }[] = [
  { value: 'object', label: 'Object', icon: '📦' },
  { value: 'trigger', label: 'Trigger', icon: '⚡' },
  { value: 'spawn', label: 'Spawn', icon: '🎯' },
  { value: 'transition', label: 'Transition', icon: '🚪' },
  { value: 'decoration', label: 'Decoration', icon: '🌿' },
];

type EditableEntityTypeKey = keyof Pick<
  EntityType,
  'displayName' | 'category' | 'group' | 'icon' | 'placeholderColor'
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
      await deleteEntityType(selectedEntityTypeId);
    }
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
      items={entityItems}
      selectedId={selectedEntityTypeId}
      onSelect={setSelectedEntityType}
      onAdd={onOpen}
      autoSelectFirst={true}
      emptyMessage="No entity types defined"
    />
  );

  // Right panel: inspector for the selected entity type
  const rightPanel = (
    <InspectorPanel
      title={selectedType?.displayName || 'Entity'}
      subtitle={
        selectedType
          ? `${selectedType.category} • ${selectedType.properties.length} properties`
          : undefined
      }
      emptyState={
        <InspectorEmptyState
          icon="🎯"
          message="No Entity Selected"
          hint="Select an entity type to edit its definition"
        />
      }
    >
      {selectedType && (
        <VStack align="stretch" spacing={5}>
          {/* Identity */}
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
                onChange={(e) => handlePropertyChange('displayName', e.target.value)}
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
                  onChange={(e) => handlePropertyChange('category', e.target.value)}
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
                  onChange={(e) => handlePropertyChange('group', e.target.value || undefined)}
                  placeholder="Ungrouped"
                  list="inspector-entity-groups"
                  _hover={{ bg: '#071018' }}
                />
                {existingGroups.length > 0 && (
                  <datalist id="inspector-entity-groups">
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
                onChange={(e) => handlePropertyChange('description', e.target.value || undefined)}
                placeholder="Optional"
                _hover={{ bg: '#071018' }}
              />
            </FormControl>

            <HStack spacing={3}>
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
                <Text fontSize="lg">{selectedType.icon || '📦'}</Text>
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
                <Circle size="16px" bg={selectedType.placeholderColor} />
              </FormControl>
            </HStack>
          </VStack>

          <Divider borderColor="#071018" />

          {/* Size */}
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
                    handlePropertyChange('defaultSize', [
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
                    handlePropertyChange('defaultSize', [
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

          {/* Sprite */}
          <EntitySpriteEditor
            spritePath={selectedType.sprite?.path}
            onPathChange={(path) => handlePropertyChange('sprite', path ? { path } : undefined)}
            onSizeChange={(size) => handlePropertyChange('defaultSize', size)}
          />

          <Divider borderColor="#071018" />

          {/* Property Definitions */}
          <PropertyDefinitionEditor
            properties={selectedType.properties}
            onChange={handlePropertiesChange}
          />

          <Divider borderColor="#071018" />

          {/* Danger Zone */}
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
              Delete Entity Type
            </Button>
          </Box>
        </VStack>
      )}
    </InspectorPanel>
  );

  // Main content: summary view
  const content =
    entityTypes.length === 0 ? (
      <EmptyScreen
        icon="🎯"
        title="No Entity Types"
        description="Define entity blueprints that can be placed on maps. Entity types describe objects, NPCs, triggers, and other game elements."
        buttonLabel="Create First Entity"
        onCreate={onOpen}
      />
    ) : (
      <EntityTypeGrid
        entityTypes={entityTypes}
        selectedId={selectedEntityTypeId}
        onSelect={setSelectedEntityType}
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
        rightPanel={rightPanel}
        leftPanelDefaultSize={18}
        rightPanelDefaultSize={25}
      />

      <EditorModal isOpen={isOpen} onClose={onClose}>
        <CreateEntityTypeDialog onClose={onClose} />
      </EditorModal>
    </>
  );
};

/**
 * Grid view of entity types grouped by their group field
 */
const EntityTypeGrid: React.FC<{
  entityTypes: EntityType[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}> = ({ entityTypes, selectedId, onSelect }) => {
  const grouped = useMemo(() => {
    const groups: Record<string, EntityType[]> = {};
    for (const et of entityTypes) {
      const groupName = et.group || 'Ungrouped';
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(et);
    }
    return groups;
  }, [entityTypes]);

  const groupNames = Object.keys(grouped).sort((a, b) => {
    if (a === 'Ungrouped') return 1;
    if (b === 'Ungrouped') return -1;
    return a.localeCompare(b);
  });

  return (
    <Box p={6} overflowY="auto" h="full">
      <VStack spacing={6} align="stretch" maxW="800px" mx="auto">
        {groupNames.map((groupName) => (
          <Box key={groupName}>
            <HStack spacing={2} mb={3}>
              <Text
                fontSize="xs"
                fontWeight="black"
                textTransform="uppercase"
                letterSpacing="wider"
                color="gray.500"
              >
                {groupName}
              </Text>
              <Badge fontSize="9px" colorScheme="gray" variant="subtle">
                {grouped[groupName].length}
              </Badge>
            </HStack>
            <Box display="grid" gridTemplateColumns="repeat(auto-fill, minmax(160px, 1fr))" gap={3}>
              {grouped[groupName].map((et) => (
                <Box
                  key={et.id}
                  p={3}
                  bg={selectedId === et.id ? 'blue.900' : '#0a0a0b'}
                  borderWidth="1px"
                  borderColor={selectedId === et.id ? 'blue.500' : '#1a1a2e'}
                  borderRadius="md"
                  cursor="pointer"
                  _hover={{
                    bg: selectedId === et.id ? 'blue.900' : '#0f0f1a',
                    borderColor: selectedId === et.id ? 'blue.500' : 'gray.600',
                  }}
                  transition="all 0.1s"
                  onClick={() => onSelect(et.id)}
                >
                  <VStack spacing={2} align="center">
                    <Box
                      w="36px"
                      h="36px"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      bg={et.placeholderColor}
                      borderRadius="md"
                      fontSize="lg"
                    >
                      {et.icon || '📦'}
                    </Box>
                    <VStack spacing={0}>
                      <Text
                        fontSize="xs"
                        fontWeight="bold"
                        color="white"
                        textAlign="center"
                        noOfLines={1}
                      >
                        {et.displayName}
                      </Text>
                      <Text fontSize="10px" color="gray.600" textAlign="center">
                        {et.category}
                      </Text>
                    </VStack>
                    {et.properties.length > 0 && (
                      <Text fontSize="9px" color="gray.600">
                        {et.properties.length} prop
                        {et.properties.length !== 1 ? 's' : ''}
                      </Text>
                    )}
                  </VStack>
                </Box>
              ))}
            </Box>
          </Box>
        ))}
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
