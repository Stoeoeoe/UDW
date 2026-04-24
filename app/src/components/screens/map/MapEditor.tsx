import React from 'react';
import { Box, useDisclosure, VStack } from '@chakra-ui/react';
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
import { ObjectPalette } from '../../tileset/ObjectPalette';
import { EntityBottomPalette } from '../entity/EntityBottomPalette';
import { NavigationBottomPanel } from './NavigationBottomPanel';
import { NewLinkDialog } from './NewLinkDialog';
import { EditorModal } from '../../common/EditorModal';
import { resolveMapContext } from '../../../lib/mapUtils';
import { MapWorldView } from './MapWorldView.tsx';
import { LayersPanel } from './LayersPanel';
import { VariationManager } from './VariationManager';
import { MetadataDialog } from './MetadataDialog';

const MapRightPanel: React.FC = () => {
  const selectedLinkId = useEditorStore((state) => state.selectedLinkId);
  const selectedAnchorId = useEditorStore((state) => state.selectedAnchorId);
  const selectedTriggerId = useEditorStore((state) => state.selectedTriggerId);
  const selectedEntityId = useEditorStore((state) => state.selectedEntityId);
  const selectedObjectInstanceId = useEditorStore((state) => state.selectedObjectInstanceId);
  const currentMap = useEditorStore((state) => state.currentMap);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);

  const selectedLayerKind = currentMap?.layers.find((l) => l.id === selectedLayerId)?.kind;
  const showPropertiesInspector =
    selectedLayerKind === 'entity' ||
    selectedLayerKind === 'navigation' ||
    selectedLayerKind === 'object';

  return (
    <VStack align="stretch" spacing={0} h="full" overflow="auto">
      {selectedLinkId ? (
        <LinkInspector />
      ) : selectedAnchorId ? (
        <AnchorInspector />
      ) : selectedTriggerId ? (
        <TriggerInspector />
      ) : selectedEntityId || selectedObjectInstanceId ? (
        <PropertiesPanel />
      ) : (
        <>
          <ToolPropertiesPanel />
          {showPropertiesInspector && <PropertiesPanel />}
        </>
      )}
    </VStack>
  );
};

const MapLeftPanel: React.FC = () => {
  return (
    <VStack align="stretch" spacing={0} h="full" overflow="hidden">
      <Box
        flexShrink={0}
        minH="16rem"
        maxH="24rem"
        borderBottom="1px"
        borderColor="editorShellBorder"
      >
        <VariationManager />
      </Box>
      <Box flex={1} minH={0}>
        <LayersPanel />
      </Box>
    </VStack>
  );
};

export const MapEditor: React.FC = () => {
  const currentMap = useEditorStore((state) => state.currentMap);
  const activeVariationId = useEditorStore((state) => state.activeVariationId);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const pendingNewLinkId = useEditorStore((state) => state.pendingNewLinkId);
  const clearPendingNewLink = useEditorStore((state) => state.clearPendingNewLink);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isMetadataOpen,
    onOpen: onMetadataOpen,
    onClose: onMetadataClose,
  } = useDisclosure();
  const [activeView] = React.useState<'canvas' | 'world'>('canvas');
  const [metadataInitialTab, setMetadataInitialTab] = React.useState<'base' | 'variation'>('base');

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

  React.useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent | undefined;
      const focus = customEvent?.detail?.focus === 'variation' ? 'variation' : 'base';
      setMetadataInitialTab(focus);
      onMetadataOpen();
    };

    window.addEventListener('openMetadataDialog', handler as EventListener);
    return () => window.removeEventListener('openMetadataDialog', handler as EventListener);
  }, [onMetadataOpen]);

  if (!currentMap) {
    return (
      <>
        <EmptyScreen
          icon="Map"
          title="No Location Active"
          description="Open a location from the explorer or create a new map to start building your world."
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
  const selectedLayer = currentMap.layers.find((layer) => layer.id === selectedLayerId);
  const selectedLayerKind = selectedLayer?.kind;
  const isObjectLayer = selectedLayer?.kind === 'object';
  const subtitleParts = [
    `${currentMap.width}x${currentMap.height} tiles`,
    `${currentMap.layers.length} layers`,
  ];

  if (selectedLayer) {
    subtitleParts.push(isObjectLayer ? `${selectedLayer.name} - objects` : selectedLayer.name);
  }

  if (activeVariation) {
    subtitleParts.push(activeVariation.displayName);
  }

  return (
    <>
      <ResizableEditorLayout
        header={{
          title: activeView === 'world' ? 'World' : effectiveMap.name || 'Location',
          subtitle: activeView === 'world' ? 'Location world view' : subtitleParts.join(' - '),
        }}
        content={activeView === 'world' ? <MapWorldView /> : <MapViewportPixi />}
        leftPanel={<MapLeftPanel />}
        rightPanel={activeView === 'world' ? undefined : <MapRightPanel />}
        bottomPanel={
          activeView === 'world' ? undefined : selectedLayerKind === 'entity' ? (
            <EntityBottomPalette />
          ) : selectedLayerKind === 'navigation' ? (
            <NavigationBottomPanel />
          ) : isObjectLayer ? (
            <ObjectPalette />
          ) : selectedLayerKind === 'terrain' ? null : (
            <TilesetPalette enableMultiSelect={true} />
          )
        }
        leftPanelDefaultSize={18}
        rightPanelDefaultSize={22}
        bottomPanelDefaultSize={25}
      />

      <NewLinkDialog linkId={pendingNewLinkId} onClose={clearPendingNewLink} />
      <MetadataDialog
        isOpen={isMetadataOpen}
        onClose={onMetadataClose}
        initialTab={metadataInitialTab}
      />
    </>
  );
};

export default MapEditor;
