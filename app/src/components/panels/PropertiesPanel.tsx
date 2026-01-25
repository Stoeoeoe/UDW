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
    Switch,
    Select,
    NumberInput,
    NumberInputField,
    Heading,
    HStack,
} from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { TilesetInspector } from '../tileset/TilesetInspector';
import { DEFAULT_ENTITY_TYPES } from '../../lib/defaultEntities';
import { resolveEntities } from '../../lib/mapUtils';

export const PropertiesPanel: React.FC = () => {
    const editorMode = useEditorStore(state => state.mode);
    const selectedEntityId = useEditorStore(state => state.selectedEntityId);
    const updateEntityProperties = useEditorStore(state => state.updateEntityProperties);
    const currentMap = useEditorStore(state => state.currentMap);
    const activeVariationId = useEditorStore(state => state.activeVariationId);
    const activeTilesetId = useEditorStore(state => state.activeTilesetId);
    const tilesets = useEditorStore(state => state.tilesets);

    // Contextual rendering for Tileset mode
    if (editorMode === 'tilesets') {
        const activeTileset = activeTilesetId ? tilesets.get(activeTilesetId) : null;
        if (activeTileset) {
            return <TilesetInspector tileset={activeTileset} />;
        }
    }

    // Resolve entities for the current variation
    const resolvedEntities = currentMap ? resolveEntities(currentMap, activeVariationId) : [];
    const selectedEntity = resolvedEntities.find(e => e.id === selectedEntityId);
    const entityType = selectedEntity ? DEFAULT_ENTITY_TYPES.find(t => t.id === selectedEntity.typeId) : null;

    const handlePropertyChange = (key: string, value: any) => {
        if (selectedEntityId) {
            updateEntityProperties(selectedEntityId, { [key]: value });
        }
    };

    return (
        <Flex direction="column" h="full" bg="gray.950" color="gray.200">
            {/* Header */}
            <Box bg="gray.900" borderBottom="1px" borderColor="gray.800" px={4} py={3}>
                <VStack align="start" spacing={0}>
                    <Text fontSize="xs" fontWeight="black" textTransform="uppercase" letterSpacing="widest" color="gray.500">
                        Inspector
                    </Text>
                    <Heading size="xs" color="white">
                        {selectedEntity ? (entityType?.displayName || 'Entity') : 'Selection'}
                    </Heading>
                </VStack>
            </Box>

            <Box p={4} overflowY="auto" flex={1}>
                {!selectedEntity ? (
                    <VStack mt="10" spacing={2} textAlign="center" opacity={0.4}>
                        <Text fontSize="4xl">🔍</Text>
                        <Text color="gray.500" fontSize="sm">No Object Selected</Text>
                        <Text fontSize="10px" color="gray.600">Select an entity on the map to view and edit properties</Text>
                    </VStack>
                ) : (
                    <VStack align="stretch" spacing={5}>
                        {/* Static Identity Section */}
                        <VStack align="stretch" spacing={3}>
                            <FormControl>
                                <FormLabel color="gray.500" fontSize="10px" fontWeight="black" textTransform="uppercase" mb={1}>Core ID</FormLabel>
                                <Input
                                    size="xs"
                                    variant="filled"
                                    bg="gray.900"
                                    value={selectedEntity.id}
                                    isReadOnly
                                    fontFamily="mono"
                                    _hover={{ bg: 'gray.800' }}
                                />
                            </FormControl>

                            <FormControl>
                                <FormLabel color="gray.500" fontSize="10px" fontWeight="black" textTransform="uppercase" mb={1}>Entity Type</FormLabel>
                                <Text fontSize="xs" color="blue.400" fontWeight="bold">{selectedEntity.typeId}</Text>
                            </FormControl>

                            <FormControl>
                                <FormLabel color="gray.500" fontSize="10px" fontWeight="black" textTransform="uppercase" mb={1}>Position</FormLabel>
                                <HStack>
                                    <Text fontSize="xs" color="gray.400" w="8">X:</Text>
                                    <Text fontSize="xs" fontWeight="bold">{selectedEntity.position[0]}</Text>
                                    <Box w={4} />
                                    <Text fontSize="xs" color="gray.400" w="8">Y:</Text>
                                    <Text fontSize="xs" fontWeight="bold">{selectedEntity.position[1]}</Text>
                                </HStack>
                            </FormControl>
                        </VStack>

                        <Divider borderColor="gray.800" />

                        {/* Dynamic Properties Section */}
                        <VStack align="stretch" spacing={4}>
                            <Text color="gray.500" fontSize="10px" fontWeight="black" textTransform="uppercase">Behavior Properties</Text>

                            {entityType?.properties.map(prop => {
                                const currentValue = selectedEntity.properties[prop.key] ?? prop.defaultValue;

                                return (
                                    <FormControl key={prop.key}>
                                        <FormLabel fontSize="xs" color="gray.300" mb={1}>{prop.label}</FormLabel>

                                        {prop.type === 'string' && (
                                            <Input
                                                size="sm"
                                                bg="gray.900"
                                                borderColor="gray.800"
                                                value={currentValue}
                                                onChange={(e) => handlePropertyChange(prop.key, e.target.value)}
                                            />
                                        )}

                                        {prop.type === 'number' && (
                                            <NumberInput
                                                size="sm"
                                                value={currentValue}
                                                min={prop.constraints?.min}
                                                max={prop.constraints?.max}
                                                onChange={(_, val) => handlePropertyChange(prop.key, val)}
                                            >
                                                <NumberInputField bg="gray.900" borderColor="gray.800" />
                                            </NumberInput>
                                        )}

                                        {prop.type === 'boolean' && (
                                            <Switch
                                                colorScheme="blue"
                                                isChecked={currentValue}
                                                onChange={(e) => handlePropertyChange(prop.key, e.target.checked)}
                                            />
                                        )}

                                        {prop.type === 'enum' && (
                                            <Select
                                                size="sm"
                                                bg="gray.900"
                                                borderColor="gray.800"
                                                value={currentValue}
                                                onChange={(e) => handlePropertyChange(prop.key, e.target.value)}
                                            >
                                                {prop.constraints?.options?.map(opt => (
                                                    <option key={opt} value={opt} style={{ background: '#1a202c' }}>{opt}</option>
                                                ))}
                                            </Select>
                                        )}

                                        {prop.description && (
                                            <Text fontSize="9px" color="gray.600" mt={1}>{prop.description}</Text>
                                        )}
                                    </FormControl>
                                );
                            })}

                            {(!entityType || entityType.properties.length === 0) && (
                                <Text fontSize="xs" color="gray.600" fontStyle="italic">No configurable properties</Text>
                            )}
                        </VStack>
                    </VStack>
                )}
            </Box>
        </Flex>
    );
};
