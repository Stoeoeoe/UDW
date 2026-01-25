import React from 'react';
import {
    Box,
    Flex,
    Text,
    VStack,
    Divider,
    Input,
    FormControl,
    FormLabel,
} from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { TilesetInspector } from '../tileset/TilesetInspector';

export const PropertiesPanel: React.FC = () => {
    const editorMode = useEditorStore(state => state.mode);
    const selectedEntityIds = useEditorStore(state => state.selectedEntityIds);
    const currentMap = useEditorStore(state => state.currentMap);
    const activeTilesetId = useEditorStore(state => state.activeTilesetId);
    const tilesets = useEditorStore(state => state.tilesets);

    // Contextual rendering
    if (editorMode === 'tilesets') {
        const activeTileset = activeTilesetId ? tilesets.get(activeTilesetId) : null;
        if (activeTileset) {
            return <TilesetInspector tileset={activeTileset} />;
        }
    }

    // Default Entity Properties
    const selectionCount = selectedEntityIds.size;
    const singleSelectedEntity = selectionCount === 1
        ? currentMap?.entities.find(e => e.id === Array.from(selectedEntityIds)[0])
        : null;

    return (
        <Flex direction="column" h="full" bg="gray.900" color="gray.200">
            {/* Header */}
            <Box p="3" borderBottom="1px" borderColor="gray.800">
                <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="wider" color="gray.500">
                    Properties
                </Text>
            </Box>

            <Box p="4" overflowY="auto" flex={1}>
                <VStack spacing="6" align="stretch">
                    {/* Scenario: Nothing Selected */}
                    {selectionCount === 0 && (
                        <VStack mt="10" spacing="2" textAlign="center">
                            <Text color="gray.600">No selection</Text>
                            <Text fontSize="xs" color="gray.500">Select an entity or tile to view properties</Text>
                        </VStack>
                    )}

                    {/* Scenario: Single Entity Selected */}
                    {singleSelectedEntity && (
                        <VStack spacing="4" align="stretch">
                            {/* Header Info */}
                            <FormControl>
                                <FormLabel fontSize="xs" fontWeight="bold" color="gray.500" textTransform="uppercase">ID</FormLabel>
                                <Box bg="gray.800" px="2" py="1.5" rounded="md" fontSize="sm" color="gray.300" fontFamily="mono" userSelect="all">
                                    {singleSelectedEntity.id}
                                </Box>
                            </FormControl>

                            <FormControl>
                                <FormLabel fontSize="xs" fontWeight="bold" color="gray.500" textTransform="uppercase">Type</FormLabel>
                                <Text fontSize="sm" color="blue.400" fontWeight="medium">
                                    {singleSelectedEntity.typeId}
                                </Text>
                            </FormControl>

                            <Divider borderColor="gray.800" />

                            {/* Properties (Dynamic) */}
                            <VStack spacing="3" align="stretch">
                                <Text fontSize="xs" fontWeight="bold" color="gray.500" textTransform="uppercase">Custom Properties</Text>
                                {/* Placeholder for dynamic property loop */}
                                {Object.entries(singleSelectedEntity.properties).map(([key, value]) => (
                                    <FormControl key={key}>
                                        <FormLabel fontSize="xs" color="gray.400" mb="1">{key}</FormLabel>
                                        <Input
                                            size="sm"
                                            value={String(value)}
                                            isReadOnly // Read-only until we implement updates
                                            bg="gray.800"
                                            border="none"
                                            rounded="md"
                                            color="gray.200"
                                            _focus={{ ring: 1, ringColor: 'blue.500' }}
                                        />
                                    </FormControl>
                                ))}
                            </VStack>
                        </VStack>
                    )}
                </VStack>
            </Box>
        </Flex>
    );
};
