import React, { useEffect } from 'react';
import { useDisclosure, Modal, ModalOverlay, ModalContent } from '@chakra-ui/react';
// icons
import { useEditorStore } from '../../../store/useEditorStore';
import { EditorLayout } from '../common/EditorLayout';
import { EmptyScreen } from '../common/EmptyScreen';
import { MapViewport } from './MapViewport';
import { MapCreator } from '../../dialogs/MapCreator';
import { PropertiesPanel } from '../../panels/PropertiesPanel';
import { TilesetPalette } from '../../tileset/TilesetPalette';
import { LayersPanel } from './LayersPanel';

/**
 * MapEditor - The complete map editing experience.
 * Provides: canvas viewport, layers panel, properties inspector, tileset palette.
 */
export const MapEditor: React.FC = () => {
    const currentMap = useEditorStore(state => state.currentMap);
    const setActiveTool = useEditorStore(state => state.setActiveTool);
    const { isOpen, onOpen, onClose } = useDisclosure();


    // When a map becomes active, switch to tile paint tool by default
    useEffect(() => {
        if (currentMap) {
            setActiveTool('tilePaint');
        }
    }, [currentMap, setActiveTool]);

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
