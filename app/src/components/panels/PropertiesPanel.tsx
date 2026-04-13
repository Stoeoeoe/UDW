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
import { FcPicture, FcSearch } from 'react-icons/fc';
import { useEditorStore } from '../../store/useEditorStore';
import { TilesetInspector } from '../tileset/TilesetInspector';
import { PropertyForm, propertyDefinitionsToSchema } from '../common/PropertyForm';
import { resolveEntities } from '../../lib/mapUtils';
import { InspectorPanel, InspectorEmptyState } from '../screens/common';
import type { PropertyValue } from '../../types/schema';

export const PropertiesPanel: React.FC = () => {
  const editorMode = useEditorStore((state) => state.mode);
  const selectedEntityId = useEditorStore((state) => state.selectedEntityId);
  const updateEntityProperties = useEditorStore((state) => state.updateEntityProperties);
  const entityTypes = useEditorStore((state) => state.entityTypes);
  const currentMap = useEditorStore((state) => state.currentMap);
  const activeVariationId = useEditorStore((state) => state.activeVariationId);
  const activeTilesetId = useEditorStore((state) => state.activeTilesetId);
  const tilesets = useEditorStore((state) => state.tilesets);
  const moveEntity = useEditorStore((state) => state.moveEntity);
  const updateEntityLabel = useEditorStore((state) => state.updateEntityLabel);
  const removeEntity = useEditorStore((state) => state.removeEntity);

  const [localPosition, setLocalPosition] = React.useState({ x: '', y: '' });
  const positionFocusRef = React.useRef({ x: false, y: false });

  // Resolve entities for the current variation
  const resolvedEntities = currentMap ? resolveEntities(currentMap, activeVariationId) : [];
  const selectedEntity = resolvedEntities.find((e) => e.id === selectedEntityId);
  const entityType = selectedEntity
    ? entityTypes.find((t) => t.id === selectedEntity.typeId)
    : null;

  React.useEffect(() => {
    if (!selectedEntity) {
      setLocalPosition({ x: '', y: '' });
      return;
    }

    setLocalPosition((prev) => ({
      x: positionFocusRef.current.x ? prev.x : String(selectedEntity.position[0]),
      y: positionFocusRef.current.y ? prev.y : String(selectedEntity.position[1]),
    }));
  }, [selectedEntity]);

  const handlePropertyChange = (key: string, value: unknown) => {
    if (selectedEntityId) {
      updateEntityProperties(selectedEntityId, { [key]: value as PropertyValue });
    }
  };

  const commitPosition = (axis: 'x' | 'y') => {
    if (!selectedEntityId || !selectedEntity) return;

    const rawValue = localPosition[axis].trim();
    const parsedValue = parseFloat(rawValue);

    if (rawValue === '' || Number.isNaN(parsedValue)) {
      setLocalPosition((prev) => ({
        ...prev,
        [axis]: String(axis === 'x' ? selectedEntity.position[0] : selectedEntity.position[1]),
      }));
      return;
    }

    if (axis === 'x') {
      moveEntity(selectedEntityId, [parsedValue, selectedEntity.position[1]]);
      return;
    }

    moveEntity(selectedEntityId, [selectedEntity.position[0], parsedValue]);
  };

  const handleDeleteSelectedEntity = () => {
    if (!selectedEntity) return;
    const label = selectedEntity.label || selectedEntity.id;
    if (!confirm(`Delete entity "${label}"?`)) return;
    removeEntity(selectedEntity.id);
  };

  // Contextual rendering for Tileset mode
  if (editorMode === 'tilesets') {
    const activeTileset = activeTilesetId ? tilesets.get(activeTilesetId) : null;
    if (activeTileset) {
      return <TilesetInspector tileset={activeTileset} />;
    }
    return (
      <InspectorPanel title="Tile Properties">
        <InspectorEmptyState
          icon={FcPicture}
          message="No Tileset Selected"
          hint="Select a tileset to inspect tiles"
        />
      </InspectorPanel>
    );
  }

  return (
    <InspectorPanel
      title={selectedEntity ? entityType?.displayName || 'Entity' : 'Selection'}
      subtitle={selectedEntity ? selectedEntity.id : undefined}
      emptyState={
        <InspectorEmptyState
          icon={FcSearch}
          message="No Object Selected"
          hint="Select an entity on the map to view and edit properties"
        />
      }
      onDelete={selectedEntity ? handleDeleteSelectedEntity : undefined}
      deleteLabel="Delete Entity"
    >
      {selectedEntity && (
        <VStack align="stretch" spacing={5}>
          {/* Static Identity Section */}
          <VStack align="stretch" spacing={3}>
            <FormControl>
              <FormLabel>Core ID</FormLabel>
              <Input value={selectedEntity.id} isReadOnly fontFamily="mono" />
            </FormControl>

            <FormControl>
              <FormLabel>Entity Type</FormLabel>
              <Text fontSize="xs" color="blue.400" fontWeight="bold">
                {selectedEntity.typeId}
              </Text>
            </FormControl>

            <FormControl>
              <FormLabel>Position</FormLabel>
              <HStack spacing={2}>
                <Text fontSize="xs" color="gray.400" flexShrink={0}>
                  X
                </Text>
                <NumberInput
                  value={localPosition.x}
                  step={0.01}
                  onChange={(str) => {
                    setLocalPosition((prev) => ({ ...prev, x: str }));
                  }}
                  onFocus={() => {
                    positionFocusRef.current.x = true;
                  }}
                  onBlur={() => {
                    positionFocusRef.current.x = false;
                    commitPosition('x');
                  }}
                  flex={1}
                >
                  <NumberInputField fontFamily="mono" />
                </NumberInput>
                <Text fontSize="xs" color="gray.400" flexShrink={0}>
                  Y
                </Text>
                <NumberInput
                  value={localPosition.y}
                  step={0.01}
                  onChange={(str) => {
                    setLocalPosition((prev) => ({ ...prev, y: str }));
                  }}
                  onFocus={() => {
                    positionFocusRef.current.y = true;
                  }}
                  onBlur={() => {
                    positionFocusRef.current.y = false;
                    commitPosition('y');
                  }}
                  flex={1}
                >
                  <NumberInputField fontFamily="mono" />
                </NumberInput>
              </HStack>
            </FormControl>

            <FormControl>
              <FormLabel>Label</FormLabel>
              <Input
                value={selectedEntity.label ?? ''}
                placeholder="Optional display label"
                onChange={(e) => {
                  if (selectedEntityId) {
                    updateEntityLabel(selectedEntityId, e.target.value || undefined);
                  }
                }}
              />
            </FormControl>
          </VStack>

          <Divider />

          {/* Dynamic Properties Section */}
          <VStack align="stretch" spacing={4}>
            <Text color="gray.500" fontSize="10px" fontWeight="black" textTransform="uppercase">
              Behavior Properties
            </Text>

            {entityType?.properties && (
              <PropertyForm
                schema={propertyDefinitionsToSchema(entityType.properties)}
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
