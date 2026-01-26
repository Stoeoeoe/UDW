import React, { useState } from 'react';
import { VStack, Box, HStack, Text, Input, Button, Circle, Spacer, useToast } from '@chakra-ui/react';
import { ListPanel, ListPanelItem, InspectorPanel, EmptyScreen } from '../common';
import { EditorLayout } from '../common/EditorLayout';
import { useEditorStore } from '../../../store/useEditorStore';

export const TerrainEditor: React.FC = () => {
    const terrainTypes = useEditorStore(state => state.terrainTypes);
    const selectedTerrainId = useEditorStore(state => state.selectedTerrainId);
    const setSelectedTerrain = useEditorStore(state => state.setSelectedTerrain);
    const addTerrainType = useEditorStore(state => state.addTerrainType);
    const updateTerrainType = useEditorStore(state => state.updateTerrainType);
    const deleteTerrainType = useEditorStore(state => state.deleteTerrainType);

    const toast = useToast();

    const items: ListPanelItem[] = terrainTypes.map(t => ({
        id: t.id,
        label: t.displayName,
        sublabel: t.id,
        icon: <Circle size="10px" bg={t.color} />,
    }));

    const selected = terrainTypes.find(t => t.id === selectedTerrainId) || null;

    const [editName, setEditName] = useState(selected?.displayName || '');
    const [editId, setEditId] = useState(selected?.id || '');
    const [editColor, setEditColor] = useState(selected?.color || '#3182ce');

    // Sync local edit fields when selection changes
    React.useEffect(() => {
        setEditName(selected?.displayName || '');
        setEditId(selected?.id || '');
        setEditColor(selected?.color || '#3182ce');
    }, [selected]);

    const handleAdd = () => {
        const id = `terrain-${Date.now()}`;
        addTerrainType({ id, displayName: 'New Terrain', color: '#3182ce' });
        setSelectedTerrain(id);
        toast({ title: 'Terrain created', status: 'success', duration: 1500 });
    };

    const handleSave = () => {
        if (!selected) return;
        // If ID changed, delete+recreate (simple approach)
        if (editId !== selected.id) {
            deleteTerrainType(selected.id);
            addTerrainType({ id: editId, displayName: editName, color: editColor });
            setSelectedTerrain(editId);
        } else {
            updateTerrainType(selected.id, { displayName: editName, color: editColor });
        }
        toast({ title: 'Terrain updated', status: 'success', duration: 1200 });
    };

    const handleDelete = () => {
        if (!selected) return;
        if (!confirm(`Delete terrain "${selected.displayName}"?`)) return;
        deleteTerrainType(selected.id);
        setSelectedTerrain(null);
        toast({ title: 'Terrain deleted', status: 'info', duration: 1200 });
    };

    const leftPanel = (
        <ListPanel
            title="Terrain Types"
            items={items}
            selectedId={selectedTerrainId}
            onSelect={(id) => setSelectedTerrain(id)}
            onAdd={handleAdd}
            autoSelectFirst={true}
            emptyMessage="No terrain types defined"
        />
    );

    const rightPanel = (
        <InspectorPanel
            title={selected?.displayName || 'Terrain'}
            subtitle={selected?.id}
            emptyState={
                <Box>
                    <Text color="gray.500">No terrain selected</Text>
                </Box>
            }
        >
            {selected && (
                <VStack align="stretch" spacing={3}>
                    <Box>
                        <Text fontSize="10px" fontWeight="black" textTransform="uppercase" color="gray.500" mb={1}>ID</Text>
                        <Input value={editId} onChange={(e) => setEditId(e.target.value)} bg="gray.950" />
                    </Box>

                    <Box>
                        <Text fontSize="10px" fontWeight="black" textTransform="uppercase" color="gray.500" mb={1}>Display Name</Text>
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} bg="gray.950" />
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
                <Text fontSize="lg" fontWeight="bold" color="white">{selected.displayName}</Text>
                <Text fontSize="sm" color="gray.400">{selected.id}</Text>
            </VStack>
            <Text color="gray.500" maxW="480px" textAlign="center">This terrain color is used by autotile tools and the tileset Wang editor for corner painting.</Text>
        </VStack>
    ) : (
        <EmptyScreen
            icon="🟦"
            title="No Terrains"
            description="Create terrain types to use in autotiling and labeling."
            buttonLabel="Create Terrain"
            onCreate={handleAdd}
        />
    );

    return (
        <EditorLayout
            header={{ title: 'Terrain', subtitle: `${terrainTypes.length} types` }}
            content={content}
            leftPanel={leftPanel}
            rightPanel={rightPanel}
            leftWidth="260px"
            rightWidth="340px"
        />
    );
};

export default TerrainEditor;
