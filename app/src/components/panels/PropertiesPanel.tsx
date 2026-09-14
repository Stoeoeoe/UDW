import React from 'react';
import {
  Text,
  VStack,
  Divider,
  Input,
  FormControl,
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
import { FormLabel } from '../common/FormLabel';
import { SectionLabel } from '../common/Typography.tsx';

export const PropertiesPanel: React.FC = () => {
  const editorMode = useEditorStore((state) => state.mode);
  const selectedEntityId = useEditorStore((state) => state.selectedEntityId);
  const selectedObjectInstanceId = useEditorStore((state) => state.selectedObjectInstanceId);
  const updateEntityProperties = useEditorStore((state) => state.updateEntityProperties);
  const entityTypes = useEditorStore((state) => state.entityTypes);
  const currentMap = useEditorStore((state) => state.currentMap);
  const activeVariationId = useEditorStore((state) => state.activeVariationId);
  const activeTilesetId = useEditorStore((state) => state.activeTilesetId);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const tilesets = useEditorStore((state) => state.tilesets);
  const moveEntity = useEditorStore((state) => state.moveEntity);
  const updateEntityLabel = useEditorStore((state) => state.updateEntityLabel);
  const removeEntity = useEditorStore((state) => state.removeEntity);
  const moveObjectInstance = useEditorStore((state) => state.moveObjectInstance);
  const removeObjectInstance = useEditorStore((state) => state.removeObjectInstance);
  const selectObjectInstance = useEditorStore((state) => state.selectObjectInstance);

  const [localPosition, setLocalPosition] = React.useState({ x: '', y: '' });
  const positionFocusRef = React.useRef({ x: false, y: false });

  // Resolve entities for the current variation
  const resolvedEntities = currentMap ? resolveEntities(currentMap, activeVariationId) : [];
  const selectedEntity = resolvedEntities.find((e) => e.id === selectedEntityId);
  const entityType = selectedEntity
    ? entityTypes.find((t) => t.id === selectedEntity.typeId)
    : null;
  const selectedObjectLayer =
    currentMap?.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const selectedObjectInstance =
    selectedObjectLayer?.objectInstances?.find(
      (instance) => instance.id === selectedObjectInstanceId,
    ) ?? null;
  const selectedObjectTileset = selectedObjectInstance
    ? (tilesets.get(selectedObjectInstance.tilesetId) ?? null)
    : null;
  const selectedObjectDefinition =
    selectedObjectTileset?.objects?.find(
      (objectDefinition) => objectDefinition.id === selectedObjectInstance?.objectDefinitionId,
    ) ?? null;

  React.useEffect(() => {
    if (!selectedEntity && !selectedObjectInstance) {
      setLocalPosition({ x: '', y: '' });
      return;
    }

    setLocalPosition((prev) => ({
      x: positionFocusRef.current.x
        ? prev.x
        : String(selectedEntity ? selectedEntity.position[0] : selectedObjectInstance!.x),
      y: positionFocusRef.current.y
        ? prev.y
        : String(selectedEntity ? selectedEntity.position[1] : selectedObjectInstance!.y),
    }));
  }, [selectedEntity, selectedObjectInstance]);

  const handlePropertyChange = (key: string, value: unknown) => {
    if (selectedEntityId) {
      updateEntityProperties(selectedEntityId, { [key]: value as PropertyValue });
    }
  };

  const commitPosition = (axis: 'x' | 'y') => {
    if (!selectedEntity && !selectedObjectInstance) return;

    const rawValue = localPosition[axis].trim();
    const parsedValue = parseFloat(rawValue);

    if (rawValue === '' || Number.isNaN(parsedValue)) {
      setLocalPosition((prev) => ({
        ...prev,
        [axis]: String(
          axis === 'x'
            ? (selectedEntity?.position[0] ?? selectedObjectInstance?.x ?? 0)
            : (selectedEntity?.position[1] ?? selectedObjectInstance?.y ?? 0),
        ),
      }));
      return;
    }

    if (selectedEntityId && selectedEntity && axis === 'x') {
      moveEntity(selectedEntityId, [parsedValue, selectedEntity.position[1]]);
      return;
    }

    if (selectedEntityId && selectedEntity) {
      moveEntity(selectedEntityId, [selectedEntity.position[0], parsedValue]);
      return;
    }

    if (selectedObjectInstanceId && selectedObjectInstance && selectedLayerId) {
      const pixelValue = Math.round(parsedValue);
      if (axis === 'x') {
        moveObjectInstance(
          selectedLayerId,
          selectedObjectInstanceId,
          pixelValue,
          selectedObjectInstance.y,
        );
      } else {
        moveObjectInstance(
          selectedLayerId,
          selectedObjectInstanceId,
          selectedObjectInstance.x,
          pixelValue,
        );
      }
    }
  };

  const handleDeleteSelectedEntity = () => {
    if (!selectedEntity) return;
    const label = selectedEntity.label || selectedEntity.id;
    if (!confirm(`Delete entity "${label}"?`)) return;
    removeEntity(selectedEntity.id);
  };

  const handleDeleteSelectedObject = () => {
    if (!selectedObjectInstance || !selectedLayerId) return;
    const label = selectedObjectDefinition?.name || selectedObjectInstance.objectDefinitionId;
    if (!confirm(`Delete object "${label}"?`)) return;
    removeObjectInstance(selectedLayerId, selectedObjectInstance.id);
    selectObjectInstance(null);
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
      title={
        selectedEntity
          ? entityType?.displayName || 'Entity'
          : selectedObjectInstance
            ? selectedObjectDefinition?.name || 'Object'
            : 'Selection'
      }
      subtitle={selectedEntity?.id ?? selectedObjectInstance?.id ?? undefined}
      emptyState={
        <InspectorEmptyState
          icon={FcSearch}
          message="No Object Selected"
          hint="Select an entity or object on the map to view and edit properties"
        />
      }
      onDelete={
        selectedEntity
          ? handleDeleteSelectedEntity
          : selectedObjectInstance
            ? handleDeleteSelectedObject
            : undefined
      }
      deleteLabel={selectedObjectInstance ? 'Delete Object' : 'Delete Entity'}
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
            <SectionLabel textStyle="fieldLabel">Behavior Properties</SectionLabel>

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

      {selectedObjectInstance && (
        <VStack align="stretch" spacing={5}>
          <VStack align="stretch" spacing={3}>
            <FormControl>
              <FormLabel>Instance ID</FormLabel>
              <Input value={selectedObjectInstance.id} isReadOnly fontFamily="mono" />
            </FormControl>

            <FormControl>
              <FormLabel>Object ID</FormLabel>
              <Input
                value={selectedObjectDefinition?.id ?? selectedObjectInstance.objectDefinitionId}
                isReadOnly
                fontFamily="mono"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Label</FormLabel>
              <Input value={selectedObjectDefinition?.name ?? 'Unnamed Object'} isReadOnly />
            </FormControl>

            <FormControl>
              <FormLabel>Position</FormLabel>
              <HStack spacing={2}>
                <Text fontSize="xs" color="gray.400" flexShrink={0}>
                  X
                </Text>
                <NumberInput
                  value={localPosition.x}
                  step={1}
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
                  step={1}
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
              <FormLabel>Tileset</FormLabel>
              <Input
                value={selectedObjectTileset?.name ?? selectedObjectInstance.tilesetId}
                isReadOnly
              />
            </FormControl>
          </VStack>

          <Divider />

          <VStack align="stretch" spacing={4}>
            <SectionLabel textStyle="fieldLabel">Object Summary</SectionLabel>
            <Text fontSize="xs" color="gray.400">
              Tiles: {selectedObjectDefinition?.tiles.length ?? 0}
            </Text>
          </VStack>
        </VStack>
      )}
    </InspectorPanel>
  );
};
