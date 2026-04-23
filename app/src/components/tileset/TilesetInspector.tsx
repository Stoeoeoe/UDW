import React, { useMemo } from 'react';
import {
  VStack,
  HStack,
  Text,
  Box,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  FormControl,
  Input,
  Button,
  useToast,
  useDisclosure,
  Box as ChakraBox,
} from '@chakra-ui/react';
import { FormLabel } from '../common/FormLabel';
import { CompactSelect } from '../common/Fields';
import { PropertyForm, propertyDefinitionsToSchema } from '../common/PropertyForm';
import { SectionLabel } from '../common/Typography.tsx';
import { useEditorStore } from '../../store/useEditorStore';
import {
  PropertyDefinition,
  PropertyValue,
  TileDefinition,
  Tileset,
  TilesetObjectTile,
} from '../../types/schema';
import { TileCollisionEditor } from './TileCollisionEditor';
import { FcSearch } from 'react-icons/fc';
import { InspectorEmptyState } from '../screens';
import { EditorModal } from '../common/EditorModal';
import {
  buildObjectDefinitionFromTileSelection,
  getTileIndicesForObjectDefinition,
} from '../../lib/tilesetObjects';
import { saveMapDebounced } from '../../lib/saveManager';

interface TilesetInspectorProps {
  tileset: Tileset;
  selectedIndex?: number | null;
}

interface PivotYFieldProps {
  tilesetId: string;
  tileIndex: number;
  currentPivotY: number | undefined;
  currentTileDef: TileDefinition;
  updateTileDef: (tilesetId: string, index: number, definition: TileDefinition) => void;
}

const PivotYField: React.FC<PivotYFieldProps> = ({
  tilesetId,
  tileIndex,
  currentPivotY,
  currentTileDef,
  updateTileDef,
}) => {
  const [text, setText] = React.useState(() => String(currentPivotY ?? 1));
  const tileDefRef = React.useRef(currentTileDef);
  tileDefRef.current = currentTileDef;

  const integerRegex = /^-?\d+$/;

  const handleChange = (str: string) => {
    setText(str);
    if (!integerRegex.test(str)) return;
    const numeric = parseInt(str, 10);
    const clamped = Math.max(0, numeric);
    if (clamped === (tileDefRef.current.pivotY ?? 1)) return;
    updateTileDef(tilesetId, tileIndex, {
      ...tileDefRef.current,
      pivotY: clamped,
    });
  };

  const handleBlur = () => {
    const numeric = parseInt(text, 10);
    const clamped = Number.isFinite(numeric) ? Math.max(0, numeric) : 1;
    setText(String(clamped));
    if (clamped === (tileDefRef.current.pivotY ?? 1)) return;
    updateTileDef(tilesetId, tileIndex, {
      ...tileDefRef.current,
      pivotY: clamped,
    });
  };

  return (
    <FormControl>
      <FormLabel>Sort Pivot Y</FormLabel>
      <NumberInput
        value={text}
        min={0}
        step={1}
        precision={0}
        onChange={handleChange}
        onBlur={handleBlur}
      >
        <NumberInputField />
        <NumberInputStepper>
          <NumberIncrementStepper />
          <NumberDecrementStepper />
        </NumberInputStepper>
      </NumberInput>
      <Text fontSize="9px" color="gray.500" mt={2}>
        Tile-heights from this tile to the ground contact point. 1 = ground tile (bottom of sprite).
        For tiles above the ground (e.g. tree crown 3 rows up): set to 3 so the sort depth lands at
        the actual ground line.
      </Text>
    </FormControl>
  );
};

