import React, { useState } from 'react';
import { VStack, Box, HStack, Text, Input, Button, Circle, Spacer, Select, useToast } from '@chakra-ui/react';
import { ListPanel, ListPanelItem, InspectorPanel, EmptyScreen } from '../common';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { useEditorStore } from '../../../store/useEditorStore';
import { LayerType } from '../../../types/schema';
import { BsTree, BsBuilding, BsWater, BsLayersHalf, BsStack } from 'react-icons/bs';

// Icon components for layer definitions
const layerIconComponents: Record<string, React.FC<{ size?: number }>> = {
    tree: BsTree,
    building: BsBuilding,
    water: BsWater,
    ground: BsLayersHalf,
    overlay: BsStack,
};

const LayerDefIcon: React.FC<{ icon?: string; color: string }> = ({ icon, color }) => {
    if (!icon || !layerIconComponents[icon]) {
        return <Circle size="10px" bg={color} />;
    }
    const IconComponent = layerIconComponents[icon];
    return (
        <Box color={color}>
            <IconComponent size={14} />
        </Box>
    );
};

export const LayerEditor: React.FC = () => {
    const layerDefinitions = useEditorStore(state => state.layerDefinitions);
    const selectedLayerDefinitionId = useEditorStore(state => state.selectedLayerDefinitionId);
    const setSelectedLayerDefinition = useEditorStore(state => state.setSelectedLayerDefinition);
    const addLayerDefinition = useEditorStore(state => state.addLayerDefinition);
    const updateLayerDefinition = useEditorStore(state => state.updateLayerDefinition);
    const deleteLayerDefinition = useEditorStore(state => state.deleteLayerDefinition);

    const toast = useToast();

    const items: ListPanelItem[] = layerDefinitions
        .slice()
        .sort((a, b) => a.zIndex - b.zIndex)
        .map(def => ({
            id: def.id,
            label: def.name,
            sublabel: `Z: ${def.zIndex} • ${def.type}`,
            icon: <LayerDefIcon icon={def.icon} color={def.color} />,
        }));

    const selected = layerDefinitions.find(d => d.id === selectedLayerDefinitionId) || null;

    const [editName, setEditName] = useState(selected?.name || '');
    const [editId, setEditId] = useState(selected?.id || '');
    const [editColor, setEditColor] = useState(selected?.color || '#3182ce');
    const [editType, setEditType] = useState<LayerType>(selected?.type || 'tile');
    const [editZIndex, setEditZIndex] = useState(selected?.zIndex ?? 0);
    const [editDescription, setEditDescription] = useState(selected?.description || '');
    const [editIcon, setEditIcon] = useState(selected?.icon || '');

    // Available icons
    const availableIcons = [
        { value: '', label: 'None' },
        { value: 'tree', label: '🌳 Tree' },
        { value: 'building', label: '🏢 Building' },
        { value: 'water', label: '🌊 Water' },
        { value: 'ground', label: '📊 Ground' },
        { value: 'overlay', label: '📐 Overlay' },
    ];

    // Sync local edit fields when selection changes
    React.useEffect(() => {
        setEditName(selected?.name || '');
        setEditId(selected?.id || '');
        setEditColor(selected?.color || '#3182ce');
        setEditType(selected?.type || 'tile');
        setEditZIndex(selected?.zIndex ?? 0);
        setEditDescription(selected?.description || '');
        setEditIcon(selected?.icon || '');
    }, [selected]);

    const handleAdd = () => {
        const id = `layer-${Date.now()}`;
        const nextZIndex = layerDefinitions.length > 0
            ? Math.max(...layerDefinitions.map(d => d.zIndex)) + 1
            : 0;
        addLayerDefinition({
            id,
            name: 'New Layer',
            type: 'tile',
            color: '#3182ce',
            zIndex: nextZIndex,
            icon: undefined,
        });
        setSelectedLayerDefinition(id);
        toast({ title: 'Layer definition created', status: 'success', duration: 1500 });
    };

    const handleSave = () => {
        if (!selected) return;
        // If ID changed, delete+recreate (simple approach)
        if (editId !== selected.id) {
            deleteLayerDefinition(selected.id);
            addLayerDefinition({
                id: editId,
                name: editName,
                type: editType,
                color: editColor,
                zIndex: editZIndex,
                icon: editIcon || undefined,
                description: editDescription || undefined,
            });
            setSelectedLayerDefinition(editId);
        } else {
            updateLayerDefinition(selected.id, {
                name: editName,
                type: editType,
                color: editColor,
                zIndex: editZIndex,
                icon: editIcon || undefined,
                description: editDescription || undefined,
            });
        }
        toast({ title: 'Layer definition updated', status: 'success', duration: 1200 });
    };

    const handleDelete = () => {
        if (!selected) return;
        if (!confirm(`Delete layer definition "${selected.name}"?`)) return;
        deleteLayerDefinition(selected.id);
        setSelectedLayerDefinition(null);
        toast({ title: 'Layer definition deleted', status: 'info', duration: 1200 });
    };

    const leftPanel = (
        <ListPanel
            title="Layer Definitions"
            items={items}
            selectedId={selectedLayerDefinitionId}
            onSelect={(id) => setSelectedLayerDefinition(id)}
            onAdd={handleAdd}
            autoSelectFirst
            emptyMessage="No layer definitions"
        />
    );

    const rightPanel = (
        <InspectorPanel
            title={selected?.name || 'Layer'}
            subtitle={selected?.id}
            emptyState={
                <Box>
                    <Text color="gray.500">No layer selected</Text>
                </Box>
            }
        >
            {selected && (
                <VStack align="stretch" spacing={3}>
                    <Box>
                        <Text fontSize="10px" fontWeight="black" textTransform="uppercase" color="gray.500" mb={1}>ID</Text>
                        <Input value={editId} onChange={(e) => setEditId(e.target.value)} bg="gray.950" size="sm" />
                    </Box>

                    <Box>
                        <Text fontSize="10px" fontWeight="black" textTransform="uppercase" color="gray.500" mb={1}>Name</Text>
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} bg="gray.950" size="sm" />
                    </Box>

                    <Box>
                        <Text fontSize="10px" fontWeight="black" textTransform="uppercase" color="gray.500" mb={1}>Type</Text>
                        <Select
                            value={editType}
                            onChange={(e) => setEditType(e.target.value as LayerType)}
                            bg="gray.950"
                            size="sm"
                        >
                            <option value="tile">Tile</option>
                            <option value="entity">Entity</option>
                        </Select>
                    </Box>

                    <Box>
                        <Text fontSize="10px" fontWeight="black" textTransform="uppercase" color="gray.500" mb={1}>Z-Index</Text>
                        <Input
                            type="number"
                            value={editZIndex}
                            onChange={(e) => setEditZIndex(parseInt(e.target.value, 10) || 0)}
                            bg="gray.950"
                            size="sm"
                        />
                    </Box>

                    <Box>
                        <Text fontSize="10px" fontWeight="black" textTransform="uppercase" color="gray.500" mb={1}>Description</Text>
                        <Input
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            bg="gray.950"
                            size="sm"
                            placeholder="Optional description"
                        />
                    </Box>

                    <Box>
                        <Text fontSize="10px" fontWeight="black" textTransform="uppercase" color="gray.500" mb={1}>Icon</Text>
                        <Select
                            value={editIcon}
                            onChange={(e) => setEditIcon(e.target.value)}
                            bg="gray.950"
                            size="sm"
                        >
                            {availableIcons.map(icon => (
                                <option key={icon.value} value={icon.value}>{icon.label}</option>
                            ))}
                        </Select>
                    </Box>

                    <Box>
                        <Text fontSize="10px" fontWeight="black" textTransform="uppercase" color="gray.500" mb={1}>Color</Text>
                        <HStack>
                            <Input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} w="16" h="10" p={0} />
                            <Spacer />
                            <Button colorScheme="red" size="sm" onClick={handleDelete}>Delete</Button>
                            <Button colorScheme="blue" size="sm" onClick={handleSave}>Save</Button>
                        </HStack>
                    </Box>
                </VStack>
            )}
        </InspectorPanel>
    );

    const content = selected ? (
        <VStack spacing={6} align="center" justify="center" h="full">
            <Circle size="120px" bg={selected.color} boxShadow="0 6px 18px rgba(0,0,0,0.6)" />
            <VStack spacing={1}>
                <Text fontSize="lg" fontWeight="bold" color="white">{selected.name}</Text>
                <Text fontSize="sm" color="gray.400">{selected.id}</Text>
                <HStack spacing={2} mt={2}>
                    <Box px={2} py={1} bg="gray.800" rounded="md">
                        <Text fontSize="xs" color="gray.300">Type: {selected.type}</Text>
                    </Box>
                    <Box px={2} py={1} bg="gray.800" rounded="md">
                        <Text fontSize="xs" color="gray.300">Z-Index: {selected.zIndex}</Text>
                    </Box>
                </HStack>
            </VStack>
            <Text color="gray.500" maxW="480px" textAlign="center">
                This layer definition will be automatically created in all new maps. Existing maps will show this layer if it matches by ID.
            </Text>
        </VStack>
    ) : (
        <EmptyScreen
            icon="📚"
            title="No Layer Definitions"
            description="Create layer definitions to establish default layers for all maps in your project."
            buttonLabel="Create Layer"
            onCreate={handleAdd}
        />
    );

    return (
        <ResizableEditorLayout
            header={{ title: 'Layers', subtitle: `${layerDefinitions.length} definitions` }}
            content={content}
            leftPanel={leftPanel}
            rightPanel={rightPanel}
            leftPanelDefaultSize={20}
            rightPanelDefaultSize={25}
        />
    );
};

export default LayerEditor;
