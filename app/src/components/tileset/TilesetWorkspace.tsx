import React from 'react';
import {
    Box,
    Flex,
    VStack,
    Text,
    HStack,
    Heading,
} from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { TilesetCanvas } from './TilesetCanvas';

export const TilesetWorkspace: React.FC = () => {
    const activeId = useEditorStore(state => state.activeTilesetId);
    const tilesets = useEditorStore(state => state.tilesets);
    const selectedIndex = useEditorStore(state => state.selectedTileIndex);
    const setSelectedIndex = useEditorStore(state => state.setSelectedTile);

    const activeTileset = activeId ? tilesets.get(activeId) : null;

    if (!activeTileset) {
        return (
            <Flex h="full" align="center" justify="center" bg="gray.950">
                <VStack spacing={4}>
                    <Text fontSize="6xl">🎨</Text>
                    <VStack spacing={1}>
                        <Text color="white" fontWeight="bold" fontSize="xl">No Tileset Active</Text>
                        <Text color="gray.500">Select or import a tileset from the sidebar to begin.</Text>
                    </VStack>
                </VStack>
            </Flex>
        );
    }

    return (
        <Flex h="full" bg="gray.950" direction="column">
            {/* Context Header */}
            <HStack px={6} py={3} bg="gray.900" borderBottom="1px" borderColor="gray.800" justify="space-between" h="14" position="relative" zIndex={2}>
                <VStack align="start" spacing={0}>
                    <Heading size="xs" color="white" textTransform="uppercase" letterSpacing="widest">{activeTileset.name}</Heading>
                    <Text fontSize="10px" color="gray.500" fontWeight="bold">
                        {activeTileset.tileWidth}x{activeTileset.tileHeight} • {activeTileset.columns} COLUMNS • {activeTileset.tileCount} TILES
                    </Text>
                </VStack>
            </HStack>

            <Flex flex={1} overflow="hidden" position="relative">
                {/* Main Canvas Area */}
                <Box flex={1} position="relative" bg="gray.950">
                    <TilesetCanvas
                        tileset={activeTileset}
                        selectedIndex={selectedIndex}
                        onSelect={setSelectedIndex}
                    />
                </Box>
            </Flex>
        </Flex>
    );
};
