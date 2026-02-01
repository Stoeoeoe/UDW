import React from 'react';
import { VStack, HStack, Text, Box, Divider } from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { Tileset } from '../../types/schema';

interface TilesetTerrainPanelProps {
    tileset: Tileset;
}

export const TilesetTerrainPanel: React.FC<TilesetTerrainPanelProps> = ({ tileset }) => {
    // tileset prop available for future terrain-tileset integration
    void tileset;
    const terrainTypes = useEditorStore(state => state.terrainTypes);
    const selectedTerrainId = useEditorStore(state => state.selectedTerrainId);
    const setSelectedTerrain = useEditorStore(state => state.setSelectedTerrain);

    return (
        <VStack align="stretch" spacing={4} p={6}>
            <VStack align="start" spacing={1}>
                <Text fontSize="xs" fontWeight="black" color="gray.500" textTransform="uppercase">Terrain Palette</Text>
                <Text fontSize="sm" color="gray.400">Select a terrain then click tile corners to paint.</Text>
            </VStack>

            <Divider borderColor="gray.800" />

            {terrainTypes.length === 0 ? (
                <Text color="gray.500">No terrain types defined in project.</Text>
            ) : (
                <VStack align="stretch" spacing={1}>
                    {terrainTypes.map(t => (
                        <HStack
                            key={t.id}
                            spacing={3}
                            align="center"
                            px={3}
                            py={2}
                            rounded="md"
                            cursor="pointer"
                            bg={selectedTerrainId === t.id ? 'blue.700' : 'transparent'}
                            _hover={{ bg: selectedTerrainId === t.id ? 'blue.600' : 'gray.800' }}
                            onClick={() => setSelectedTerrain(t.id)}
                        >
                            <Box w={4} h={4} rounded="sm" bg={t.color} borderWidth={1} borderColor="gray.600" />
                            <Text flex={1} fontWeight={selectedTerrainId === t.id ? 'semibold' : 'normal'} color={selectedTerrainId === t.id ? 'white' : 'gray.300'}>{t.displayName}</Text>
                        </HStack>
                    ))}
                </VStack>
            )}
        </VStack>
    );
};

export default TilesetTerrainPanel;
