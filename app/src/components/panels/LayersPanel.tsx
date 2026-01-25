import React from 'react';
import {
    Box,
    Flex,
    Text,
    VStack,
    IconButton,
    HStack,
    useToast,
} from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { DeleteIcon, AddIcon } from '@chakra-ui/icons';

// Icon helpers
const EyeOpen = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z" /><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z" /></svg>;
const EyeClosed = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z" /><path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829l.822.822zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z" /><path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z" /></svg>;
const Lock = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM5 8h6a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /></svg>;

export const LayersPanel: React.FC = () => {
    const currentMap = useEditorStore(state => state.currentMap);
    const selectedLayerId = useEditorStore(state => state.selectedLayerId);
    const selectLayer = useEditorStore(state => state.selectLayer);
    const toggleVisibility = useEditorStore(state => state.toggleLayerVisibility);
    const addLayer = useEditorStore(state => state.addLayer);
    const removeLayer = useEditorStore(state => state.removeLayer);
    const toast = useToast();

    if (!currentMap) {
        return (
            <Box p="4" fontSize="xs" color="gray.500" fontStyle="italic" textAlign="center" mt="10">
                No active map.
            </Box>
        );
    }

    const layers = [...currentMap.layers].reverse();

    const handleAddLayer = () => {
        const name = prompt("Enter layer name:");
        if (!name) return;

        const id = `layer-${Date.now()}`;
        addLayer({
            id,
            name,
            kind: 'visual',
            visible: true,
            locked: false,
            opacity: 1,
            zOrder: currentMap.layers.length,
            data: Array(currentMap.height).fill(null).map(() => Array(currentMap.width).fill(null))
        });
        selectLayer(id);
    };

    const handleDeleteLayer = (id: string, name: string) => {
        if (confirm(`Delete layer "${name}"?`)) {
            removeLayer(id);
            toast({ title: "Layer removed", status: "info", duration: 2000 });
        }
    };

    return (
        <Flex direction="column" h="full" bg="gray.900" color="gray.200">
            {/* Header */}
            <Flex p="3" borderBottom="1px" borderColor="gray.800" align="center" justify="space-between" bg="gray.950">
                <Text fontSize="10px" fontWeight="black" textTransform="uppercase" letterSpacing="widest" color="gray.500">
                    Layers
                </Text>
                <IconButton
                    aria-label="Add Layer"
                    icon={<AddIcon fontSize="10px" />}
                    size="xs"
                    variant="ghost"
                    color="gray.400"
                    _hover={{ color: 'white', bg: 'gray.800' }}
                    onClick={handleAddLayer}
                />
            </Flex>

            {/* List */}
            <Box flex={1} overflowY="auto" p={1}>
                <VStack spacing={1} align="stretch">
                    {layers.map(layer => (
                        <Box
                            key={layer.id}
                            onClick={() => selectLayer(layer.id)}
                            px="3"
                            py="2"
                            rounded="md"
                            cursor="pointer"
                            bg={layer.id === selectedLayerId ? "blue.900" : "transparent"}
                            border="1px"
                            borderColor={layer.id === selectedLayerId ? "blue.500" : "transparent"}
                            _hover={{ bg: layer.id === selectedLayerId ? "blue.900" : "whiteAlpha.50" }}
                            transition="all 0.1s"
                        >
                            <HStack spacing={2}>
                                {/* Visibility Toggle */}
                                <IconButton
                                    aria-label="Toggle Visibility"
                                    icon={layer.visible ? <EyeOpen /> : <EyeClosed />}
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
                                    {layer.locked && <Lock />}
                                    <Box fontSize="8px" fontWeight="bold" textTransform="uppercase" fontFamily="mono" bg="blackAlpha.500" px="1" rounded="sm" color="gray.500">
                                        {layer.kind[0]}
                                    </Box>
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
                                </HStack>
                            </HStack>
                        </Box>
                    ))}
                </VStack>
            </Box>
        </Flex>
    );
};
