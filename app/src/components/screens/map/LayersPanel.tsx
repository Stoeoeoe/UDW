import React, { useState } from 'react';
import {
    Box,
    Flex,
    Text,
    VStack,
    IconButton,
    useToast,
    useDisclosure,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { AddIcon } from '@chakra-ui/icons';
import { Layer } from '../../../types/schema';
import { useLayerDragDrop } from '../../../hooks/useLayerDragDrop';
import { LayerItem } from './LayerItem';
import { LayerModal, LayerFormData } from './LayerModal';

/**
 * LayersPanel - Refactored to use extracted components.
 * Displays and manages map layers with drag-and-drop reordering.
 */
export const LayersPanel: React.FC = () => {
    const currentMap = useEditorStore(state => state.currentMap);
    const selectedLayerId = useEditorStore(state => state.selectedLayerId);
    const selectLayer = useEditorStore(state => state.selectLayer);
    const toggleVisibility = useEditorStore(state => state.toggleLayerVisibility);
    const addLayer = useEditorStore(state => state.addLayer);
    const updateLayer = useEditorStore(state => state.updateLayer);
    const removeLayer = useEditorStore(state => state.removeLayer);
    const layerDefinitions = useEditorStore(state => state.layerDefinitions);
    const setMode = useEditorStore(state => state.setMode);
    const setSelectedLayerDefinition = useEditorStore(state => state.setSelectedLayerDefinition);
    const toast = useToast();

    const { isOpen, onOpen, onClose } = useDisclosure();
    const [editingLayer, setEditingLayer] = useState<Layer | null>(null);
    const [formData, setFormData] = useState<LayerFormData>({ name: '', kind: 'visual', zOrder: 0, icon: '' });

    // Use the extracted drag-and-drop hook
    const {
        draggedLayerId,
        dropTargetId,
        dragNodeRef,
        handleDragStart,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        handleDragEnd,
    } = useLayerDragDrop();

    if (!currentMap) {
        return (
            <Box p="4" fontSize="xs" color="gray.500" fontStyle="italic" textAlign="center" mt="10">
                No active map.
            </Box>
        );
    }

    const layers = [...currentMap.layers].reverse();

    // Helper to find matching layer definition
    const getLayerDefinition = (layer: typeof layers[0]) => {
        if (layer.definitionId) {
            return layerDefinitions.find(d => d.id === layer.definitionId);
        }
        return null;
    };

    const handleGoToDefinition = (definitionId: string) => {
        setSelectedLayerDefinition(definitionId);
        setMode('layers');
    };

    const handleOpenAddModal = () => {
        setEditingLayer(null);
        setFormData({
            name: '',
            kind: 'visual',
            zOrder: currentMap.layers.length,
            icon: '',
        });
        onOpen();
    };

    const handleOpenEditModal = (layer: Layer) => {
        setEditingLayer(layer);
        setFormData({
            name: layer.name,
            kind: layer.kind,
            zOrder: layer.zOrder,
            icon: layer.icon || '',
        });
        onOpen();
    };

    const handleSave = () => {
        if (!formData.name.trim()) {
            toast({ title: 'Please enter a layer name', status: 'warning', duration: 2000 });
            return;
        }

        if (editingLayer) {
            // Update existing layer
            updateLayer(editingLayer.id, {
                name: formData.name,
                kind: formData.kind,
                zOrder: formData.zOrder,
                icon: formData.icon || undefined,
            });
            toast({ title: 'Layer updated', status: 'success', duration: 1500 });
        } else {
            // Add new layer
            const id = `layer-${Date.now()}`;
            addLayer({
                id,
                name: formData.name,
                kind: formData.kind,
                visible: true,
                locked: false,
                opacity: 1,
                zOrder: formData.zOrder,
                icon: formData.icon || undefined,
                data: Array(currentMap.height).fill(null).map(() => Array(currentMap.width).fill(null))
            });
            selectLayer(id);
            toast({ title: 'Layer created', status: 'success', duration: 1500 });
        }

        onClose();
    };

    const handleDeleteLayer = (id: string, name: string) => {
        if (confirm(`Delete layer "${name}"?`)) {
            removeLayer(id);
            toast({ title: "Layer removed", status: "info", duration: 2000 });
        }
    };

    return (
        <>
            <Flex direction="column" h="full" bg="editor.panelBg" color="gray.200">
                {/* Header */}
                <Flex p="3" borderBottom="1px" borderColor="editor.border" align="center" justify="space-between" bg="editor.headerBg">
                    <Text fontSize="10px" fontWeight="black" textTransform="uppercase" letterSpacing="widest" color="gray.500">
                        Layers
                    </Text>
                    <IconButton
                        aria-label="Add Layer"
                        icon={<AddIcon fontSize="10px" />}
                        size="xs"
                        variant="ghost"
                        color="gray.400"
                        _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
                        onClick={handleOpenAddModal}
                    />
                </Flex>

                {/* List */}
                <Box flex={1} overflowY="auto" p={1}>
                    <VStack spacing={1} align="stretch">
                        {layers.map(layer => {
                            const definition = getLayerDefinition(layer);
                            const isFromDefinition = !!definition;
                            const isDragging = draggedLayerId === layer.id;
                            const isDropTarget = dropTargetId === layer.id;

                            return (
                                <LayerItem
                                    key={layer.id}
                                    layer={layer}
                                    isSelected={layer.id === selectedLayerId}
                                    isDragging={isDragging}
                                    isDropTarget={isDropTarget}
                                    isFromDefinition={isFromDefinition}
                                    definition={definition}
                                    onSelect={selectLayer}
                                    onToggleVisibility={toggleVisibility}
                                    onEdit={handleOpenEditModal}
                                    onDelete={handleDeleteLayer}
                                    onGoToDefinition={handleGoToDefinition}
                                    onDragStart={!isFromDefinition ? handleDragStart : undefined}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onDragEnd={handleDragEnd}
                                    dragNodeRef={dragNodeRef}
                                />
                            );
                        })}
                    </VStack>
                </Box>
            </Flex>

            {/* Add/Edit Layer Modal */}
            <LayerModal
                isOpen={isOpen}
                onClose={onClose}
                onSave={handleSave}
                formData={formData}
                setFormData={setFormData}
                isEditing={!!editingLayer}
            />
        </>
    );
};

export default LayersPanel;
