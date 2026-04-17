import React from 'react';
import { useDisclosure, VStack } from '@chakra-ui/react';
import { runEditorHistoryCommand, useEditorStore } from '../../../store/useEditorStore';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { EmptyScreen } from '../common/EmptyScreen';
import { MapViewportPixi } from './MapViewportPixi';
import { MapCreator } from '../../dialogs/MapCreator';
import { PropertiesPanel } from '../../panels/PropertiesPanel';
import { ToolPropertiesPanel } from '../../panels/ToolPropertiesPanel';
import { LinkInspector } from './LinkInspector';
import { AnchorInspector } from './AnchorInspector';
import { TriggerInspector } from './TriggerInspector';
import { TilesetPalette } from '../../tileset/TilesetPalette';
import { MapBrowser } from './MapBrowser';
import { EntityBottomPalette } from '../entity/EntityBottomPalette';
import { AnchorBottomPanel } from './AnchorBottomPanel';
import { LinkBottomPanel } from './LinkBottomPanel';
import { TriggerBottomPanel } from './TriggerBottomPanel';
import { NewLinkDialog } from './NewLinkDialog';
import { EditorModal } from '../../common/EditorModal';
import { resolveMapContext } from '../../../lib/mapUtils';
import { Button, HStack } from '@chakra-ui/react';
import { MapWorldView } from './MapWorldView.tsx';

/**
 * Right panel — always shows the inspector for whatever is *selected*.
 * Selection takes priority over layer context:
 *   selectedLink    → LinkInspector
 *   selectedAnchor  → AnchorInspector
 *   selectedEntity  → PropertiesPanel
 *   nothing         → ToolPropertiesPanel (tile/terrain tools)
 */
const MapRightPanel: React.FC = () => {
  const selectedLinkId = useEditorStore((s) => s.selectedLinkId);
  const selectedAnchorId = useEditorStore((s) => s.selectedAnchorId);
  const selectedTriggerId = useEditorStore((s) => s.selectedTriggerId);
  const selectedEntityId = useEditorStore((s) => s.selectedEntityId);

  return (
    <VStack align="stretch" spacing={0} h="full" overflow="auto">
      {selectedLinkId ? (
        <LinkInspector />
      ) : selectedAnchorId ? (
        <AnchorInspector />
      ) : selectedTriggerId ? (
        <TriggerInspector />
      ) : selectedEntityId ? (
        <PropertiesPanel />
      ) : (
        <>
          <ToolPropertiesPanel />
          <PropertiesPanel />
        </>
      )}
    </VStack>
  );
};

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
  const maps = useEditorStore((state) => state.maps);
  const activeVariationId = useEditorStore((state) => state.activeVariationId);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const pendingNewLinkId = useEditorStore((state) => state.pendingNewLinkId);
  const clearPendingNewLink = useEditorStore((state) => state.clearPendingNewLink);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [activeView, setActiveView] = React.useState<'canvas' | 'world'>('canvas');

  const viewToggle = (
    <HStack spacing={1}>
      <Button
        size="xs"
        variant={activeView === 'canvas' ? 'solid' : 'ghost'}
        colorScheme={activeView === 'canvas' ? 'blue' : undefined}
        onClick={() => setActiveView('canvas')}
      >
        Canvas
      </Button>
      <Button
        size="xs"
        variant={activeView === 'world' ? 'solid' : 'ghost'}
        colorScheme={activeView === 'world' ? 'blue' : undefined}
        onClick={() => setActiveView('world')}
      >
        World
      </Button>
    </HStack>
  );

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isPrimaryModifier = event.ctrlKey || event.metaKey;
      if (!isPrimaryModifier || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      const command =
        key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' ? 'redo' : null;

      if (!command) {
        return;
      }

      if (runEditorHistoryCommand(command, event.target)) {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // No map loaded state — show map browser on left with empty content on right
  if (!currentMap) {
    // If we have maps, show the browser so user can select one
    if (maps.length > 0) {
      const includedCount = maps.filter((map) => map.metadata?.world?.included).length;
      return (
        <ResizableEditorLayout
          header={{
            title: activeView === 'world' ? 'World' : 'Maps',
            subtitle:
              activeView === 'world'
                ? `${includedCount} map${includedCount !== 1 ? 's' : ''} placed in world`
                : `${maps.length} map${maps.length !== 1 ? 's' : ''} in project`,
            actions: viewToggle,
          }}
          content={
            activeView === 'world' ? (
              <MapWorldView />
            ) : (
              <EmptyScreen
                icon="👈"
                title="Select a Map"
                description="Choose a map from the browser to start editing."
              />
            )
          }
          leftPanel={
            activeView === 'world' ? (
              <VStack align="stretch" spacing={0} h="full" overflow="hidden">
                <MapBrowser showEditingPanels={false} />
              </VStack>
            ) : (
              <MapLeftPanel />
            )
          }
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
  const selectedLayerKind = currentMap.layers.find((l) => l.id === selectedLayerId)?.kind;

  return (
    <>
      <ResizableEditorLayout
        header={{
          title: activeView === 'world' ? 'World' : effectiveMap.name || 'Map',
          subtitle:
            activeView === 'world'
              ? `${maps.filter((map) => map.metadata?.world?.included).length} map${maps.filter((map) => map.metadata?.world?.included).length !== 1 ? 's' : ''} placed • ${maps.length} total`
              : `${currentMap.width}×${currentMap.height} tiles • ${currentMap.layers.length} layers${activeVariation ? ` • ${activeVariation.displayName}` : ''}`,
          actions: viewToggle,
        }}
        content={activeView === 'world' ? <MapWorldView /> : <MapViewportPixi />}
        leftPanel={
          activeView === 'world' ? (
            <VStack align="stretch" spacing={0} h="full" overflow="hidden">
              <MapBrowser showEditingPanels={false} />
            </VStack>
          ) : (
            <MapLeftPanel />
          )
        }
        rightPanel={activeView === 'world' ? undefined : <MapRightPanel />}
        bottomPanel={
          activeView === 'world' ? undefined : selectedLayerKind === 'entity' ? (
            <EntityBottomPalette />
          ) : selectedLayerKind === 'anchor' ? (
            <AnchorBottomPanel />
          ) : selectedLayerKind === 'locationlink' ? (
            <LinkBottomPanel />
          ) : selectedLayerKind === 'trigger' ? (
            <TriggerBottomPanel />
          ) : selectedLayerKind === 'terrain' ? null : (
            <TilesetPalette enableMultiSelect={true} />
          )
        }
        leftPanelDefaultSize={20}
        rightPanelDefaultSize={20}
        bottomPanelDefaultSize={25}
      />

      {/* New link setup dialog — appears immediately after placing a link */}
      <NewLinkDialog linkId={pendingNewLinkId} onClose={clearPendingNewLink} />
    </>
  );
};

export default MapEditor;
