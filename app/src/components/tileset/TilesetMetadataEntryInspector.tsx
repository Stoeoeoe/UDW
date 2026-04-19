import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  HStack,
  Input,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Switch,
  Text,
  VStack,
} from '@chakra-ui/react';
import { PropertyDefinition, PropertyValue, TileDefinition, Tileset } from '../../types/schema';
import { PropertyForm, PropertySchema } from '../common/PropertyForm';
import { useEditorStore } from '../../store/useEditorStore';
import { CompactNumberInput } from '../common/Fields';
import { FieldLabel, SectionLabel } from '../common/Typography.tsx';

interface TilesetMetadataEntryInspectorProps {
  tileset: Tileset;
  selectedTileIndex: number | null;
  metadataDefinition: PropertyDefinition;
  metadataDefinitions: PropertyDefinition[];
  onMetadataDefinitionsChange: (definitions: PropertyDefinition[]) => Promise<void>;
}

function normalizeValue(definition: PropertyDefinition, value: PropertyValue): PropertyValue {
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

function buildSingleFieldSchema(definition: PropertyDefinition): PropertySchema[] {
  if (definition.type === 'int') {
    return [
      {
        key: definition.key,
        label: definition.label,
        description: definition.description,
        type: 'custom',
        customRenderer: (value: PropertyValue, onChange: (v: PropertyValue) => void) => {
          const numericValue = Number(value);
          const safeValue = Number.isFinite(numericValue) ? Math.round(numericValue) : 0;
          return (
            <CompactNumberInput
              value={safeValue}
              step={1}
              precision={0}
              min={definition.constraints?.min}
              max={definition.constraints?.max}
              onChange={(_, num) => {
                onChange(Number.isNaN(num) ? 0 : Math.round(num));
              }}
            >
              <NumberInputStepper>
                <NumberIncrementStepper />
                <NumberDecrementStepper />
              </NumberInputStepper>
            </CompactNumberInput>
          );
        },
      },
    ];
  }

  if (definition.type === 'float' || definition.type === 'number') {
    return [
      {
        key: definition.key,
        label: definition.label,
        description: definition.description,
        type: 'float',
        constraints: {
          min: definition.constraints?.min,
          max: definition.constraints?.max,
          step: 0.01,
        },
      },
    ];
  }

  if (definition.type === 'boolean') {
    return [
      {
        key: definition.key,
        label: definition.label,
        description: definition.description,
        type: 'boolean',
      },
    ];
  }

  if (definition.type === 'enum') {
    return [
      {
        key: definition.key,
        label: definition.label,
        description: definition.description,
        type: 'enum',
        constraints: {
          options: definition.constraints?.options || [],
        },
      },
    ];
  }

  return [
    {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      type: 'string',
    },
  ];
}

export const TilesetMetadataEntryInspector: React.FC<TilesetMetadataEntryInspectorProps> = ({
  tileset,
  selectedTileIndex,
  metadataDefinition,
  metadataDefinitions,
  onMetadataDefinitionsChange,
}) => {
  const updateTileDef = useEditorStore((state) => state.updateTileDefinition);
  const [isSavingDefinition, setIsSavingDefinition] = useState(false);

  const selectedTileDef: TileDefinition =
    selectedTileIndex !== null ? tileset.tiles[selectedTileIndex] || {} : {};

  const tilePropertyValue = useMemo(() => {
    if (selectedTileIndex === null) return metadataDefinition.defaultValue;
    const property = (selectedTileDef.properties || []).find(
      (entry) => entry.key === metadataDefinition.key,
    );
    return property ? property.value : metadataDefinition.defaultValue;
  }, [
    metadataDefinition.defaultValue,
    metadataDefinition.key,
    selectedTileDef.properties,
    selectedTileIndex,
  ]);

  const handleTileValueChange = (value: PropertyValue) => {
    if (selectedTileIndex === null) return;

    const normalized = normalizeValue(metadataDefinition, value);
    const nextProperties = [...(selectedTileDef.properties || [])];
    const propertyIndex = nextProperties.findIndex((entry) => entry.key === metadataDefinition.key);

    if (propertyIndex >= 0) {
      nextProperties[propertyIndex] = { key: metadataDefinition.key, value: normalized };
    } else {
      nextProperties.push({ key: metadataDefinition.key, value: normalized });
    }

    updateTileDef(tileset.id, selectedTileIndex, {
      ...selectedTileDef,
      properties: nextProperties,
    });
  };

  const clearTileOverride = () => {
    if (selectedTileIndex === null) return;
    const nextProperties = (selectedTileDef.properties || []).filter(
      (entry) => entry.key !== metadataDefinition.key,
    );

    updateTileDef(tileset.id, selectedTileIndex, {
      ...selectedTileDef,
      properties: nextProperties,
    });
  };

  const saveDefinition = async (updates: Partial<PropertyDefinition>) => {
    setIsSavingDefinition(true);
    try {
      const nextDefinitions = metadataDefinitions.map((definition) =>
        definition.key === metadataDefinition.key
          ? {
              ...definition,
              ...updates,
            }
          : definition,
      );
      await onMetadataDefinitionsChange(nextDefinitions);
    } finally {
      setIsSavingDefinition(false);
    }
  };

  return (
    <VStack align="stretch" spacing={5} p={6}>
      <VStack align="start" spacing={1}>
        <SectionLabel>Metadata Entry</SectionLabel>
        <Text fontSize="2xl" fontWeight="black" color="editorText" lineHeight={1.2}>
          {metadataDefinition.label}
        </Text>
        <Text fontSize="10px" color="gray.600" fontFamily="mono">
          {metadataDefinition.key}
        </Text>
      </VStack>

      <FormControl>
        <FieldLabel>Label</FieldLabel>
        <Input
          size="xs"
          value={metadataDefinition.label}
          onChange={(event) => {
            void saveDefinition({ label: event.target.value || metadataDefinition.key });
          }}
          isDisabled={isSavingDefinition}
        />
      </FormControl>

      <HStack spacing={3}>
        <FormControl>
          <FieldLabel>Type</FieldLabel>
          <Input size="xs" variant="readOnly" value={metadataDefinition.type} isReadOnly />
        </FormControl>

        <FormControl>
          <FieldLabel>Required</FieldLabel>
          <Switch
            size="sm"
            isChecked={metadataDefinition.required}
            onChange={(event) => {
              void saveDefinition({ required: event.target.checked });
            }}
            isDisabled={isSavingDefinition}
          />
        </FormControl>
      </HStack>

      {metadataDefinition.type === 'enum' && (
        <FormControl>
          <FieldLabel>Enum Options</FieldLabel>
          <Input
            size="xs"
            placeholder="comma,separated,values"
            value={(metadataDefinition.constraints?.options || []).join(', ')}
            onChange={(event) => {
              const options = event.target.value
                .split(',')
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0);
              void saveDefinition({
                constraints: {
                  ...(metadataDefinition.constraints || {}),
                  options,
                },
              });
            }}
            isDisabled={isSavingDefinition}
          />
        </FormControl>
      )}

      <FormControl>
        <FieldLabel>Description</FieldLabel>
        <Input
          size="xs"
          value={metadataDefinition.description || ''}
          onChange={(event) => {
            void saveDefinition({ description: event.target.value || undefined });
          }}
          isDisabled={isSavingDefinition}
        />
      </FormControl>

      <Box borderTop="1px" borderColor="editorShellBorder" pt={4}>
        <SectionLabel mb={2}>Tile Assignment</SectionLabel>

        {selectedTileIndex === null ? (
          <Text fontSize="xs" color="gray.500">
            Select a tile on the canvas to set this metadata value.
          </Text>
        ) : (
          <VStack align="stretch" spacing={3}>
            <Text fontSize="xs" color="gray.400">
              Editing tile #{selectedTileIndex}
            </Text>
            <PropertyForm
              schema={buildSingleFieldSchema(metadataDefinition)}
              values={{
                [metadataDefinition.key]: tilePropertyValue,
              }}
              onChange={(_, value) => handleTileValueChange(value)}
            />
            <HStack justify="flex-end">
              <Button size="xs" variant="ghost" color="gray.400" onClick={clearTileOverride}>
                Use Default Value
              </Button>
            </HStack>
          </VStack>
        )}
      </Box>
    </VStack>
  );
};

export default TilesetMetadataEntryInspector;
