import React from 'react';
import { VStack, Text, Center, Circle, HStack, Box } from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { ListPanel, ListPanelItem, InspectorPanel, InspectorEmptyState } from '../common';
import { DEFAULT_ENTITY_TYPES } from '../../../lib/defaultEntities';

/**
 * EntityEditor - Browse and configure entity blueprints.
 * Provides: entity type list, entity blueprint inspector.
 */
export const EntityEditor: React.FC = () => {
    const selectedEntityTypeId = useEditorStore(state => state.selectedEntityTypeId);
    const setSelectedEntityType = useEditorStore(state => state.setSelectedEntityType);

    // Build entity type list items
    const entityItems: ListPanelItem[] = DEFAULT_ENTITY_TYPES.map(type => ({
        id: type.id,
        label: type.displayName,
        sublabel: type.category.toUpperCase(),
        icon: <Circle size="10px" bg={type.placeholderColor} />,
    }));

    const selectedType = DEFAULT_ENTITY_TYPES.find(t => t.id === selectedEntityTypeId);


    // Left panel: entity type list
    const leftPanel = (
        <ListPanel
            title="Entity Types"
            items={entityItems}
            selectedId={selectedEntityTypeId}
            onSelect={setSelectedEntityType}
            autoSelectFirst={true}
            emptyMessage="No entity types defined"
        />
    );

    // Right panel: entity type inspector
    const rightPanel = (
        <InspectorPanel
            title={selectedType?.displayName || 'Entity'}
            subtitle={selectedType?.category}
            emptyState={
                <InspectorEmptyState
                    icon="🎯"
                    message="No Entity Selected"
                    hint="Select an entity type to view its properties"
                />
            }
        >
            {selectedType && (
                <VStack align="stretch" spacing={4}>
                    <Box>
                        <Text fontSize="10px" fontWeight="black" textTransform="uppercase" color="gray.500" mb={1}>
                            ID
                        </Text>
                        <Text fontSize="xs" fontFamily="mono" color="gray.300">{selectedType.id}</Text>
                    </Box>

                    <Box>
                        <Text fontSize="10px" fontWeight="black" textTransform="uppercase" color="gray.500" mb={1}>
                            Category
                        </Text>
                        <Text fontSize="xs" color="gray.300">{selectedType.category}</Text>
                    </Box>

                    <Box>
                        <Text fontSize="10px" fontWeight="black" textTransform="uppercase" color="gray.500" mb={1}>
                            Properties
                        </Text>
                        {selectedType.properties.length === 0 ? (
                            <Text fontSize="xs" color="gray.600" fontStyle="italic">No configurable properties</Text>
                        ) : (
                            <VStack align="stretch" spacing={1}>
                                {selectedType.properties.map((prop: { key: string; label: string; type: string }) => (
                                    <HStack key={prop.key} justify="space-between">
                                        <Text fontSize="xs" color="gray.400">{prop.label}</Text>
                                        <Text fontSize="xs" color="gray.600" fontFamily="mono">{prop.type}</Text>
                                    </HStack>
                                ))}
                            </VStack>
                        )}
                    </Box>
                </VStack>
            )}
        </InspectorPanel>
    );

    // Main content: placeholder for future entity canvas/preview
    const content = (
        <Center w="full" h="full">
            <VStack spacing={4}>
                <Text fontSize="6xl">🎯</Text>
                <Text color="white" fontWeight="bold" fontSize="xl">Entity Editor</Text>
                <Text color="gray.500" textAlign="center" maxW="300px">
                    Browse entity blueprints. Place entities on maps using the Map Editor.
                </Text>

                <Box mt={4} p={4} bg="blue.900" rounded="md" border="1px" borderColor="blue.800" maxW="300px">
                    <VStack spacing={1} align="start">
                        <Text fontSize="9px" fontWeight="black" color="blue.200" textTransform="uppercase">Tip</Text>
                        <Text fontSize="xs" color="blue.100">
                            Select an entity type from the list, then switch to Map Editor to place it on your map.
                        </Text>
                    </VStack>
                </Box>
            </VStack>
        </Center>
    );

    return (
        <ResizableEditorLayout
            header={{
                title: 'Entities',
                subtitle: `${DEFAULT_ENTITY_TYPES.length} entity types`,
            }}
            content={content}
            leftPanel={leftPanel}
            rightPanel={rightPanel}
            leftPanelDefaultSize={18}
            rightPanelDefaultSize={22}
        />
    );
};

export default EntityEditor;
