import React, { useState, useRef } from 'react';
import {
    Box,
    Flex,
    Text,
    VStack,
    IconButton,
    HStack,
    useToast,
    Tooltip,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Input,
    Select,
    FormControl,
    FormLabel,
    useDisclosure,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { DeleteIcon, AddIcon, EditIcon, DragHandleIcon } from '@chakra-ui/icons';
import { Layer, LayerKind } from '../../../types/schema';
// react-icons for layer types and custom icons
import { 
    BsImage, BsShieldExclamation, BsCompass, BsInfoCircle,
    BsTree, BsBuilding, BsWater, BsLayersHalf, BsStack,
    BsEye, BsEyeSlash, BsLock, BsLink45Deg
} from 'react-icons/bs';

interface LayerFormData {
    name: string;
    kind: LayerKind;
    zOrder: number;
    icon: string;
}

// Layer type icon component
const LayerTypeIcon: React.FC<{ kind: LayerKind }> = ({ kind }) => {
    const iconProps = { size: 12 };
    switch (kind) {
        case 'visual': return <BsImage {...iconProps} />;
        case 'collision': return <BsShieldExclamation {...iconProps} />;
        case 'navigation': return <BsCompass {...iconProps} />;
        case 'metadata': return <BsInfoCircle {...iconProps} />;
        default: return <BsImage {...iconProps} />;
    }
};

// Map of available layer icons
const layerIconComponents: Record<string, React.FC<{ size?: number }>> = {
    tree: BsTree,
    building: BsBuilding,
    water: BsWater,
    ground: BsLayersHalf,
    overlay: BsStack,
};

const LayerIcon: React.FC<{ icon?: string; color?: string }> = ({ icon, color }) => {
    if (!icon) return null;
    const IconComponent = layerIconComponents[icon];
    if (!IconComponent) return null;
    return (
        <Box color={color || 'gray.400'}>
            <IconComponent size={12} />
        </Box>
    );
};

// Available icons for the dropdown
const availableIcons = [
    { value: '', label: 'None' },
    { value: 'tree', label: '🌳 Tree' },
    { value: 'building', label: '🏢 Building' },
    { value: 'water', label: '🌊 Water' },
    { value: 'ground', label: '📊 Ground' },
    { value: 'overlay', label: '📐 Overlay' },
];

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

    // Drag and drop state
    const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const dragNodeRef = useRef<HTMLDivElement | null>(null);

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

    // Drag and drop handlers
    const handleDragStart = (e: React.DragEvent, layerId: string) => {
        setDraggedLayerId(layerId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', layerId);
    };

    const handleDragOver = (e: React.DragEvent, layerId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (layerId !== draggedLayerId) {
            setDropTargetId(layerId);
        }
    };

    const handleDragLeave = () => {
        setDropTargetId(null);
    };

    const handleDrop = (e: React.DragEvent, targetLayerId: string) => {
        e.preventDefault();
        setDropTargetId(null);

        if (!draggedLayerId || draggedLayerId === targetLayerId || !currentMap) {
            setDraggedLayerId(null);
            return;
        }

        // Layers are displayed in reverse order (highest zOrder first)
        // So we need to work with the original order
        const sortedLayers = [...currentMap.layers].sort((a, b) => a.zOrder - b.zOrder);
        const draggedIndex = sortedLayers.findIndex(l => l.id === draggedLayerId);
        const targetIndex = sortedLayers.findIndex(l => l.id === targetLayerId);

        if (draggedIndex === -1 || targetIndex === -1) {
            setDraggedLayerId(null);
            return;
        }

        // Calculate new zOrder based on position
        let newZOrder: number;
        if (targetIndex === 0) {
            // Moving to the very bottom (lowest zOrder)
            newZOrder = sortedLayers[0].zOrder - 10;
        } else if (draggedIndex < targetIndex) {
            // Moving down in the list (dropping below target)
            const below = sortedLayers[targetIndex];
            const above = sortedLayers[targetIndex + 1];
            if (above) {
                newZOrder = Math.floor((below.zOrder + above.zOrder) / 2);
                // If there's no room, offset slightly
                if (newZOrder === below.zOrder) newZOrder = below.zOrder + 1;
            } else {
                newZOrder = below.zOrder + 10;
            }
        } else {
            // Moving up in the list (dropping above target)
            const above = sortedLayers[targetIndex];
            const below = sortedLayers[targetIndex - 1];
            if (below) {
                newZOrder = Math.floor((below.zOrder + above.zOrder) / 2);
                // If there's no room, offset slightly
                if (newZOrder === above.zOrder) newZOrder = above.zOrder - 1;
            } else {
                newZOrder = above.zOrder - 10;
            }
        }

        updateLayer(draggedLayerId, { zOrder: newZOrder });
        setDraggedLayerId(null);
    };

    const handleDragEnd = () => {
        setDraggedLayerId(null);
        setDropTargetId(null);
    };

    const handleDeleteLayer = (id: string, name: string) => {
        if (confirm(`Delete layer "${name}"?`)) {
            removeLayer(id);
            toast({ title: "Layer removed", status: "info", duration: 2000 });
        }
    };

    return (
        <>
        <Flex direction="column" h="full" bg="#03040a" color="gray.200">
            {/* Header */}
            <Flex p="3" borderBottom="1px" borderColor="#071018" align="center" justify="space-between" bg="#05060a">
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
                        const layerIcon = layer.icon || definition?.icon;
                        const iconColor = definition?.color;
                        const isDragging = draggedLayerId === layer.id;
                        const isDropTarget = dropTargetId === layer.id;

                        return (
                        <Box
                            key={layer.id}
                            ref={isDragging ? dragNodeRef : undefined}
                            draggable={!isFromDefinition}
                            onDragStart={!isFromDefinition ? (e) => handleDragStart(e, layer.id) : undefined}
                            onDragOver={(e) => handleDragOver(e, layer.id)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, layer.id)}
                            onDragEnd={handleDragEnd}
                            onClick={() => selectLayer(layer.id)}
                            px="2"
                            py="2"
                            rounded="md"
                            cursor={isFromDefinition ? "pointer" : "grab"}
                            bg={layer.id === selectedLayerId ? "blue.900" : "transparent"}
                            border="2px"
                            borderColor={isDropTarget ? "blue.400" : layer.id === selectedLayerId ? "blue.500" : "transparent"}
                            borderStyle={isDropTarget ? "dashed" : "solid"}
                            _hover={{ bg: layer.id === selectedLayerId ? "blue.900" : "whiteAlpha.50" }}
                            transition="all 0.1s"
                            opacity={isDragging ? 0.5 : 1}
                        >
                            <HStack spacing={2}>
                                {/* Drag Handle - hidden for definition layers */}
                                <Box color={isFromDefinition ? "gray.800" : "gray.600"} cursor={isFromDefinition ? "default" : "grab"} _hover={isFromDefinition ? {} : { color: 'gray.400' }} w="14px">
                                    {!isFromDefinition && <DragHandleIcon fontSize="10px" />}
                                </Box>

                                {/* Layer Icon - 16px reserved space */}
                                <Box w="16px" h="16px" display="flex" alignItems="center" justifyContent="center" flexShrink={0}>
                                    {layerIcon ? (
                                        <Tooltip label={isFromDefinition ? `From: ${definition!.name}` : undefined} fontSize="xs" isDisabled={!isFromDefinition}>
                                            <Box><LayerIcon icon={layerIcon} color={iconColor} /></Box>
                                        </Tooltip>
                                    ) : null}
                                </Box>

                                {/* Visibility Toggle */}
                                <IconButton
                                    aria-label="Toggle Visibility"
                                    icon={layer.visible ? <BsEye size={12} /> : <BsEyeSlash size={12} />}
                                    size="xs"
                                    variant="ghost"
                                    color={layer.visible ? "blue.400" : "gray.600"}
                                    _hover={{ bg: 'transparent', color: 'blue.300' }}
                                    onClick={(e) => { e.stopPropagation(); toggleVisibility(layer.id); }}
                                />

                                {/* Name */}
                                <Text flex={1} fontSize="xs" fontWeight={layer.id === selectedLayerId ? "bold" : "normal"} color={!layer.visible ? "gray.600" : "inherit"}>
                                    {layer.name}
                                </Text>

                                {/* Action Icons */}
                                <HStack spacing="1">
                                    {layer.locked && <BsLock size={12} />}
                                    {/* Layer Type Icon */}
                                    <Tooltip label={layer.kind} fontSize="xs">
                                        <Box color="gray.500">
                                            <LayerTypeIcon kind={layer.kind} />
                                        </Box>
                                    </Tooltip>
                                    {/* Link button for definition layers, edit button for custom layers */}
                                    {isFromDefinition ? (
                                        <Tooltip label="Go to layer definition" fontSize="xs">
                                            <IconButton
                                                aria-label="Go to definition"
                                                icon={<BsLink45Deg size={14} />}
                                                size="xs"
                                                variant="ghost"
                                                color="gray.500"
                                                _hover={{ color: 'blue.400' }}
                                                onClick={(e) => { e.stopPropagation(); handleGoToDefinition(definition!.id); }}
                                            />
                                        </Tooltip>
                                    ) : (
                                        <Tooltip label="Edit layer" fontSize="xs">
                                            <IconButton
                                                aria-label="Edit layer"
                                                icon={<EditIcon fontSize="10px" />}
                                                size="xs"
                                                variant="ghost"
                                                color="gray.500"
                                                _hover={{ color: 'blue.400' }}
                                                onClick={(e) => { e.stopPropagation(); handleOpenEditModal(layer); }}
                                            />
                                        </Tooltip>
                                    )}
                                    {/* Only allow deleting custom layers */}
                                    {!isFromDefinition && (
                                        <IconButton
                                            aria-label="Delete"
                                            icon={<DeleteIcon fontSize="10px" />}
                                            size="xs"
                                            variant="ghost"
                                            colorScheme="red"
                                            opacity={0.3}
                                            _hover={{ opacity: 1 }}
                                            onClick={(e) => { e.stopPropagation(); handleDeleteLayer(layer.id, layer.name); }}
                                        />
                                    )}
                                </HStack>
                            </HStack>
                        </Box>
                        );
                    })}
                </VStack>
            </Box>
        </Flex>

            {/* Add/Edit Layer Modal */}
            <Modal isOpen={isOpen} onClose={onClose} size="sm" isCentered>
                <ModalOverlay backdropFilter="blur(4px)" />
                <ModalContent bg="gray.900" border="1px" borderColor="gray.700">
                    <ModalHeader fontSize="md" pb={2}>
                        {editingLayer ? 'Edit Layer' : 'Add Layer'}
                    </ModalHeader>
                    <ModalBody>
                        <VStack spacing={4} align="stretch">
                            <FormControl>
                                <FormLabel fontSize="xs" fontWeight="bold" textTransform="uppercase" color="gray.500">
                                    Name
                                </FormLabel>
                                <Input
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Layer name"
                                    size="sm"
                                    bg="gray.800"
                                    autoFocus
                                />
                            </FormControl>

                            <FormControl>
                                <FormLabel fontSize="xs" fontWeight="bold" textTransform="uppercase" color="gray.500">
                                    Type
                                </FormLabel>
                                <Select
                                    value={formData.kind}
                                    onChange={(e) => setFormData({ ...formData, kind: e.target.value as LayerKind })}
                                    size="sm"
                                    bg="gray.800"
                                >
                                    <option value="visual">Visual (Tiles)</option>
                                    <option value="collision">Collision</option>
                                    <option value="navigation">Navigation</option>
                                    <option value="metadata">Metadata</option>
                                </Select>
                            </FormControl>

                            <FormControl>
                                <FormLabel fontSize="xs" fontWeight="bold" textTransform="uppercase" color="gray.500">
                                    Z-Order
                                </FormLabel>
                                <Input
                                    type="number"
                                    value={formData.zOrder}
                                    onChange={(e) => setFormData({ ...formData, zOrder: parseInt(e.target.value, 10) || 0 })}
                                    size="sm"
                                    bg="gray.800"
                                />
                                <Text fontSize="10px" color="gray.500" mt={1}>
                                    Lower values render first (behind higher values)
                                </Text>
                            </FormControl>

                            <FormControl>
                                <FormLabel fontSize="xs" fontWeight="bold" textTransform="uppercase" color="gray.500">
                                    Icon
                                </FormLabel>
                                <Select
                                    value={formData.icon}
                                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                                    size="sm"
                                    bg="gray.800"
                                >
                                    {availableIcons.map(icon => (
                                        <option key={icon.value} value={icon.value}>{icon.label}</option>
                                    ))}
                                </Select>
                            </FormControl>
                        </VStack>
                    </ModalBody>
                    <ModalFooter pt={4}>
                        <Button variant="ghost" size="sm" mr={2} onClick={onClose}>
                            Cancel
                        </Button>
                        <Button colorScheme="blue" size="sm" onClick={handleSave}>
                            {editingLayer ? 'Save Changes' : 'Create Layer'}
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </>
    );
};
