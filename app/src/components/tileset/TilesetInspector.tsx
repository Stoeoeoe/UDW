import React from 'react';
import {
    VStack,
    HStack,
    Text,
    Button,
    FormControl,
    FormLabel,
    Input,
} from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { Tileset } from '../../types/schema';

interface TilesetInspectorProps {
    tileset: Tileset;
}

export const TilesetInspector: React.FC<TilesetInspectorProps> = ({ tileset }) => {
    const selectedIndex = useEditorStore(state => state.selectedTileIndex);
    const updateTileDef = useEditorStore(state => state.updateTileDefinition);

    const selectedTileDef = selectedIndex !== null ? (tileset.tiles[selectedIndex] || {}) : {};

    return (
        <VStack align="stretch" spacing={6} p={6}>
            <VStack align="start" spacing={1} mb={2}>
                <Text fontSize="xs" fontWeight="black" color="gray.500" textTransform="uppercase" letterSpacing="widest">
                    Tile Properties
                </Text>
            </VStack>

            {selectedIndex === null ? (
                <VStack mt="10" spacing={2} textAlign="center" opacity={0.5}>
                    <Text color="gray.500" fontSize="sm">No tile selected</Text>
                    <Text fontSize="10px" color="gray.600">Click a tile in the viewer</Text>
                </VStack>
            ) : (
                <VStack align="stretch" spacing={5}>
                    <VStack align="start" spacing={1}>
                        <Text fontSize="2xl" fontWeight="black" color="white">#{selectedIndex}</Text>
                        <Text fontSize="xs" color="gray.500" textTransform="uppercase">Atlas Index</Text>
                    </VStack>

                    <FormControl variant="floating">
                        <FormLabel color="gray.500" fontSize="xs" fontWeight="black" textTransform="uppercase">Semantic ID</FormLabel>
                        <Input
                            bg="gray.950"
                            borderColor="gray.700"
                            _focus={{ borderColor: 'blue.500' }}
                            placeholder="e.g. grass_corner"
                            value={selectedTileDef.id || ''}
                            onChange={(e) => updateTileDef(tileset.id, selectedIndex, { ...selectedTileDef, id: e.target.value })}
                        />
                    </FormControl>

                    <VStack align="stretch" spacing={3}>
                        <Text fontSize="xs" fontWeight="black" color="gray.500" textTransform="uppercase">Collision</Text>
                        <HStack spacing={2}>
                            {[
                                { id: 'none', label: 'None' },
                                { id: 'full', label: 'Full' }
                            ].map(type => (
                                <Button
                                    key={type.id}
                                    size="xs"
                                    flex={1}
                                    variant={selectedTileDef.collision?.type === type.id ? 'solid' : 'outline'}
                                    colorScheme={selectedTileDef.collision?.type === type.id ? 'blue' : 'gray'}
                                    onClick={() => updateTileDef(tileset.id, selectedIndex, { ...selectedTileDef, collision: { type: type.id as any } })}
                                >
                                    {type.label}
                                </Button>
                            ))}
                        </HStack>
                    </VStack>
                </VStack>
            )}
        </VStack>
    );
};
