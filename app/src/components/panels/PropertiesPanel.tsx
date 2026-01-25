import React from 'react';
import {
    Box,
    Text,
    VStack,
    Divider,
    Input,
    FormControl,
    FormLabel,
    HStack,
} from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { TilesetInspector } from '../tileset/TilesetInspector';
import { PropertyForm, PropertySchema } from '../common/PropertyForm';
import { DEFAULT_ENTITY_TYPES } from '../../lib/defaultEntities';
import { resolveEntities } from '../../lib/mapUtils';
import { InspectorPanel, InspectorEmptyState } from '../editor/common';

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
        return (
            <InspectorPanel title="Tile Properties">
                <InspectorEmptyState icon="🎨" message="No Tileset Selected" hint="Select a tileset to inspect tiles" />
            </InspectorPanel>
        );
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
        <InspectorPanel
            title={selectedEntity ? (entityType?.displayName || 'Entity') : 'Selection'}
            emptyState={
                <InspectorEmptyState
                    icon="🔍"
                    message="No Object Selected"
                    hint="Select an entity on the map to view and edit properties"
                />
            }
        >
            {selectedEntity && (
                <VStack align="stretch" spacing={5}>
                    {/* Static Identity Section */}
                    <VStack align="stretch" spacing={3}>
                        <FormControl>
                            <FormLabel color="gray.500" fontSize="10px" fontWeight="black" textTransform="uppercase" mb={1}>Core ID</FormLabel>
                            <Input
                                size="xs"
                                variant="filled"
                                bg="#0a0a0b"
                                value={selectedEntity.id}
                                isReadOnly
                                fontFamily="mono"
                                _hover={{ bg: '#071018' }}
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

                    <Divider borderColor="#071018" />

                    {/* Dynamic Properties Section */}
                    <VStack align="stretch" spacing={4}>
                        <Text color="gray.500" fontSize="10px" fontWeight="black" textTransform="uppercase">Behavior Properties</Text>

                        {entityType?.properties && (
                            <PropertyForm
                                schema={(entityType.properties as any as PropertySchema[])}
                                values={selectedEntity?.properties || {}}
                                onChange={(k, v) => handlePropertyChange(k, v)}
                            />
                        )}

                        {(!entityType || entityType.properties.length === 0) && (
                            <Text fontSize="xs" color="gray.600" fontStyle="italic">No configurable properties</Text>
                        )}
                    </VStack>
                </VStack>
            )}
        </InspectorPanel>
    );
};
