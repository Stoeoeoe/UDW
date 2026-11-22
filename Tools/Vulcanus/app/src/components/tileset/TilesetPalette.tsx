import React, { useState } from 'react';
import { Box, Text, Select, Flex, HStack, IconButton } from '@chakra-ui/react';
import { AddIcon, MinusIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../store/useEditorStore';
import { TilesetCanvas } from './TilesetCanvas';
import { useTileSelection } from '../../hooks/useTileSelection';

interface TilesetPaletteProps {
  enableMultiSelect?: boolean;
}

export const TilesetPalette: React.FC<TilesetPaletteProps> = ({ enableMultiSelect = false }) => {
  const tilesets = Array.from(useEditorStore((state) => state.tilesets).values());
  const activeTilesetId = useEditorStore((state) => state.activeTilesetId);
  const setActiveTileset = useEditorStore((state) => state.setActiveTileset);

  // Use the shared tile selection hook
  const { selectedTileIndex, handleTileSelect } = useTileSelection();
  const selectedTileIndices = useEditorStore((state) => state.selectedTileIndices);
  const currentTileset = useEditorStore((state) => {
    const id = state.activeTilesetId;
    return id ? state.tilesets.get(id) || null : null;
  });

  const [zoom, setZoom] = useState(2.0); // Default to 200% for pixel art

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
      <Flex
        justify="space-between"
        align="center"
        gap={2}
        h="8"
        px="2"
        flexShrink={0}
        bg="editorSectionBg"
        borderBottom="1px"
        borderColor="editorShellBorder"
      >
        <HStack spacing={2} minW={0}>
          <Select
            size="xs"
            variant="filled"
            bg="editorSectionBg"
            borderColor="editorFieldBorder"
            _hover={{ bg: 'editorPanelBg' }}
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
        </HStack>

        <HStack spacing={2} flexShrink={0} minH="6">
          {enableMultiSelect && selectedTileIndices.length > 0 ? (
            <Text fontSize="9px" fontWeight="black" color="blue.400" textTransform="uppercase">
              {selectedTileIndices.length} selected
            </Text>
          ) : selectedTileIndex !== null ? (
            <Text fontSize="9px" color="gray.400">
              Tile {selectedTileIndex}
              {currentTileset
                ? ` (${selectedTileIndex % currentTileset.columns}, ${Math.floor(selectedTileIndex / currentTileset.columns)})`
                : ''}
            </Text>
          ) : null}
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
        </HStack>
      </Flex>

      <Box flex={1} minH={0} overflow="auto" bg="editorCanvasBg">
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
