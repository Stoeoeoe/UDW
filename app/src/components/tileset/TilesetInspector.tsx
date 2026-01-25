import React from 'react';
import {
    VStack,
    HStack,
    Text,
    Box,
    Select,
    Button,
} from '@chakra-ui/react';
import { PropertyForm, PropertySchema } from '../common/PropertyForm';
import { useEditorStore } from '../../store/useEditorStore';
import { Tileset } from '../../types/schema';

interface TilesetInspectorProps {
    tileset: Tileset;
}

export const TilesetInspector: React.FC<TilesetInspectorProps> = ({ tileset }) => {
    const selectedIndex = useEditorStore(state => state.selectedTileIndex);
    const updateTileDef = useEditorStore(state => state.updateTileDefinition);

    // Selection & terrain helpers
    const selectedTileDef = selectedIndex !== null ? (tileset.tiles[selectedIndex] || {}) : {};
    const terrainTypes = useEditorStore(state => state.terrainTypes);
    const selectedTerrainId = useEditorStore(state => state.selectedTerrainId);
    const setSelectedTerrain = useEditorStore(state => state.setSelectedTerrain);
    const setTileCornerTerrain = useEditorStore(state => state.setTileCornerTerrain);

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

                    <PropertyForm
                        schema={[
                            { key: 'id', label: 'Semantic ID', type: 'string', description: 'Human-friendly semantic identifier' },
                            { key: 'collision.type', label: 'Collision', type: 'enum', constraints: { options: ['none', 'full'] } },
                            {
                                key: 'terrain',
                                label: 'Terrain',
                                type: 'custom',
                                customRenderer: (value: any, onChange: (v: any) => void) => {
                                    const options: { id: string; name: string; color?: string }[] = [];
                                    if (tileset.wangSets) {
                                        for (const ws of tileset.wangSets) {
                                            for (const wc of ws.colors) {
                                                options.push({ id: `${ws.id}:${wc.id}`, name: `${ws.name} — ${wc.name}`, color: wc.color });
                                            }
                                        }
                                    }

                                    return (
                                        <HStack spacing={3} align="center">
                                            <Box w={3} h={3} rounded="full" bg={options.find(o => o.id === value)?.color || 'transparent'} borderWidth={1} borderColor="gray.700" />
                                            <Select size="sm" bg="#05060a" borderColor="#0b1116" color="white" value={value || ''} onChange={(e) => onChange(e.target.value)}>
                                                <option value="">None</option>
                                                {options.map(o => (
                                                    <option key={o.id} value={o.id}>{o.name}</option>
                                                ))}
                                            </Select>
                                        </HStack>
                                    );
                                }
                            }
                        ] as PropertySchema[]}
                        values={{
                            id: selectedTileDef.id || '',
                            'collision.type': selectedTileDef.collision?.type || 'none',
                            terrain: selectedTileDef.terrain || ''
                        }}
                        onChange={(k, v) => {
                            if (!tileset || selectedIndex === null) return;
                            if (k === 'id') updateTileDef(tileset.id, selectedIndex, { ...selectedTileDef, id: v });
                            if (k === 'collision.type') updateTileDef(tileset.id, selectedIndex, { ...selectedTileDef, collision: { type: v } });
                            if (k === 'terrain') updateTileDef(tileset.id, selectedIndex, { ...selectedTileDef, terrain: v });
                        }}
                    />

                        {/* Terrain palette - choose active terrain for painting (only in terrain tool mode) */}
                        {useEditorStore.getState().tilesetToolMode === 'terrain' && (
                            <VStack align="stretch" spacing={2} pt={2}>
                                <Text fontSize="xs" fontWeight="black" color="gray.500" textTransform="uppercase">Terrain Palette</Text>
                                <HStack spacing={3} wrap="wrap">
                                    {terrainTypes.length === 0 ? (
                                        <Text color="gray.500" fontSize="sm">No terrains defined in project</Text>
                                    ) : terrainTypes.map(t => (
                                        <Box key={t.id}>
                                            <Button
                                                size="sm"
                                                leftIcon={<Box w={3} h={3} rounded="full" bg={t.color} borderWidth={1} borderColor="gray.700" />}
                                                bg={selectedTerrainId === t.id ? 'blue.700' : 'gray.800'}
                                                color={selectedTerrainId === t.id ? 'white' : 'gray.200'}
                                                _hover={{ bg: selectedTerrainId === t.id ? 'blue.600' : 'gray.700' }}
                                                onClick={() => setSelectedTerrain(t.id)}
                                            >
                                                {t.displayName}
                                            </Button>
                                        </Box>
                                    ))}
                                    {terrainTypes.length > 0 && (
                                        <Button size="sm" colorScheme="red" onClick={() => setSelectedTerrain(null)}>Clear</Button>
                                    )}
                                </HStack>
                            </VStack>
                        )}

                    {/* Corner terrain inspector (if present) */}
                    {selectedTileDef && (
                        <VStack align="stretch" spacing={2} pt={2}>
                            <Text fontSize="xs" fontWeight="black" color="gray.500" textTransform="uppercase">Corner Terrains</Text>
                            <HStack spacing={3}>
                                {([0,1,2,3] as number[]).map(ci => {
                                    const tid = (selectedTileDef as any).terrainCorners?.[ci] as string | null | undefined;
                                    const tt = terrainTypes.find(t => t.id === tid);
                                    return (
                                        <VStack key={ci} align="center" spacing={1}>
                                            <Box w={10} h={10} rounded="md" bg={tt ? tt.color : 'transparent'} borderWidth={1} borderColor="gray.700" />
                                            <Text fontSize="xs">{['TL','TR','BL','BR'][ci]}</Text>
                                            <HStack>
                                                <Box as="button" onClick={() => setTileCornerTerrain(tileset.id, selectedIndex!, ci, selectedTerrainId || null)} px={2} py={1} bg="gray.800" borderRadius="4px">Apply</Box>
                                                <Box as="button" onClick={() => setTileCornerTerrain(tileset.id, selectedIndex!, ci, null)} px={2} py={1} bg="red.700" borderRadius="4px">Clear</Box>
                                            </HStack>
                                        </VStack>
                                    );
                                })}
                            </HStack>
                        </VStack>
                    )}
                </VStack>
            )}
        </VStack>
    );
};
