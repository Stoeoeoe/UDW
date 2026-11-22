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
} from '../../types/schema';
import { TileCollisionEditor } from './TileCollisionEditor';
import { FcSearch } from 'react-icons/fc';
import { InspectorEmptyState } from '../screens';
import { TilesetObjectsPanel } from './TilesetObjectsPanel';
import { MAX_NAVIGATION_COST, MIN_NAVIGATION_COST } from '../../lib/navigationCost';

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
        the actual ground line. Press 0-9 to set this value for the selected tile.
      </Text>
    </FormControl>
  );
};

interface NavigationCostFieldProps {
  currentCost: number | undefined;
  selectionCount: number;
  onCommit: (cost: number | undefined) => void;
}

/** Empty = not set (removes the key). Applies to every selected tile via onCommit. */
const NavigationCostField: React.FC<NavigationCostFieldProps> = ({
  currentCost,
  selectionCount,
  onCommit,
}) => {
  const [text, setText] = React.useState(() => (currentCost === undefined ? '' : String(currentCost)));

  const handleChange = (str: string) => {
    setText(str);
    if (str === '') {
      onCommit(undefined);
      return;
    }
    if (!/^\d+$/.test(str)) return;
    const cost = parseInt(str, 10);
    if (cost < MIN_NAVIGATION_COST || cost > MAX_NAVIGATION_COST) return;
    onCommit(cost);
  };

  return (
    <FormControl>
      <FormLabel>Navigation cost</FormLabel>
      <NumberInput
        value={text}
        min={MIN_NAVIGATION_COST}
        max={MAX_NAVIGATION_COST}
        step={1}
        precision={0}
        onChange={handleChange}
      >
        <NumberInputField placeholder="Not set" />
        <NumberInputStepper>
          <NumberIncrementStepper />
          <NumberDecrementStepper />
        </NumberInputStepper>
      </NumberInput>
      <Text fontSize="9px" color="gray.500" mt={2}>
        Empty: terrain tiles use 2, other layers don't override. Lower = preferred (1-100).
        {selectionCount > 1 ? ` Applies to all ${selectionCount} selected tiles.` : ''}
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
  const selectedIndex =
    typeof propSelectedIndex !== 'undefined' ? propSelectedIndex : storeSelectedIndex;
  const updateTileDef = useEditorStore((state) => state.updateTileDefinition);
  const setTilesNavigationCost = useEditorStore((state) => state.setTilesNavigationCost);
  const tileMetadataDefinitions = useEditorStore((state) => state.tileMetadataDefinitions);
  const loadedSprites = useEditorStore((state) => state.loadedSprites);
  const sprite = loadedSprites.get(tileset.spriteSheet);

  // Selection & terrain helpers
  const selectedTileDef: TileDefinition =
    selectedIndex !== null ? tileset.tiles[selectedIndex] || {} : {};

  // Multi-selection applies the cost to all selected tiles; otherwise just the inspected tile.
  const navigationCostTargets =
    selectedIndex !== null && selectedTileIndices.includes(selectedIndex)
      ? selectedTileIndices
      : selectedIndex !== null
        ? [selectedIndex]
        : [];

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

  if (tilesetMode === 'objects') return <TilesetObjectsPanel tileset={tileset} />;

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

          <NavigationCostField
            key={`navigationCost-${tileset.id}-${navigationCostTargets.join(',')}`}
            currentCost={selectedTileDef.navigationCost}
            selectionCount={navigationCostTargets.length}
            onCommit={(cost) => setTilesNavigationCost(tileset.id, navigationCostTargets, cost)}
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
