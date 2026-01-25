import React, { useState } from 'react';
import {
    VStack,
    Box,
    Text,
    Select,
    Flex,
    HStack,
    IconButton,
} from '@chakra-ui/react';
import { AddIcon, MinusIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../store/useEditorStore';
import { TilesetCanvas } from './TilesetCanvas';

export const TilesetPalette: React.FC = () => {
    const tilesets = Array.from(useEditorStore(state => state.tilesets).values());
    const activeTilesetId = useEditorStore(state => state.activeTilesetId);
    const setActiveTileset = useEditorStore(state => state.setActiveTileset);
    const selectedTileIndex = useEditorStore(state => state.selectedTileIndex);
    const selectedTileIndices = useEditorStore(state => state.selectedTileIndices);
    const setTileIndex = useEditorStore(state => state.setSelectedTile);
    const setSelectedTiles = useEditorStore(state => state.setSelectedTiles);
    const toggleSelectedTile = useEditorStore(state => state.toggleSelectedTile);
    const setActiveTool = useEditorStore(state => state.setActiveTool);

    const [zoom, setZoom] = useState(2.0); // Default to 200% for pixel art

    const handleTileSelect = (index: number, meta?: { ctrlKey?: boolean; shiftKey?: boolean }) => {
        if (meta?.ctrlKey) {
            toggleSelectedTile(index);
            setTileIndex(index);
            return;
        }

        if (meta?.shiftKey && selectedTileIndices.length > 0) {
            const last = selectedTileIndices[selectedTileIndices.length - 1] ?? (selectedTileIndex ?? 0);
            const start = Math.min(last, index);
            const end = Math.max(last, index);
            const range: number[] = [];
            for (let i = start; i <= end; i++) range.push(i);
            setSelectedTiles(range);
            setTileIndex(index);
            return;
        }

        // default single-select
        setSelectedTiles([index]);
        setTileIndex(index);
    };

    if (tilesets.length === 0) {
        return (
            <Flex h="full" align="center" justify="center" p={4} textAlign="center">
                <Text fontSize="xs" color="gray.600">No tilesets available. Import one in the Tilesets tab.</Text>
            </Flex>
        );
    }

    const currentTileset = activeTilesetId ? useEditorStore.getState().tilesets.get(activeTilesetId) : null;

    return (
        <Flex direction="column" h="full" overflow="hidden" bg="#03040a">
            {/* Header Row */}
            <HStack px={3} py={2} bg="#05060a" borderBottom="1px" borderColor="#071018" justify="space-between" flexShrink={0}>
                <Select
                    size="xs"
                    variant="filled"
                    bg="#0a0a0b"
                    borderColor="#0b1116"
                    _hover={{ bg: '#071018' }}
                    value={activeTilesetId || ''}
                    onChange={(e) => setActiveTileset(e.target.value)}
                    color="blue.300"
                    fontSize="10px"
                    fontWeight="bold"
                    h="6"
                    maxW="180px"
                >
                    {tilesets.map(ts => (
                        <option key={ts.id} value={ts.id} style={{ background: '#171923' }}>{ts.name.toUpperCase()}</option>
                    ))}
                </Select>

                <HStack spacing={0}>
                    <IconButton
                        aria-label="Zoom Out"
                        icon={<MinusIcon fontSize="8px" />}
                        size="xs"
                        variant="ghost"
                        h="5"
                        minW="5"
                        onClick={() => setZoom(z => Math.max(0.5, z - 0.5))}
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
                        onClick={() => setZoom(z => Math.min(4, z + 0.5))}
                    />
                </HStack>

                {selectedTileIndex !== null && (
                    <HStack spacing={2}>
                        <Text fontSize="9px" fontWeight="black" color="blue.500" textTransform="uppercase">
                            Tile {selectedTileIndex}
                        </Text>
                        <Text fontSize="9px" color="gray.600">
                            {currentTileset ? `(${(selectedTileIndex % currentTileset.columns)}, ${Math.floor(selectedTileIndex / currentTileset.columns)})` : ''}
                        </Text>
                    </HStack>
                )}
            </HStack>

            {/* Scrollable Canvas */}
            <Box flex={1} overflow="auto" bg="#0a0a0b">
                {currentTileset ? (
                    <Box p={2}>
                        <TilesetCanvas
                            tileset={currentTileset}
                            selectedIndex={selectedTileIndex}
                            onSelect={handleTileSelect}
                            mode="static"
                            zoom={zoom}
                        />
                    </Box>
                ) : (
                    <Flex h="full" align="center" justify="center">
                        <Text fontSize="xs" color="gray.600">Select a tileset</Text>
                    </Flex>
                )}
            </Box>
        </Flex>
    );
};