export const TilesetInspector: React.FC<TilesetInspectorProps> = ({
  tileset,
  selectedIndex: propSelectedIndex,
}) => {
  const tilesetMode = useEditorStore((state) => state.tilesetToolMode);
  const storeSelectedIndex = useEditorStore((state) => state.selectedTileIndex);
  const selectedTileIndices = useEditorStore((state) => state.selectedTileIndices);
  const selectedObjectDefinitionId = useEditorStore((state) => state.selectedObjectDefinitionId);
  const setSelectedObjectDefinition = useEditorStore((state) => state.setSelectedObjectDefinition);
  const setSelectedTiles = useEditorStore((state) => state.setSelectedTiles);
  const selectedIndex =
    typeof propSelectedIndex !== 'undefined' ? propSelectedIndex : storeSelectedIndex;
  const updateTileDef = useEditorStore((state) => state.updateTileDefinition);
  const updateTileset = useEditorStore((state) => state.updateTileset);
  const maps = useEditorStore((state) => state.maps);
  const tileMetadataDefinitions = useEditorStore((state) => state.tileMetadataDefinitions);
  const loadedSprites = useEditorStore((state) => state.loadedSprites);
  const sprite = loadedSprites.get(tileset.spriteSheet);
  const toast = useToast();

  const selectedObject = useMemo(
    () =>
      (tileset.objects ?? []).find(
        (objectDefinition) => objectDefinition.id === selectedObjectDefinitionId,
      ) ?? null,
    [tileset.objects, selectedObjectDefinitionId],
  );
  const [draftObjectName, setDraftObjectName] = React.useState(selectedObject?.name ?? '');
  const [draftObjectId, setDraftObjectId] = React.useState(selectedObject?.id ?? '');
  const createObjectModal = useDisclosure();

  React.useEffect(() => {
    setDraftObjectName(selectedObject?.name ?? '');
    setDraftObjectId(selectedObject?.id ?? '');
    if (selectedObject) {
      createObjectModal.onClose();
    }
  }, [selectedObject?.id, selectedObject?.name]);

  // Selection & terrain helpers
  const selectedTileDef: TileDefinition =
    selectedIndex !== null ? tileset.tiles[selectedIndex] || {} : {};

  const tileMetadataSchema = useMemo(
    () => propertyDefinitionsToSchema(tileMetadataDefinitions),
    [tileMetadataDefinitions],
  );

  const tileMetadataValues = useMemo<Record<string, PropertyValue>>(() => {
    const existingValues = new Map(
      (selectedTileDef.properties || []).map((property) => [property.key, property.value] as const),
    );
    const nextValues: Record<string, PropertyValue> = {};

    for (const definition of tileMetadataDefinitions) {
      if (existingValues.has(definition.key)) {
        nextValues[definition.key] = existingValues.get(definition.key)!;
      } else {
        nextValues[definition.key] = definition.defaultValue;
      }
    }

    return nextValues;
  }, [selectedTileDef.properties, tileMetadataDefinitions]);

  const handleTileMetadataChange = (key: string, value: PropertyValue) => {
    if (selectedIndex === null) return;
    const definition = tileMetadataDefinitions.find((entry) => entry.key === key);
    if (!definition) return;

    const normalizedValue = normalizeMetadataValue(definition, value);
    const nextProperties = [...(selectedTileDef.properties || [])];
    const existingIndex = nextProperties.findIndex((property) => property.key === key);

    if (existingIndex >= 0) {
      nextProperties[existingIndex] = { key, value: normalizedValue };
    } else {
      nextProperties.push({ key, value: normalizedValue });
    }

    updateTileDef(tileset.id, selectedIndex, {
      ...selectedTileDef,
      properties: nextProperties,
    });
  };

  const normalizeObjectId = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '');

  const syncObjectReferencesInMaps = React.useCallback(
    (oldObjectId: string, newObjectId: string | null) => {
      if (oldObjectId === newObjectId) return;

      const updatedMaps = maps.map((map) => {
        let mapChanged = false;

        const nextLayers = map.layers.map((layer) => {
          const objectInstances = layer.objectInstances ?? [];
          let layerChanged = false;

          const nextObjectInstances =
            newObjectId === null
              ? objectInstances.filter((instance) => {
                  const shouldRemove =
                    instance.tilesetId === tileset.id &&
                    instance.objectDefinitionId === oldObjectId;
                  layerChanged ||= shouldRemove;
                  return !shouldRemove;
                })
              : objectInstances.map((instance) => {
                  if (
                    instance.tilesetId === tileset.id &&
                    instance.objectDefinitionId === oldObjectId
                  ) {
                    layerChanged = true;
                    return { ...instance, objectDefinitionId: newObjectId };
                  }
                  return instance;
                });

          mapChanged ||= layerChanged;
          return layerChanged ? { ...layer, objectInstances: nextObjectInstances } : layer;
        });

        return mapChanged ? { ...map, layers: nextLayers } : map;
      });

      useEditorStore.setState((state) => {
        state.maps = updatedMaps;
        if (state.currentMap) {
          const nextCurrentMap = updatedMaps.find((map) => map.id === state.currentMap?.id);
          if (nextCurrentMap) state.currentMap = nextCurrentMap;
        }
      });

      for (const updatedMap of updatedMaps) {
        const originalMap = maps.find((map) => map.id === updatedMap.id);
        if (originalMap !== updatedMap) saveMapDebounced(updatedMap);
      }
    },
    [maps, tileset.id],
  );

  const selectedObjectReferenceMaps = useMemo(() => {
    if (!selectedObject) return [];
    return maps.filter((map) =>
      map.layers.some((layer) =>
        (layer.objectInstances ?? []).some(
          (instance) =>
            instance.tilesetId === tileset.id && instance.objectDefinitionId === selectedObject.id,
        ),
      ),
    );
  }, [maps, selectedObject, tileset.id]);

  const updateSelectedObjectDefinition = async (
    updates: Partial<{ id: string; name: string; tiles: TilesetObjectTile[] }>,
  ) => {
    if (!selectedObject) return false;

    const nextId = updates.id ?? selectedObject.id;
    const nextName = updates.name ?? selectedObject.name;
    const nextTiles = updates.tiles ?? selectedObject.tiles;

    const duplicate = (tileset.objects ?? []).find(
      (entry) => entry.id === nextId && entry.id !== selectedObject.id,
    );
    if (duplicate) {
      toast({
        title: 'Object ID already exists',
        description: `Choose a different ID than "${nextId}".`,
        status: 'warning',
      });
      return false;
    }

    await updateTileset(tileset.id, {
      objects: (tileset.objects ?? []).map((entry) =>
        entry.id === selectedObject.id
          ? {
              ...entry,
              id: nextId,
              name: nextName,
              tiles: nextTiles,
            }
          : entry,
      ),
    });

    if (selectedObject.id !== nextId) {
      syncObjectReferencesInMaps(selectedObject.id, nextId);
    }

    setSelectedObjectDefinition(nextId);
    setSelectedTiles(
      getTileIndicesForObjectDefinition(
        { ...selectedObject, id: nextId, name: nextName, tiles: nextTiles },
        tileset,
      ),
    );
    return true;
  };

  const saveObjectFromSelection = async (mode: 'create' | 'update') => {
    const trimmedName = draftObjectName.trim();
    const nextId = normalizeObjectId(draftObjectId);
    if (!trimmedName || !nextId) {
      toast({
        title: 'Name and ID are required',
        description: 'Please enter both before creating or updating an object.',
        status: 'warning',
      });
      return;
    }

    if (mode === 'update' && selectedObject) {
      const objectDefinition = buildObjectDefinitionFromTileSelection(
        trimmedName,
        selectedTileIndices,
        tileset,
        selectedObject.id,
      );
      if (!objectDefinition) return;
      objectDefinition.id = nextId;
      objectDefinition.name = trimmedName;
      const updated = await updateSelectedObjectDefinition({
        id: objectDefinition.id,
        name: objectDefinition.name,
        tiles: objectDefinition.tiles,
      });
      if (!updated) return;
      setSelectedObjectDefinition(objectDefinition.id);
      setSelectedTiles(getTileIndicesForObjectDefinition(objectDefinition, tileset));
      return;
    }

    const duplicate = (tileset.objects ?? []).find((entry) => entry.id === nextId);
    if (duplicate) {
      toast({
        title: 'Object ID already exists',
        description: `Choose a different ID than "${nextId}".`,
        status: 'warning',
      });
      return;
    }

    const objectDefinition = buildObjectDefinitionFromTileSelection(
      trimmedName,
      selectedTileIndices,
      tileset,
    );
    if (!objectDefinition) return;

    objectDefinition.id = nextId;
    objectDefinition.name = trimmedName;

    await updateTileset(tileset.id, {
      objects: [...(tileset.objects ?? []), objectDefinition],
    });
    setSelectedObjectDefinition(objectDefinition.id);
    setSelectedTiles(getTileIndicesForObjectDefinition(objectDefinition, tileset));
    createObjectModal.onClose();
  };

  const saveSelectedObjectProperties = async () => {
    if (!selectedObject) return;
    const trimmedName = draftObjectName.trim();
    const nextId = normalizeObjectId(draftObjectId);
    if (!trimmedName || !nextId) {
      toast({
        title: 'Name and ID are required',
        description: 'Please enter both before saving object properties.',
        status: 'warning',
      });
      return;
    }

    const updated = await updateSelectedObjectDefinition({
      id: nextId,
      name: trimmedName,
    });
    if (!updated) return;

    toast({
      title: 'Object updated',
      status: 'success',
    });
  };

  const deleteSelectedObject = async () => {
    if (!selectedObject) return;
    const referenceMaps = selectedObjectReferenceMaps.length;
    const warning =
      referenceMaps > 0
        ? `Delete object "${selectedObject.name}" (${selectedObject.id}) and remove its placed instances from ${referenceMaps} map(s)?`
        : `Delete object "${selectedObject.name}" (${selectedObject.id})?`;
    if (!confirm(warning)) return;

    await updateTileset(tileset.id, {
      objects: (tileset.objects ?? []).filter((entry) => entry.id !== selectedObject.id),
    });
    syncObjectReferencesInMaps(selectedObject.id, null);
    setSelectedTiles([]);
    setSelectedObjectDefinition(null);
    toast({
      title: 'Object deleted',
      description:
        referenceMaps > 0 ? 'Placed instances were removed from affected maps.' : undefined,
      status: 'info',
    });
  };

  React.useEffect(() => {
    if (tilesetMode !== 'objects' || !selectedObject) return;

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tagName = target.tagName.toLowerCase();
      return (
        target.isContentEditable ||
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target.closest('[contenteditable="true"]') !== null
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      void deleteSelectedObject();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tilesetMode, selectedObject, deleteSelectedObject]);

  if (tilesetMode === 'objects') {
    return (
      <>
        <VStack align="stretch" spacing={6} p={6}>
          <VStack align="start" spacing={1} mb={2}>
            <SectionLabel textStyle="panelLabel">Object Properties</SectionLabel>
          </VStack>

          {selectedObject ? (
            <VStack align="stretch" spacing={5}>
              <VStack align="start" spacing={1}>
                <Text fontSize="2xl" fontWeight="black" color="white">
                  {selectedObject.name}
                </Text>
                <SectionLabel fontWeight="normal">{selectedObject.id}</SectionLabel>
              </VStack>

              <FormControl>
                <FormLabel>Name</FormLabel>
                <Input
                  value={draftObjectName}
                  onChange={(e) => setDraftObjectName(e.target.value)}
                />
              </FormControl>

              <FormControl>
                <FormLabel>ID</FormLabel>
                <Input value={draftObjectId} onChange={(e) => setDraftObjectId(e.target.value)} />
                <Text fontSize="10px" color="gray.500" mt={2}>
                  Stable identifier used by map object instances and your Unity importer.
                </Text>
              </FormControl>

              <VStack align="start" spacing={1}>
                <Text fontSize="sm" fontWeight="bold" color="white">
                  {selectedObject.tiles.length} tiles
                </Text>
                <Text fontSize="10px" color="gray.500">
                  Edit the object by selecting a new tile region, then apply it to this object.
                </Text>
              </VStack>

              {selectedObjectReferenceMaps.length > 0 && (
                <Text fontSize="10px" color="orange.300">
                  Referenced in {selectedObjectReferenceMaps.length} map
                  {selectedObjectReferenceMaps.length === 1 ? '' : 's'}. Deleting it will remove
                  those placed instances.
                </Text>
              )}

              <HStack spacing={2}>
                <Button size="sm" colorScheme="blue" onClick={saveSelectedObjectProperties}>
                  Save Properties
                </Button>
                <Button
                  size="sm"
                  colorScheme="blue"
                  variant="outline"
                  onClick={() => saveObjectFromSelection('update')}
                  isDisabled={selectedTileIndices.length === 0}
                >
                  Apply Selected Tiles
                </Button>
                <Button size="sm" variant="ghost" colorScheme="red" onClick={deleteSelectedObject}>
                  Delete Object
                </Button>
              </HStack>
            </VStack>
          ) : selectedTileIndices.length === 0 ? (
            <InspectorEmptyState
              icon={FcSearch}
              message="No Object Selected"
              hint="Draw a rectangle to define a new object, or click an existing object to edit it"
            />
          ) : null}

          {!selectedObject && selectedTileIndices.length > 0 && (
            <Button size="sm" colorScheme="blue" onClick={createObjectModal.onOpen}>
              Create Object From Selection
            </Button>
          )}
        </VStack>

        <CreateObjectModal
          isOpen={createObjectModal.isOpen}
          onClose={createObjectModal.onClose}
          name={draftObjectName}
          id={draftObjectId}
          onNameChange={setDraftObjectName}
          onIdChange={setDraftObjectId}
          onCreate={() => void saveObjectFromSelection('create')}
          canCreate={
            selectedTileIndices.length > 0 &&
            draftObjectName.trim().length > 0 &&
            normalizeObjectId(draftObjectId).length > 0
          }
        />
      </>
    );
  }

  return (
    <VStack align="stretch" spacing={6} p={6}>
      <VStack align="start" spacing={1} mb={2}>
        <SectionLabel textStyle="panelLabel">Tile Properties</SectionLabel>
      </VStack>

      {selectedIndex === null ? (
        <InspectorEmptyState
          icon={FcSearch}
          message="No Tile Selected"
          hint="Select a tile on the map to view and edit properties"
        />
      ) : (
        <VStack align="stretch" spacing={5}>
          <VStack align="start" spacing={1}>
            <Text fontSize="2xl" fontWeight="black" color="white">
              #{selectedIndex}
            </Text>
            <SectionLabel fontWeight="normal">Atlas Index</SectionLabel>
          </VStack>

          <PropertyForm
            schema={[
              {
                key: 'id',
                label: 'Semantic ID',
                type: 'string',
                description: 'Human-friendly semantic identifier',
              },
              {
                key: 'probability',
                label: 'Probability',
                type: 'float',
                description: 'Weight for random tile selection (higher = more likely)',
              },
              {
                key: 'terrain',
                label: 'Terrain (Main)',
                type: 'custom',
                customRenderer: (value: PropertyValue, onChange: (v: PropertyValue) => void) => {
                  const options: {
                    id: string;
                    name: string;
                    color?: string;
                  }[] = [];
                  const terrainValue = typeof value === 'string' ? value : '';
                  if (tileset.wangSets) {
                    for (const ws of tileset.wangSets) {
                      for (const wc of ws.colors) {
                        options.push({
                          id: `${ws.id}:${wc.id}`,
                          name: `${ws.name} — ${wc.name}`,
                          color: wc.color,
                        });
                      }
                    }
                  }

                  return (
                    <HStack spacing={3} align="center">
                      <Box
                        w={3}
                        h={3}
                        rounded="full"
                        bg={options.find((o) => o.id === terrainValue)?.color || 'transparent'}
                        borderWidth={1}
                        borderColor="editorBorderLight"
                      />
                      <CompactSelect
                        size="sm"
                        value={terrainValue}
                        onChange={(e) => onChange(e.target.value)}
                      >
                        <option value="">None</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </CompactSelect>
                    </HStack>
                  );
                },
              },
            ]}
            values={{
              id: selectedTileDef.id || '',
              probability: selectedTileDef.probability ?? 1,
              terrain: selectedTileDef.terrain || '',
            }}
            onChange={(k, v) => {
              if (!tileset || selectedIndex === null) return;
              if (k === 'id')
                updateTileDef(tileset.id, selectedIndex, {
                  ...selectedTileDef,
                  id: v == null ? undefined : String(v),
                });
              if (k === 'probability')
                updateTileDef(tileset.id, selectedIndex, {
                  ...selectedTileDef,
                  probability: parseFloat(String(v)) || 1,
                });
              if (k === 'terrain')
                updateTileDef(tileset.id, selectedIndex, {
                  ...selectedTileDef,
                  terrain: v == null ? undefined : String(v),
                });
            }}
          />

          <PivotYField
            key={`pivotY-${tileset.id}-${selectedIndex}`}
            tilesetId={tileset.id}
            tileIndex={selectedIndex}
            currentPivotY={selectedTileDef.pivotY}
            currentTileDef={selectedTileDef}
            updateTileDef={updateTileDef}
          />

          <TileCollisionEditor
            tileIndex={selectedIndex}
            tilesetColumns={tileset.columns}
            sprite={sprite}
            collision={selectedTileDef.collision}
            onChange={(collision) => {
              if (!tileset || selectedIndex === null) return;
              updateTileDef(tileset.id, selectedIndex, {
                ...selectedTileDef,
                collision,
              });
            }}
          />

          <VStack align="start" spacing={1}>
            <SectionLabel>Metadata</SectionLabel>
            <Text fontSize="10px" color="gray.600">
              Project-level metadata fields can be assigned per tile.
            </Text>
          </VStack>

          {tileMetadataSchema.length === 0 ? (
            <Text fontSize="xs" color="gray.600">
              No metadata fields defined yet. Add fields from Map Settings in the Tile Metadata tab.
            </Text>
          ) : (
            <PropertyForm
              schema={tileMetadataSchema}
              values={tileMetadataValues}
              onChange={handleTileMetadataChange}
            />
          )}
        </VStack>
      )}
    </VStack>
  );
};

const CreateObjectModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  name: string;
  id: string;
  onNameChange: (value: string) => void;
  onIdChange: (value: string) => void;
  onCreate: () => void;
  canCreate: boolean;
}> = ({ isOpen, onClose, name, id, onNameChange, onIdChange, onCreate, canCreate }) => {
  return (
    <EditorModal isOpen={isOpen} onClose={onClose} size="sm">
      <ChakraBox
        bg="editorPanelBg"
        borderWidth="1px"
        borderColor="editorShellBorder"
        borderRadius="lg"
        p={5}
      >
        <VStack align="stretch" spacing={4}>
          <VStack align="start" spacing={1}>
            <SectionLabel textStyle="panelLabel">Create Object</SectionLabel>
            <Text fontSize="10px" color="gray.500">
              Give the selected tile region a label and stable ID.
            </Text>
          </VStack>

          <FormControl>
            <FormLabel>Name</FormLabel>
            <Input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Object name"
            />
          </FormControl>

          <FormControl>
            <FormLabel>ID</FormLabel>
            <Input
              value={id}
              onChange={(e) => onIdChange(e.target.value)}
              placeholder="object_id"
            />
          </FormControl>

          <HStack spacing={2} justify="end">
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" colorScheme="blue" onClick={onCreate} isDisabled={!canCreate}>
              Create
            </Button>
          </HStack>
        </VStack>
      </ChakraBox>
    </EditorModal>
  );
};

function normalizeMetadataValue(
  definition: PropertyDefinition,
  value: PropertyValue,
): PropertyValue {
  if (definition.type === 'boolean') {
    return Boolean(value);
  }

  if (definition.type === 'int') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric) : 0;
  }

  if (definition.type === 'float' || definition.type === 'number') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  if (definition.type === 'enum' || definition.type === 'string') {
    return value == null ? '' : String(value);
  }

  return value;
}
