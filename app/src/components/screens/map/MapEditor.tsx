import React, { useEffect } from 'react';
import { useDisclosure, VStack } from '@chakra-ui/react';
// icons
import { useEditorStore } from '../../../store/useEditorStore';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { EmptyScreen } from '../common/EmptyScreen';
import { MapViewportPixi } from './MapViewportPixi';
import { MapCreator } from '../../dialogs/MapCreator';
import { PropertiesPanel } from '../../panels/PropertiesPanel';
import { ToolPropertiesPanel } from '../../panels/ToolPropertiesPanel';
import { TilesetPalette } from '../../tileset/TilesetPalette';
import { LayersPanel } from './LayersPanel';
import { EditorModal } from '../../common/EditorModal';

/**
 * Combined right panel showing tool properties and entity inspector
 */
const MapRightPanel: React.FC = () => {
    return (
        <VStack align="stretch" spacing={0} h="full" overflow="auto">
            <ToolPropertiesPanel />
            <PropertiesPanel />
        </VStack>
    );
};

/**
 * MapEditor - The complete map editing experience.
 * Provides: canvas viewport, layers panel, properties inspector, tileset palette.
 */
export const MapEditor: React.FC = () => {
    const currentMap = useEditorStore(state => state.currentMap);
    const currentMapPath = useEditorStore(state => state.currentMapPath);
    const setActiveTool = useEditorStore(state => state.setActiveTool);
    const { isOpen, onOpen, onClose } = useDisclosure();


    // When a map becomes active (different map), switch to tile paint tool by default
    // Use mapPath instead of map object to avoid triggering on every tile edit
    useEffect(() => {
        if (currentMapPath) {
            setActiveTool('stamp');
        }
    }, [currentMapPath, setActiveTool]);

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

                <EditorModal isOpen={isOpen} onClose={onClose}>
                    <MapCreator onCreate={onClose} onCancel={onClose} />
                </EditorModal>
            </>
        );
    }


    return (
        <ResizableEditorLayout
            header={{
                title: currentMap.name || 'Map',
                subtitle: `${currentMap.width}×${currentMap.height} tiles • ${currentMap.layers.length} layers`,
            }}
            content={<MapViewportPixi />}
            leftPanel={<LayersPanel />}
            rightPanel={<MapRightPanel />}
            bottomPanel={<TilesetPalette enableMultiSelect={true} />}
            leftPanelDefaultSize={18}
            rightPanelDefaultSize={20}
            bottomPanelDefaultSize={25}
        />
    );
};

export default MapEditor;
