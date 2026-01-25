import React from 'react';
import { VStack, Text, Center, Button, useDisclosure, Modal, ModalOverlay, ModalContent } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../../store/useEditorStore';
import { EditorLayout } from '../common/EditorLayout';
import { MapViewport } from '../../viewport/MapViewport';
import { MapCreator } from '../../dialogs/MapCreator';
import { LayersPanel } from '../../panels/LayersPanel';
import { PropertiesPanel } from '../../panels/PropertiesPanel';
import { TilesetPalette } from '../../tileset/TilesetPalette';

/**
 * MapEditor - The complete map editing experience.
 * Provides: canvas viewport, layers panel, properties inspector, tileset palette.
 */
export const MapEditor: React.FC = () => {
    const currentMap = useEditorStore(state => state.currentMap);
    const { isOpen, onOpen, onClose } = useDisclosure();

    // No map loaded state
    if (!currentMap) {
        return (
            <Center w="full" h="full" bg="#0a0a0b">
                <VStack spacing={6}>
                    <VStack spacing={2}>
                        <Text fontSize="6xl">🗺️</Text>
                        <Text color="white" fontWeight="bold" fontSize="xl">No Map Active</Text>
                        <Text color="gray.500">Create a new map to start building your world.</Text>
                    </VStack>
                    <Button
                        leftIcon={<AddIcon />}
                        colorScheme="blue"
                        size="lg"
                        onClick={onOpen}
                        px={8}
                    >
                        Create First Map
                    </Button>
                </VStack>

                <Modal isOpen={isOpen} onClose={onClose} size="xl" isCentered>
                    <ModalOverlay backdropFilter="blur(4px)" />
                    <ModalContent bg="transparent" border="none" boxShadow="none">
                        <MapCreator onCreate={onClose} onCancel={onClose} />
                    </ModalContent>
                </Modal>
            </Center>
        );
    }

    return (
        <EditorLayout
            header={{
                title: currentMap.name || 'Map',
                subtitle: `${currentMap.width}×${currentMap.height} tiles • ${currentMap.layers.length} layers`,
            }}
            content={<MapViewport />}
            leftPanel={<LayersPanel />}
            rightPanel={<PropertiesPanel />}
            bottomPanel={<TilesetPalette />}
            leftWidth="240px"
            rightWidth="280px"
            bottomHeight="220px"
        />
    );
};

export default MapEditor;
