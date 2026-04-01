import React, { useEffect } from 'react';
import { Flex, Box, useDisclosure } from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { TilesetCanvas } from '../../tileset/TilesetCanvas';
import { TilesetInspector } from '../../tileset/TilesetInspector';
import { TilesetTerrainPanel } from '../../tileset/TilesetTerrainPanel';
import { TilesetImporter } from '../../tileset/TilesetImporter';
import { ListPanel, ListPanelItem, EmptyScreen } from '../common';
import { EditorModal } from '../../common/EditorModal';
import { useTileSelection } from '../../../hooks/useTileSelection';

/**
 * TilesetEditor - The complete tileset editing experience.
 * Provides: canvas viewport, tileset list, tile inspector.
 */
export const TilesetEditor: React.FC = () => {
  const tilesetMode = useEditorStore((state) => state.tilesetToolMode);
  const activeTilesetId = useEditorStore((state) => state.activeTilesetId);
  const tilesets = useEditorStore((state) => state.tilesets);
  const setActiveTileset = useEditorStore((state) => state.setActiveTileset);
  const resetSelectedTiles = useEditorStore(
    (state) => state.resetSelectedTiles,
  );

  const { selectedTileIndex, handleTileSelect } = useTileSelection();

  const activeTileset = activeTilesetId ? tilesets.get(activeTilesetId) : null;

  // Build tileset list items
  const tilesetItems: ListPanelItem[] = Array.from(tilesets.values()).map(
    (ts) => ({
      id: ts.id,
      label: ts.name,
      sublabel: `${ts.tileWidth}×${ts.tileHeight} • ${ts.tileCount} tiles`,
    }),
  );

  // Left panel: tileset list
  const leftPanel = (
    <ListPanel
      title="Tilesets"
      items={tilesetItems}
      selectedId={activeTilesetId}
      onSelect={setActiveTileset}
      autoSelectFirst={true}
      emptyMessage="No tilesets imported"
    />
  );

  const { isOpen, onOpen, onClose } = useDisclosure();

  // Right panel: switch between inspector and terrain palette when tileset active
  const rightPanel = activeTileset ? (
    tilesetMode === 'terrain' ? (
      <TilesetTerrainPanel tileset={activeTileset} />
    ) : (
      <TilesetInspector
        tileset={activeTileset}
        selectedIndex={selectedTileIndex}
      />
    )
  ) : null;

  useEffect(() => {
    // Clear global editor selected tiles when a tileset becomes active
    if (activeTilesetId) {
      resetSelectedTiles?.();
    }
  }, [activeTilesetId, resetSelectedTiles]);
  // No tileset active state — use EmptyScreen and allow quick import
  if (!activeTileset) {
    return (
      <>
        <ResizableEditorLayout
          content={
            <EmptyScreen
              icon="🎨"
              title="No Tileset Active"
              description="Select or import a tileset from the sidebar."
              buttonLabel="Import Tileset"
              onCreate={onOpen}
            />
          }
          leftPanel={leftPanel}
        />

        <EditorModal isOpen={isOpen} onClose={onClose}>
          <TilesetImporter onImport={onClose} onCancel={onClose} />
        </EditorModal>
      </>
    );
  }

  return (
    <ResizableEditorLayout
      header={{
        title: activeTileset.name,
        subtitle: `${activeTileset.tileWidth}×${activeTileset.tileHeight} • ${activeTileset.columns} columns • ${activeTileset.tileCount} tiles`,
      }}
      content={
        <Flex h="full" overflow="hidden" position="relative">
          <Box
            flex={1}
            position="relative"
            display="flex"
            alignItems="center"
            justifyContent="center"
            h="full"
          >
            <TilesetCanvas
              tileset={activeTileset}
              selectedIndex={selectedTileIndex}
              onSelect={handleTileSelect}
              tool={tilesetMode}
            />
          </Box>
        </Flex>
      }
      leftPanel={leftPanel}
      rightPanel={rightPanel}
      leftPanelDefaultSize={18}
      rightPanelDefaultSize={22}
    />
  );
};

export default TilesetEditor;
