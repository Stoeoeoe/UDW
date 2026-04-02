import React, { useEffect } from 'react';
import { useDisclosure, VStack } from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { EmptyScreen } from '../common/EmptyScreen';
import { MapViewportPixi } from './MapViewportPixi';
import { MapCreator } from '../../dialogs/MapCreator';
import { PropertiesPanel } from '../../panels/PropertiesPanel';
import { ToolPropertiesPanel } from '../../panels/ToolPropertiesPanel';
import { TilesetPalette } from '../../tileset/TilesetPalette';
import { MapBrowser } from './MapBrowser';
import { EntityBottomPalette } from '../entity/EntityBottomPalette';
import { EditorModal } from '../../common/EditorModal';
import { resolveMapContext } from '../../../lib/mapUtils';

/** Right panel: entity inspector when on entity layer, otherwise tool props + tile inspector */
const MapRightPanel: React.FC<{ isEntityLayer: boolean }> = ({ isEntityLayer }) => (
  <VStack align="stretch" spacing={0} h="full" overflow="auto">
    {isEntityLayer ? (
      <PropertiesPanel />
    ) : (
      <>
        <ToolPropertiesPanel />
        <PropertiesPanel />
      </>
    )}
  </VStack>
);

/**
 * Combined left panel: Map browser (maps + variations) on top, layers on bottom
 */
const MapLeftPanel: React.FC = () => {
  return (
    <VStack align="stretch" spacing={0} h="full" overflow="hidden">
      <MapBrowser />
    </VStack>
  );
};

/**
 * MapEditor - The complete map editing experience.
 * Provides: canvas viewport, layers panel, properties inspector, tileset palette.
 */
export const MapEditor: React.FC = () => {
  const currentMap = useEditorStore((state) => state.currentMap);
  const currentMapPath = useEditorStore((state) => state.currentMapPath);
  const maps = useEditorStore((state) => state.maps);
  const activeVariationId = useEditorStore((state) => state.activeVariationId);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const setActiveTool = useEditorStore((state) => state.setActiveTool);
  const { isOpen, onOpen, onClose } = useDisclosure();

  // When a map becomes active (different map), switch to tile paint tool by default
  // Use mapPath instead of map object to avoid triggering on every tile edit
  useEffect(() => {
    if (currentMapPath) {
      setActiveTool('stamp');
    }
  }, [currentMapPath, setActiveTool]);

  // No map loaded state — show map browser on left with empty content on right
  if (!currentMap) {
    // If we have maps, show the browser so user can select one
    if (maps.length > 0) {
      return (
        <ResizableEditorLayout
          header={{
            title: 'Maps',
            subtitle: `${maps.length} map${maps.length !== 1 ? 's' : ''} in project`,
          }}
          content={
            <EmptyScreen
              icon="👈"
              title="Select a Map"
              description="Choose a map from the browser to start editing."
            />
          }
          leftPanel={<MapLeftPanel />}
          leftPanelDefaultSize={20}
        />
      );
    }

    // No maps at all
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

  const effectiveMap = resolveMapContext(currentMap, activeVariationId);
  const activeVariation = currentMap.variations?.find(
    (variation) => variation.id === activeVariationId,
  );
  const isEntityLayer =
    currentMap.layers.find((l) => l.id === selectedLayerId)?.kind === 'entity';

  return (
    <ResizableEditorLayout
      header={{
        title: effectiveMap.name || 'Map',
        subtitle: `${currentMap.width}×${currentMap.height} tiles • ${currentMap.layers.length} layers${activeVariation ? ` • ${activeVariation.displayName}` : ''}`,
      }}
      content={<MapViewportPixi />}
      leftPanel={<MapLeftPanel />}
      rightPanel={<MapRightPanel isEntityLayer={isEntityLayer} />}
      bottomPanel={isEntityLayer ? <EntityBottomPalette /> : <TilesetPalette enableMultiSelect={true} />}
      leftPanelDefaultSize={20}
      rightPanelDefaultSize={20}
      bottomPanelDefaultSize={25}
    />
  );
};

export default MapEditor;
