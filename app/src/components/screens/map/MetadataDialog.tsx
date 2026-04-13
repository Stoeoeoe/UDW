import React from 'react';
import { FormControl, FormLabel, Input, Select, Textarea, Text, VStack } from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import type { PropertyValue } from '../../../types/schema';
import { PropertyForm, propertyDefinitionsToSchema } from '../../common/PropertyForm';
import { EditorModal } from '../../common/EditorModal';
import { EntityFormDialog } from '../common/EntityFormDialog';

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

  const updateMapMetadata = (key: 'description' | 'music' | 'ambience', value: string) => {
    updateCurrentMap({ metadata: { ...(currentMap.metadata || {}), [key]: value || undefined } });
  };

  const updateMapMetadataGeneric = (key: string, value: unknown) => {
    const next = { ...(currentMap.metadata || {}), [key]: value ?? undefined } as Record<
      string,
      unknown
    >;
    updateCurrentMap({ metadata: Object.keys(next).length > 0 ? next : undefined });
  };

  const updateVariationMetadata = (key: VariationOverrideKey, value: string) => {
    if (!activeVariation) return;
    const next: VariationMetadataValues = {
      ...((activeVariation.metadata || {}) as VariationMetadataValues),
      [key]: value || undefined,
    };
    (['mapNameOverride', 'baseTilesetIdOverride', 'descriptionOverride'] as const).forEach((k) => {
      if (!next[k]?.trim()) delete next[k];
    });
    updateVariation(activeVariation.id, {
      metadata: Object.keys(next).length > 0 ? next : undefined,
    });
  };

  const updateVariationMetadataGeneric = (key: string, value: unknown) => {
    if (!activeVariation) return;
    const next: Record<string, unknown> = {
      ...((activeVariation.metadata || {}) as Record<string, unknown>),
      [key]: value ?? undefined,
    };
    Object.keys(next).forEach((k) => {
      if (next[k] === undefined) delete next[k];
    });
    updateVariation(activeVariation.id, {
      metadata: Object.keys(next).length > 0 ? next : undefined,
    });
  };

  const variationMetadata = (activeVariation?.metadata || {}) as VariationMetadataValues;
  const hasLocationDefs = (locationMetadataDefinitions || []).length > 0;

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
          <PropertyForm
            schema={propertyDefinitionsToSchema(locationMetadataDefinitions)}
            values={(currentMap.metadata || {}) as Record<string, PropertyValue>}
            onChange={(k, v) => updateMapMetadataGeneric(k, v)}
          />
        ) : (
          <VStack spacing={4} align="stretch">
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
                value={currentMap.metadata?.music || ''}
                onChange={(e) => updateMapMetadata('music', e.target.value)}
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
