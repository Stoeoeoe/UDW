import React from 'react';
import { Box, Flex, VStack, Text, Center } from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { TilesetCanvas } from './TilesetCanvas';
import { ViewportShell } from '../common/ViewportShell';

export const TilesetWorkspace: React.FC = () => {
    const activeId = useEditorStore(state => state.activeTilesetId);
    const tilesets = useEditorStore(state => state.tilesets);
    const selectedIndex = useEditorStore(state => state.selectedTileIndex);
    const selectedIndices = useEditorStore(state => state.selectedTileIndices);
    const setSelectedTile = useEditorStore(state => state.setSelectedTile);
    const setSelectedTiles = useEditorStore(state => state.setSelectedTiles);
    const toggleSelectedTile = useEditorStore(state => state.toggleSelectedTile);

    const handleTileSelect = (index: number, meta?: { ctrlKey?: boolean; shiftKey?: boolean }) => {
        if (meta?.ctrlKey) {
            toggleSelectedTile(index);
            setSelectedTile(index);
            return;
        }
        if (meta?.shiftKey && selectedIndices.length > 0) {
            const last = selectedIndices[selectedIndices.length - 1] ?? (selectedIndex ?? 0);
            const start = Math.min(last, index);
            const end = Math.max(last, index);
            const range: number[] = [];
            for (let i = start; i <= end; i++) range.push(i);
            setSelectedTiles(range);
            setSelectedTile(index);
            return;
        }
        setSelectedTiles([index]);
        setSelectedTile(index);
    };

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
                        onSelect={handleTileSelect}
                    />
                </Box>
            </Flex>
        </ViewportShell>
    );
};

export default TilesetWorkspace;
