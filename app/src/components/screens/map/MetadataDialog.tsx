import React from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Select,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { EditorModal } from '../../common/EditorModal';

interface MetadataDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'base' | 'variation';
}

type VariationOverrideKey =
  | 'mapNameOverride'
  | 'baseTilesetIdOverride'
  | 'descriptionOverride';

type VariationMetadataValues = Record<string, string | undefined>;

export const MetadataDialog: React.FC<MetadataDialogProps> = ({
  isOpen,
  onClose,
  initialTab,
}) => {
  const currentMap = useEditorStore((state) => state.currentMap);
  const activeVariationId = useEditorStore((state) => state.activeVariationId);
  const updateCurrentMap = useEditorStore((state) => state.updateCurrentMap);
  const updateVariation = useEditorStore((state) => state.updateVariation);
  const setActiveTileset = useEditorStore((state) => state.setActiveTileset);
  const tilesets = Array.from(
    useEditorStore((state) => state.tilesets).values(),
  );

  const activeVariation =
    currentMap?.variations?.find(
      (variation) => variation.id === activeVariationId,
    ) || null;

  if (!currentMap) {
    return (
      <EditorModal isOpen={isOpen} onClose={onClose}>
        <Box
          bg="gray.900"
          p={8}
          rounded="2xl"
          border="1px"
          borderColor="gray.800"
          boxShadow="2xl"
          w="lg"
        >
          <VStack spacing={4} align="stretch">
            <Text color="white" fontSize="lg" fontWeight="bold">
              Map Metadata
            </Text>
            <Text fontSize="sm" color="gray.500">
              Select a map first to edit map or variation metadata.
            </Text>
            <Button onClick={onClose} alignSelf="flex-end">
              Close
            </Button>
          </VStack>
        </Box>
      </EditorModal>
    );
  }

  const updateMapMetadata = (
    key: 'description' | 'music' | 'ambience',
    value: string,
  ) => {
    const nextMetadata = {
      ...(currentMap.metadata || {}),
      [key]: value || undefined,
    };
    updateCurrentMap({ metadata: nextMetadata });
  };

  const updateVariationMetadata = (
    key: VariationOverrideKey,
    value: string,
  ) => {
    if (!activeVariation) return;

    const currentMetadata = (activeVariation.metadata ||
      {}) as VariationMetadataValues;
    const nextMetadata: VariationMetadataValues = {
      ...currentMetadata,
      [key]: value || undefined,
    };

    (
      [
        'mapNameOverride',
        'baseTilesetIdOverride',
        'descriptionOverride',
      ] as const
    ).forEach((overrideKey) => {
      const raw = nextMetadata[overrideKey];
      if (!raw || !String(raw).trim()) {
        delete nextMetadata[overrideKey];
      }
    });

    updateVariation(activeVariation.id, {
      metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined,
    });
  };

  const variationMetadata =
    ((activeVariation?.metadata || {}) as VariationMetadataValues) || {};

  return (
    <EditorModal isOpen={isOpen} onClose={onClose}>
      <Box
        bg="gray.900"
        p={6}
        rounded="2xl"
        border="1px"
        borderColor="gray.800"
        boxShadow="2xl"
        w="2xl"
        maxW="90vw"
        maxH="85vh"
        overflow="hidden"
      >
        <VStack spacing={5} align="stretch" h="full">
          <VStack align="start" spacing={1}>
            <Text color="white" fontSize="lg" fontWeight="bold">
              Map Metadata
            </Text>
            <Text color="gray.500" fontSize="sm">
              Edit base map metadata and active variation overrides in one
              place.
            </Text>
          </VStack>

          {/* Contextual content: either base map fields or variation overrides */}
          {initialTab === 'variation' && activeVariation ? (
            <VStack spacing={3} align="stretch" flex={1} overflowY="auto">
              <FormControl>
                <FormLabel
                  fontSize="xs"
                  color="gray.400"
                  textTransform="uppercase"
                >
                  Variation Name
                </FormLabel>
                {activeVariation.kind === 'season' ? (
                  <Text fontSize="sm" color="gray.300">
                    {activeVariation.displayName} (season)
                  </Text>
                ) : (
                  <Input
                    size="sm"
                    value={activeVariation.displayName}
                    onChange={(event) =>
                      updateVariation(activeVariation.id, {
                        displayName: event.target.value,
                      })
                    }
                    bg="gray.950"
                    borderColor="gray.700"
                  />
                )}
              </FormControl>

              <FormControl>
                <FormLabel
                  fontSize="xs"
                  color="gray.400"
                  textTransform="uppercase"
                >
                  Tileset Suffix
                </FormLabel>
                <Input
                  size="sm"
                  value={activeVariation.tilesetSuffix || ''}
                  placeholder="_winter"
                  onChange={(event) =>
                    updateVariation(activeVariation.id, {
                      tilesetSuffix: event.target.value || undefined,
                    })
                  }
                  bg="gray.950"
                  borderColor="gray.700"
                />
              </FormControl>

              <FormControl>
                <FormLabel
                  fontSize="xs"
                  color="gray.400"
                  textTransform="uppercase"
                >
                  Override Map Name
                </FormLabel>
                <Input
                  size="sm"
                  value={variationMetadata.mapNameOverride || ''}
                  placeholder={currentMap.name}
                  onChange={(event) =>
                    updateVariationMetadata(
                      'mapNameOverride',
                      event.target.value,
                    )
                  }
                  bg="gray.950"
                  borderColor="gray.700"
                />
              </FormControl>

              <FormControl>
                <FormLabel
                  fontSize="xs"
                  color="gray.400"
                  textTransform="uppercase"
                >
                  Override Base Tileset
                </FormLabel>
                <Select
                  size="sm"
                  value={variationMetadata.baseTilesetIdOverride || ''}
                  onChange={(event) => {
                    updateVariationMetadata(
                      'baseTilesetIdOverride',
                      event.target.value,
                    );
                    if (event.target.value)
                      setActiveTileset(event.target.value);
                  }}
                  bg="gray.950"
                  borderColor="gray.700"
                >
                  <option value="" style={{ background: '#171923' }}>
                    Use map base ({currentMap.baseTilesetId})
                  </option>
                  {tilesets.map((tileset) => (
                    <option
                      key={tileset.id}
                      value={tileset.id}
                      style={{ background: '#171923' }}
                    >
                      {tileset.name}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel
                  fontSize="xs"
                  color="gray.400"
                  textTransform="uppercase"
                >
                  Override Description
                </FormLabel>
                <Textarea
                  size="sm"
                  value={variationMetadata.descriptionOverride || ''}
                  placeholder={
                    currentMap.metadata?.description || 'No base description'
                  }
                  onChange={(event) =>
                    updateVariationMetadata(
                      'descriptionOverride',
                      event.target.value,
                    )
                  }
                  bg="gray.950"
                  borderColor="gray.700"
                  minH="90px"
                />
              </FormControl>
            </VStack>
          ) : (
            <VStack spacing={3} align="stretch" flex={1} overflowY="auto">
              <FormControl>
                <FormLabel
                  fontSize="xs"
                  color="gray.400"
                  textTransform="uppercase"
                >
                  Map Name
                </FormLabel>
                <Input
                  size="sm"
                  value={currentMap.name}
                  onChange={(event) =>
                    updateCurrentMap({ name: event.target.value })
                  }
                  bg="gray.950"
                  borderColor="gray.700"
                />
              </FormControl>

              <FormControl>
                <FormLabel
                  fontSize="xs"
                  color="gray.400"
                  textTransform="uppercase"
                >
                  Base Tileset
                </FormLabel>
                <Select
                  size="sm"
                  value={currentMap.baseTilesetId}
                  onChange={(event) => {
                    updateCurrentMap({ baseTilesetId: event.target.value });
                    setActiveTileset(event.target.value);
                  }}
                  bg="gray.950"
                  borderColor="gray.700"
                >
                  {tilesets.map((tileset) => (
                    <option
                      key={tileset.id}
                      value={tileset.id}
                      style={{ background: '#171923' }}
                    >
                      {tileset.name}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel
                  fontSize="xs"
                  color="gray.400"
                  textTransform="uppercase"
                >
                  Description
                </FormLabel>
                <Textarea
                  size="sm"
                  value={currentMap.metadata?.description || ''}
                  onChange={(event) =>
                    updateMapMetadata('description', event.target.value)
                  }
                  bg="gray.950"
                  borderColor="gray.700"
                  minH="90px"
                />
              </FormControl>

              <FormControl>
                <FormLabel
                  fontSize="xs"
                  color="gray.400"
                  textTransform="uppercase"
                >
                  Music Cue
                </FormLabel>
                <Input
                  size="sm"
                  value={currentMap.metadata?.music || ''}
                  onChange={(event) =>
                    updateMapMetadata('music', event.target.value)
                  }
                  bg="gray.950"
                  borderColor="gray.700"
                />
              </FormControl>

              <FormControl>
                <FormLabel
                  fontSize="xs"
                  color="gray.400"
                  textTransform="uppercase"
                >
                  Ambience Cue
                </FormLabel>
                <Input
                  size="sm"
                  value={currentMap.metadata?.ambience || ''}
                  onChange={(event) =>
                    updateMapMetadata('ambience', event.target.value)
                  }
                  bg="gray.950"
                  borderColor="gray.700"
                />
              </FormControl>
            </VStack>
          )}

          <HStack justify="flex-end">
            <Button onClick={onClose}>Close</Button>
          </HStack>
        </VStack>
      </Box>
    </EditorModal>
  );
};
