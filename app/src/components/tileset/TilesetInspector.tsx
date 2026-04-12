import React, { useMemo } from 'react';
import {
  VStack,
  HStack,
  Text,
  Box,
  Select,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
} from '@chakra-ui/react';
import { PropertyForm, PropertySchema } from '../common/PropertyForm';
import { useEditorStore } from '../../store/useEditorStore';
import { PropertyDefinition, PropertyValue, TileDefinition, Tileset } from '../../types/schema';
import { TileCollisionEditor } from './TileCollisionEditor';

interface TilesetInspectorProps {
  tileset: Tileset;
  selectedIndex?: number | null;
}

export const TilesetInspector: React.FC<TilesetInspectorProps> = ({
  tileset,
  selectedIndex: propSelectedIndex,
}) => {
  const storeSelectedIndex = useEditorStore((state) => state.selectedTileIndex);
  const selectedIndex =
    typeof propSelectedIndex !== 'undefined' ? propSelectedIndex : storeSelectedIndex;
  const updateTileDef = useEditorStore((state) => state.updateTileDefinition);
  const tileMetadataDefinitions = useEditorStore((state) => state.tileMetadataDefinitions);
  const loadedSprites = useEditorStore((state) => state.loadedSprites);
  const sprite = loadedSprites.get(tileset.spriteSheet);

  // Selection & terrain helpers
  const selectedTileDef: TileDefinition =
    selectedIndex !== null ? tileset.tiles[selectedIndex] || {} : {};

  const tileMetadataSchema = useMemo<PropertySchema[]>(
    () =>
      tileMetadataDefinitions.map((definition) => {
        const common = {
          key: definition.key,
          label: definition.label,
          description: definition.description,
        } satisfies Pick<PropertySchema, 'key' | 'label' | 'description'>;

        if (definition.type === 'int') {
          return {
            ...common,
            type: 'custom',
            customRenderer: (value: PropertyValue, onChange: (v: PropertyValue) => void) => {
              const numericValue = Number(value);
              const safeValue = Number.isFinite(numericValue) ? Math.round(numericValue) : 0;
              return (
                <NumberInput
                  size="sm"
                  value={safeValue}
                  step={1}
                  precision={0}
                  min={definition.constraints?.min}
                  max={definition.constraints?.max}
                  onChange={(_, num) => {
                    onChange(Number.isNaN(num) ? 0 : Math.round(num));
                  }}
                >
                  <NumberInputField bg="#05060a" borderColor="#0b1116" color="white" />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              );
            },
          };
        }

        if (definition.type === 'float' || definition.type === 'number') {
          return {
            ...common,
            type: 'float',
            constraints: {
              min: definition.constraints?.min,
              max: definition.constraints?.max,
              step: 0.01,
            },
          };
        }

        if (definition.type === 'boolean') {
          return {
            ...common,
            type: 'boolean',
          };
        }

        if (definition.type === 'enum') {
          return {
            ...common,
            type: 'enum',
            constraints: {
              options: definition.constraints?.options || [],
            },
          };
        }

        return {
          ...common,
          type: 'string',
        };
      }),
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

  return (
    <VStack align="stretch" spacing={6} p={6}>
      <VStack align="start" spacing={1} mb={2}>
        <Text
          fontSize="xs"
          fontWeight="black"
          color="gray.500"
          textTransform="uppercase"
          letterSpacing="widest"
        >
          Tile Properties
        </Text>
      </VStack>

      {selectedIndex === null ? (
        <VStack mt="10" spacing={2} textAlign="center" opacity={0.5}>
          <Text color="gray.500" fontSize="sm">
            No tile selected
          </Text>
          <Text fontSize="10px" color="gray.600">
            Click a tile in the viewer
          </Text>
        </VStack>
      ) : (
        <VStack align="stretch" spacing={5}>
          <VStack align="start" spacing={1}>
            <Text fontSize="2xl" fontWeight="black" color="white">
              #{selectedIndex}
            </Text>
            <Text fontSize="xs" color="gray.500" textTransform="uppercase">
              Atlas Index
            </Text>
          </VStack>

          <PropertyForm
            schema={
              [
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
                  customRenderer: (value: unknown, onChange: (v: unknown) => void) => {
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
                          borderColor="gray.700"
                        />
                        <Select
                          size="sm"
                          bg="#05060a"
                          borderColor="#0b1116"
                          color="white"
                          value={terrainValue}
                          onChange={(e) => onChange(e.target.value)}
                        >
                          <option value="">None</option>
                          {options.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </Select>
                      </HStack>
                    );
                  },
                },
              ] as PropertySchema[]
            }
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
            <Text fontSize="xs" fontWeight="black" color="gray.500" textTransform="uppercase">
              Metadata
            </Text>
            <Text fontSize="10px" color="gray.600">
              Project-level metadata fields can be assigned per tile.
            </Text>
          </VStack>

          {tileMetadataSchema.length === 0 ? (
            <Text fontSize="xs" color="gray.600">
              No metadata fields defined yet. Add fields from the Metadata group in the left panel.
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
