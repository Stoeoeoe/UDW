import React from 'react';
import { VStack, Text, Center, Button, useDisclosure, Modal, ModalOverlay, ModalContent } from '@chakra-ui/react';
// icons
import { useEditorStore } from '../../../store/useEditorStore';
import { EditorLayout } from '../common/EditorLayout';
import { EmptyScreen } from '../common/EmptyScreen';
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

    // No map loaded state — use shared EmptyScreen
    if (!currentMap) {
        return (
            <>
                <EmptyScreen
                    icon="🗺️"
                    title="No Map Active"
                    description="Create a new map to start building your world."
                    buttonLabel="Create First Map"
                    onCreate={onOpen}
                />

                <Modal isOpen={isOpen} onClose={onClose} size="xl" isCentered>
                    <ModalOverlay backdropFilter="blur(4px)" />
                    <ModalContent bg="transparent" border="none" boxShadow="none">
                        <MapCreator onCreate={onClose} onCancel={onClose} />
                    </ModalContent>
                </Modal>
            </>
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
