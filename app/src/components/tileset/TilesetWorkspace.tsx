import React from 'react';
import { Box, Flex, VStack, Text, Center, Button } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../store/useEditorStore';
import { TilesetCanvas } from './TilesetCanvas';
import { ViewportShell } from '../common/ViewportShell';

export const TilesetWorkspace: React.FC = () => {
    const activeId = useEditorStore(state => state.activeTilesetId);
    const tilesets = useEditorStore(state => state.tilesets);
    const selectedIndex = useEditorStore(state => state.selectedTileIndex);
    const setSelectedIndex = useEditorStore(state => state.setSelectedTile);

    const activeTileset = activeId ? tilesets.get(activeId) : null;

    if (!activeTileset) {
        return (
            <Center w="full" h="full" bg="gray.950">
                <VStack spacing={6}>
                    <VStack spacing={2}>
                        <Text fontSize="6xl">🎨</Text>
                        <Text color="white" fontWeight="bold" fontSize="xl">No Tileset Active</Text>
                        <Text color="gray.500">Select or import a tileset from the sidebar to begin.</Text>
                    </VStack>
                </VStack>
            </Center>
        );
    }

    return (
        <ViewportShell title={activeTileset.name} subtitle={`${activeTileset.tileWidth}x${activeTileset.tileHeight} • ${activeTileset.columns} COLUMNS • ${activeTileset.tileCount} TILES`}>
            <Flex h="full" overflow="hidden" position="relative">
                <Box flex={1} position="relative">
                    <TilesetCanvas
                        tileset={activeTileset}
                        selectedIndex={selectedIndex}
                        onSelect={(i, meta) => setSelectedIndex(i, meta)}
                    />
                </Box>
            </Flex>
        </ViewportShell>
    );
};

export default TilesetWorkspace;
