import React from 'react';
import {
  Text,
  VStack,
  Divider,
  Input,
  FormControl,
  FormLabel,
  HStack,
  NumberInput,
  NumberInputField,
} from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { TilesetInspector } from '../tileset/TilesetInspector';
import { PropertyForm, PropertySchema } from '../common/PropertyForm';
import { resolveEntities } from '../../lib/mapUtils';
import { InspectorPanel, InspectorEmptyState } from '../screens/common';

export const PropertiesPanel: React.FC = () => {
  const editorMode = useEditorStore((state) => state.mode);
  const selectedEntityId = useEditorStore((state) => state.selectedEntityId);
  const updateEntityProperties = useEditorStore((state) => state.updateEntityProperties);
  const entityTypes = useEditorStore((state) => state.entityTypes);
  const currentMap = useEditorStore((state) => state.currentMap);
  const activeVariationId = useEditorStore((state) => state.activeVariationId);
  const activeTilesetId = useEditorStore((state) => state.activeTilesetId);
  const tilesets = useEditorStore((state) => state.tilesets);

  // Contextual rendering for Tileset mode
  if (editorMode === 'tilesets') {
    const activeTileset = activeTilesetId ? tilesets.get(activeTilesetId) : null;
    if (activeTileset) {
      return <TilesetInspector tileset={activeTileset} />;
    }
    return (
      <InspectorPanel title="Tile Properties">
        <InspectorEmptyState
          icon="🎨"
          message="No Tileset Selected"
          hint="Select a tileset to inspect tiles"
        />
      </InspectorPanel>
    );
  }

  // Resolve entities for the current variation
  const resolvedEntities = currentMap ? resolveEntities(currentMap, activeVariationId) : [];
  const selectedEntity = resolvedEntities.find((e) => e.id === selectedEntityId);
  const entityType = selectedEntity
    ? entityTypes.find((t) => t.id === selectedEntity.typeId)
    : null;

  const moveEntity = useEditorStore((state) => state.moveEntity);
  const updateEntityLabel = useEditorStore((state) => state.updateEntityLabel);

  const handlePropertyChange = (key: string, value: any) => {
    if (selectedEntityId) {
      updateEntityProperties(selectedEntityId, { [key]: value });
    }
  };

  return (
    <InspectorPanel
      title={selectedEntity ? entityType?.displayName || 'Entity' : 'Selection'}
      emptyState={
        <InspectorEmptyState
          icon="🔍"
          message="No Object Selected"
          hint="Select an entity on the map to view and edit properties"
        />
      }
    >
      {selectedEntity && (
        <VStack align="stretch" spacing={5}>
          {/* Static Identity Section */}
          <VStack align="stretch" spacing={3}>
            <FormControl>
              <FormLabel
                color="gray.500"
                fontSize="10px"
                fontWeight="black"
                textTransform="uppercase"
                mb={1}
              >
                Core ID
              </FormLabel>
              <Input
                size="xs"
                variant="filled"
                bg="#0a0a0b"
                value={selectedEntity.id}
                isReadOnly
                fontFamily="mono"
                _hover={{ bg: '#071018' }}
              />
            </FormControl>

            <FormControl>
              <FormLabel
                color="gray.500"
                fontSize="10px"
                fontWeight="black"
                textTransform="uppercase"
                mb={1}
              >
                Entity Type
              </FormLabel>
              <Text fontSize="xs" color="blue.400" fontWeight="bold">
                {selectedEntity.typeId}
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
                Position
              </FormLabel>
              <HStack spacing={2}>
                <Text fontSize="xs" color="gray.400" flexShrink={0}>
                  X
                </Text>
                <NumberInput
                  size="xs"
                  value={selectedEntity.position[0]}
                  precision={0}
                  onChange={(_, val) => {
                    if (!isNaN(val) && selectedEntityId) {
                      moveEntity(selectedEntityId, [Math.round(val), selectedEntity.position[1]]);
                    }
                  }}
                  flex={1}
                >
                  <NumberInputField
                    bg="#0a0a0b"
                    borderColor="#1a1a2e"
                    color="white"
                    fontFamily="mono"
                    _hover={{ bg: '#071018' }}
                  />
                </NumberInput>
                <Text fontSize="xs" color="gray.400" flexShrink={0}>
                  Y
                </Text>
                <NumberInput
                  size="xs"
                  value={selectedEntity.position[1]}
                  precision={0}
                  onChange={(_, val) => {
                    if (!isNaN(val) && selectedEntityId) {
                      moveEntity(selectedEntityId, [selectedEntity.position[0], Math.round(val)]);
                    }
                  }}
                  flex={1}
                >
                  <NumberInputField
                    bg="#0a0a0b"
                    borderColor="#1a1a2e"
                    color="white"
                    fontFamily="mono"
                    _hover={{ bg: '#071018' }}
                  />
                </NumberInput>
              </HStack>
            </FormControl>

            <FormControl>
              <FormLabel
                color="gray.500"
                fontSize="10px"
                fontWeight="black"
                textTransform="uppercase"
                mb={1}
              >
                Label
              </FormLabel>
              <Input
                size="xs"
                variant="filled"
                bg="#0a0a0b"
                color="white"
                value={selectedEntity.label ?? ''}
                placeholder="Optional display label"
                onChange={(e) => {
                  if (selectedEntityId) {
                    updateEntityLabel(selectedEntityId, e.target.value || undefined);
                  }
                }}
                _hover={{ bg: '#071018' }}
              />
            </FormControl>
          </VStack>

          <Divider borderColor="#071018" />

          {/* Dynamic Properties Section */}
          <VStack align="stretch" spacing={4}>
            <Text color="gray.500" fontSize="10px" fontWeight="black" textTransform="uppercase">
              Behavior Properties
            </Text>

            {entityType?.properties && (
              <PropertyForm
                schema={entityType.properties as any as PropertySchema[]}
                values={selectedEntity?.properties || {}}
                onChange={(k, v) => handlePropertyChange(k, v)}
              />
            )}

            {(!entityType || entityType.properties.length === 0) && (
              <Text fontSize="xs" color="gray.600" fontStyle="italic">
                No configurable properties
              </Text>
            )}
          </VStack>
        </VStack>
      )}
    </InspectorPanel>
  );
};
