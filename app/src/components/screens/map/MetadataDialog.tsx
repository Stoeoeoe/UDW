import React from 'react';
import {
  Box,
  FormControl,
  Input,
  NumberInput,
  NumberInputField,
  Select,
  Switch,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import type { PropertyValue, WorldMapMetadata } from '../../../types/schema';
import { PropertyForm, propertyDefinitionsToSchema } from '../../common/PropertyForm';
import { EditorModal } from '../../common/EditorModal';
import { EntityFormDialog } from '../common/EntityFormDialog';
import { FormLabel } from '../../common/FormLabel';
import { SectionLabel } from '../../common/Typography.tsx';

interface MetadataDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'base' | 'variation';
}

type VariationOverrideKey = 'mapNameOverride' | 'baseTilesetIdOverride' | 'descriptionOverride';
type VariationMetadataValues = Record<string, string | undefined>;

export const MetadataDialog: React.FC<MetadataDialogProps> = ({ isOpen, onClose, initialTab }) => {
  const currentMap = useEditorStore((state) => state.currentMap);
  const activeVariationId = useEditorStore((state) => state.activeVariationId);
  const updateCurrentMap = useEditorStore((state) => state.updateCurrentMap);
  const updateVariation = useEditorStore((state) => state.updateVariation);
  const setActiveTileset = useEditorStore((state) => state.setActiveTileset);
  const tilesets = Array.from(useEditorStore((state) => state.tilesets).values());
  const locationMetadataDefinitions = useEditorStore((s) => s.locationMetadataDefinitions);

  const activeVariation = currentMap?.variations?.find((v) => v.id === activeVariationId) || null;
  const worldMetadata = currentMap?.metadata?.world || {};

  if (!currentMap) {
    return (
      <EditorModal isOpen={isOpen} onClose={onClose} size="sm">
        <EntityFormDialog
          title="Map Metadata"
          description="Select a map first to edit map or variation metadata."
          onCancel={onClose}
        >
          <Text fontSize="sm" color="gray.500">
            No map is currently open.
          </Text>
        </EntityFormDialog>
      </EditorModal>
    );
  }

  const updateMapMetadata = (key: 'description' | 'musicCue' | 'musicPreset' | 'ambience', value: string) => {
    updateCurrentMap({ metadata: { ...(currentMap.metadata || {}), [key]: value || undefined } });
  };

  const updateMapMetadataGeneric = (key: string, value: unknown) => {
    const next = {
      ...((currentMap.metadata || {}) as Record<string, PropertyValue>),
    } as Record<string, PropertyValue>;

    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value as PropertyValue;
    }

    updateCurrentMap({ metadata: Object.keys(next).length > 0 ? next : undefined });
  };

  const updateWorldMetadata = (updates: Partial<WorldMapMetadata>) => {
    const nextWorld = {
      ...(currentMap.metadata?.world || {}),
      ...updates,
    };

    Object.keys(nextWorld).forEach((key) => {
      if (nextWorld[key as keyof WorldMapMetadata] === undefined) {
        delete nextWorld[key as keyof WorldMapMetadata];
      }
    });

    updateCurrentMap({
      metadata: {
        ...(currentMap.metadata || {}),
        world: Object.keys(nextWorld).length > 0 ? nextWorld : undefined,
      },
    });
  };

  const updateVariationMetadata = (key: VariationOverrideKey, value: string) => {
    if (!activeVariation) return;
    const next = { ...((activeVariation.metadata || {}) as Record<string, PropertyValue>) };
    if (value.trim()) {
      next[key] = value;
    } else {
      delete next[key];
    }
    (['mapNameOverride', 'baseTilesetIdOverride', 'descriptionOverride'] as const).forEach((k) => {
      if (typeof next[k] === 'string' && !next[k].trim()) delete next[k];
    });
    updateVariation(activeVariation.id, {
      metadata: Object.keys(next).length > 0 ? next : undefined,
    });
  };

  const updateVariationMetadataGeneric = (key: string, value: unknown) => {
    if (!activeVariation) return;
    const next = { ...((activeVariation.metadata || {}) as Record<string, PropertyValue>) };
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value as PropertyValue;
    }
    updateVariation(activeVariation.id, {
      metadata: Object.keys(next).length > 0 ? next : undefined,
    });
  };

  const variationMetadata = (activeVariation?.metadata || {}) as VariationMetadataValues;
  const hasLocationDefs = (locationMetadataDefinitions || []).length > 0;

  const renderWorldSection = () => (
    <VStack
      spacing={4}
      align="stretch"
      borderWidth="1px"
      borderColor="whiteAlpha.100"
      borderRadius="lg"
      p={4}
    >
      <Box>
        <SectionLabel textStyle="panelLabel">World</SectionLabel>
        <Text fontSize="xs" color="gray.500" mt={1}>
          Control whether this map appears in the world overview and where it is placed.
        </Text>
      </Box>

      <FormControl display="flex" alignItems="center" justifyContent="space-between">
        <FormLabel mb={0}>Include In World View</FormLabel>
        <Switch
          isChecked={Boolean(worldMetadata.included)}
          onChange={(e) => updateWorldMetadata({ included: e.target.checked || undefined })}
        />
      </FormControl>

      <FormControl>
        <FormLabel>World Category</FormLabel>
        <Select
          value={worldMetadata.category || 'world'}
          onChange={(e) =>
            updateWorldMetadata({ category: e.target.value as WorldMapMetadata['category'] })
          }
        >
          <option value="world">World</option>
          <option value="indoor">Indoor</option>
          <option value="special">Special</option>
        </Select>
      </FormControl>

      <FormControl isDisabled={!worldMetadata.included}>
        <FormLabel>World Position X</FormLabel>
        <NumberInput
          value={worldMetadata.x ?? 0}
          onChange={(_, valueAsNumber) =>
            updateWorldMetadata({
              x: Number.isFinite(valueAsNumber) ? Math.round(valueAsNumber) : 0,
            })
          }
        >
          <NumberInputField />
        </NumberInput>
      </FormControl>

      <FormControl isDisabled={!worldMetadata.included}>
        <FormLabel>World Position Y</FormLabel>
        <NumberInput
          value={worldMetadata.y ?? 0}
          onChange={(_, valueAsNumber) =>
            updateWorldMetadata({
              y: Number.isFinite(valueAsNumber) ? Math.round(valueAsNumber) : 0,
            })
          }
        >
          <NumberInputField />
        </NumberInput>
      </FormControl>
    </VStack>
  );

  const isVariationTab = initialTab === 'variation' && !!activeVariation;
  const title = isVariationTab ? `Variation: ${activeVariation.displayName}` : 'Map Metadata';
  const description = isVariationTab
    ? 'Override map properties for this variation.'
    : 'Edit base map metadata.';

  return (
    <EditorModal isOpen={isOpen} onClose={onClose} size="xl">
      <EntityFormDialog
        title={title}
        description={description}
        onCancel={onClose}
        minWidth="560px"
        scrollable
      >
        {isVariationTab ? (
          hasLocationDefs ? (
            <PropertyForm
              schema={propertyDefinitionsToSchema(locationMetadataDefinitions)}
              values={(activeVariation.metadata || {}) as Record<string, PropertyValue>}
              onChange={(k, v) => updateVariationMetadataGeneric(k, v)}
            />
          ) : (
            <VStack spacing={4} align="stretch">
              <FormControl>
                <FormLabel>Variation Name</FormLabel>
                {activeVariation.kind === 'season' ? (
                  <Text fontSize="sm" color="gray.300">
                    {activeVariation.displayName} (season)
                  </Text>
                ) : (
                  <Input
                    value={activeVariation.displayName}
                    onChange={(e) =>
                      updateVariation(activeVariation.id, { displayName: e.target.value })
                    }
                  />
                )}
              </FormControl>

              <FormControl>
                <FormLabel>Tileset Suffix</FormLabel>
                <Input
                  value={activeVariation.tilesetSuffix || ''}
                  placeholder="_winter"
                  onChange={(e) =>
                    updateVariation(activeVariation.id, {
                      tilesetSuffix: e.target.value || undefined,
                    })
                  }
                />
              </FormControl>

              <FormControl>
                <FormLabel>Override Map Name</FormLabel>
                <Input
                  value={variationMetadata.mapNameOverride || ''}
                  placeholder={currentMap.name}
                  onChange={(e) => updateVariationMetadata('mapNameOverride', e.target.value)}
                />
              </FormControl>

              <FormControl>
                <FormLabel>Override Base Tileset</FormLabel>
                <Select
                  value={variationMetadata.baseTilesetIdOverride || ''}
                  onChange={(e) => {
                    updateVariationMetadata('baseTilesetIdOverride', e.target.value);
                    if (e.target.value) setActiveTileset(e.target.value);
                  }}
                >
                  <option value="">Use map base ({currentMap.baseTilesetId})</option>
                  {tilesets.map((ts) => (
                    <option key={ts.id} value={ts.id}>
                      {ts.name}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>Override Description</FormLabel>
                <Textarea
                  value={variationMetadata.descriptionOverride || ''}
                  placeholder={currentMap.metadata?.description || 'No base description'}
                  onChange={(e) => updateVariationMetadata('descriptionOverride', e.target.value)}
                  minH="90px"
                />
              </FormControl>
            </VStack>
          )
        ) : hasLocationDefs ? (
          <VStack spacing={5} align="stretch">
            {renderWorldSection()}
            <PropertyForm
              schema={propertyDefinitionsToSchema(locationMetadataDefinitions)}
              values={(currentMap.metadata || {}) as Record<string, PropertyValue>}
              onChange={(k, v) => updateMapMetadataGeneric(k, v)}
            />
          </VStack>
        ) : (
          <VStack spacing={4} align="stretch">
            {renderWorldSection()}

            <FormControl>
              <FormLabel>Map Name</FormLabel>
              <Input
                value={currentMap.name}
                onChange={(e) => updateCurrentMap({ name: e.target.value })}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Base Tileset</FormLabel>
              <Select
                value={currentMap.baseTilesetId}
                onChange={(e) => {
                  updateCurrentMap({ baseTilesetId: e.target.value });
                  setActiveTileset(e.target.value);
                }}
              >
                {tilesets.map((ts) => (
                  <option key={ts.id} value={ts.id}>
                    {ts.name}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel>Description</FormLabel>
              <Textarea
                value={currentMap.metadata?.description || ''}
                onChange={(e) => updateMapMetadata('description', e.target.value)}
                minH="90px"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Music Cue</FormLabel>
              <Input
                value={currentMap.metadata?.musicCue || ''}
                onChange={(e) => updateMapMetadata('musicCue', e.target.value)}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Music Preset</FormLabel>
              <Input
                value={currentMap.metadata?.musicPreset || ''}
                onChange={(e) => updateMapMetadata('musicPreset', e.target.value)}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Ambience Cue</FormLabel>
              <Input
                value={currentMap.metadata?.ambience || ''}
                onChange={(e) => updateMapMetadata('ambience', e.target.value)}
              />
            </FormControl>
          </VStack>
        )}
      </EntityFormDialog>
    </EditorModal>
  );
};
