import React, { useState } from 'react';
import { Box, Text, Select, Flex, HStack, IconButton } from '@chakra-ui/react';
import PanelHeader from '../common/PanelHeader';
import { AddIcon, MinusIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../store/useEditorStore';
import { TilesetCanvas } from './TilesetCanvas';
import { useTileSelection } from '../../hooks/useTileSelection';
import {
  buildPatternFromObjectDefinition,
  getTileIndicesForObjectDefinition,
} from '../../lib/tilesetObjects';

interface TilesetPaletteProps {
  enableMultiSelect?: boolean;
}

export const TilesetPalette: React.FC<TilesetPaletteProps> = ({ enableMultiSelect = false }) => {
  const tilesets = Array.from(useEditorStore((state) => state.tilesets).values());
  const activeTilesetId = useEditorStore((state) => state.activeTilesetId);
  const setActiveTileset = useEditorStore((state) => state.setActiveTileset);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const currentMap = useEditorStore((state) => state.currentMap);
  const selectedObjectDefinitionId = useEditorStore((state) => state.selectedObjectDefinitionId);
  const setSelectedObjectDefinition = useEditorStore((state) => state.setSelectedObjectDefinition);
  const setSampledPattern = useEditorStore((state) => state.setSampledPattern);
  const setSelectedTiles = useEditorStore((state) => state.setSelectedTiles);
  const setSelectedTile = useEditorStore((state) => state.setSelectedTile);

  // Use the shared tile selection hook
  const { selectedTileIndex, handleTileSelect } = useTileSelection();
  const selectedTileIndices = useEditorStore((state) => state.selectedTileIndices);
  const currentTileset = useEditorStore((state) => {
    const id = state.activeTilesetId;
    return id ? state.tilesets.get(id) || null : null;
  });

  const [zoom, setZoom] = useState(2.0); // Default to 200% for pixel art
  const selectedLayer = currentMap?.layers.find((layer) => layer.id === selectedLayerId);
  const isObjectLayer =
    selectedLayer?.kind === 'object' || selectedLayer?.sortingLayer === 'objects';

  const handleObjectSelect = (objectId: string) => {
    if (!currentTileset || !objectId) {
      setSelectedObjectDefinition(null);
      return;
    }

    const objectDefinition = currentTileset.objects?.find((entry) => entry.id === objectId);
    if (!objectDefinition) return;
    const pattern = buildPatternFromObjectDefinition(objectDefinition);
    if (!pattern) return;

    setSelectedTile(null);
    setSelectedTiles(getTileIndicesForObjectDefinition(objectDefinition, currentTileset));
    setSampledPattern({
      tilesetId: currentTileset.id,
      pattern: pattern.pattern,
      width: pattern.width,
      height: pattern.height,
    });
    setSelectedObjectDefinition(objectDefinition.id);
  };

  if (tilesets.length === 0) {
    return (
      <Flex h="full" align="center" justify="center" p={4} textAlign="center">
        <Text fontSize="xs" color="gray.600">
          No tilesets available. Import one in the Tilesets tab.
        </Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" h="full" overflow="hidden" bg="editorPanelBg">
      {/* Header Row */}
      <PanelHeader
        left={
          <HStack spacing={2}>
            <Select
              size="xs"
              variant="filled"
              bg="editorCanvasBg"
              borderColor="editorFieldBorder"
              _hover={{ bg: 'editorShellBorder' }}
              value={activeTilesetId || ''}
              onChange={(e) => setActiveTileset(e.target.value)}
              color="blue.300"
              fontSize="10px"
              fontWeight="bold"
              h="6"
              maxW="180px"
            >
              {tilesets.map((ts) => (
                <option key={ts.id} value={ts.id} style={{ background: '#171923' }}>
                  {ts.name.toUpperCase()}
                </option>
              ))}
            </Select>
            {isObjectLayer && currentTileset?.objects && currentTileset.objects.length > 0 && (
              <Select
                size="xs"
                variant="filled"
                bg="editorCanvasBg"
                borderColor="editorFieldBorder"
                _hover={{ bg: 'editorShellBorder' }}
                value={selectedObjectDefinitionId || ''}
                onChange={(e) => handleObjectSelect(e.target.value)}
                color="green.300"
                fontSize="10px"
                fontWeight="bold"
                h="6"
                maxW="180px"
              >
                <option value="" style={{ background: '#171923' }}>
                  TILES
                </option>
                {currentTileset.objects.map((objectDefinition) => (
                  <option
                    key={objectDefinition.id}
                    value={objectDefinition.id}
                    style={{ background: '#171923' }}
                  >
                    {objectDefinition.name.toUpperCase()}
                  </option>
                ))}
              </Select>
            )}
          </HStack>
        }
        actions={
          <HStack spacing={2}>
            <HStack spacing={0}>
              <IconButton
                aria-label="Zoom Out"
                icon={<MinusIcon fontSize="8px" />}
                size="xs"
                variant="ghost"
                h="5"
                minW="5"
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.5))}
              />
              <Text fontSize="9px" fontWeight="bold" color="gray.400" w="8" textAlign="center">
                {Math.round(zoom * 100)}%
              </Text>
              <IconButton
                aria-label="Zoom In"
                icon={<AddIcon fontSize="8px" />}
                size="xs"
                variant="ghost"
                h="5"
                minW="5"
                onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
              />
            </HStack>

            {selectedObjectDefinitionId && currentTileset?.objects ? (
              <HStack spacing={2}>
                <Text fontSize="9px" fontWeight="black" color="green.400" textTransform="uppercase">
                  {currentTileset.objects.find((entry) => entry.id === selectedObjectDefinitionId)
                    ?.name ?? 'Object'}
                </Text>
              </HStack>
            ) : enableMultiSelect && selectedTileIndices.length > 0 ? (
              <HStack spacing={2}>
                <Text fontSize="9px" fontWeight="black" color="blue.500" textTransform="uppercase">
                  {selectedTileIndices.length} selected
                </Text>
              </HStack>
            ) : selectedTileIndex !== null ? (
              <HStack spacing={2}>
                <Text fontSize="9px" fontWeight="black" color="blue.500" textTransform="uppercase">
                  Tile {selectedTileIndex}
                </Text>
                <Text fontSize="9px" color="gray.600">
                  {currentTileset
                    ? `(${selectedTileIndex % currentTileset.columns}, ${Math.floor(selectedTileIndex / currentTileset.columns)})`
                    : ''}
                </Text>
              </HStack>
            ) : null}
          </HStack>
        }
      />

      {/* Scrollable Canvas */}
      <Box flex={1} overflow="auto" bg="editorCanvasBg">
        {currentTileset ? (
          <Box p={2}>
            <TilesetCanvas
              tileset={currentTileset}
              selectedIndex={selectedTileIndex}
              onSelect={handleTileSelect}
              mode="static"
              zoom={zoom}
              enableMultiSelect={enableMultiSelect}
            />
          </Box>
        ) : (
          <Flex h="full" align="center" justify="center">
            <Text fontSize="xs" color="gray.600">
              Select a tileset
            </Text>
          </Flex>
        )}
      </Box>
    </Flex>
  );
};
