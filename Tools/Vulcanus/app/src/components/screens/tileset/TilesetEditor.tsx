import React, { useEffect } from 'react';
import { Flex, Box, useDisclosure, useToast, Text, VStack, Button } from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { useProject } from '../../../hooks/useProject';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { TilesetCanvas } from '../../tileset/TilesetCanvas';
import { TilesetInspector } from '../../tileset/TilesetInspector';
import { TilesetTerrainPanel } from '../../tileset/TilesetTerrainPanel';
import TilesetMetadataDialog from '../../tileset/TilesetMetadataDialog';
import { CreateTilesetDialog } from './CreateTilesetDialog';
import { EmptyScreen } from '../common';
import { useTileSelection } from '../../../hooks/useTileSelection';
import {
  buildPolygonCollision,
  FULL_TILE_POLYGON,
  getPolygonFromCollision,
} from '../../../lib/collisionUtils';

/**
 * TilesetEditor - The complete tileset editing experience.
 * Provides: canvas viewport, tileset list, tile inspector.
 */
export const TilesetEditor: React.FC = () => {
  const tilesetMode = useEditorStore((state) => state.tilesetToolMode);
  const activeTilesetId = useEditorStore((state) => state.activeTilesetId);
  const tilesets = useEditorStore((state) => state.tilesets);
  const resetSelectedTiles = useEditorStore((state) => state.resetSelectedTiles);
  const updateTileDefinition = useEditorStore((state) => state.updateTileDefinition);

  const { selectedTileIndex, handleTileSelect } = useTileSelection();
  const { tileSize } = useProject();

  const activeTileset = activeTilesetId ? tilesets.get(activeTilesetId) : null;

  const toast = useToast();
  const { isOpen: isCreatorOpen, onOpen: onCreatorOpen, onClose: onCreatorClose } = useDisclosure();
  const { isOpen: isMetaOpen, onClose: onMetaClose } = useDisclosure();

  const rightPanel = activeTileset ? (
    <Box h="full" overflowY="auto">
      {tilesetMode === 'terrain' ? (
        <TilesetTerrainPanel tileset={activeTileset} />
      ) : (
        <TilesetInspector tileset={activeTileset} selectedIndex={selectedTileIndex} />
      )}
    </Box>
  ) : null;

  useEffect(() => {
    if (activeTilesetId) {
      resetSelectedTiles?.();
    }
  }, [activeTilesetId, resetSelectedTiles]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tagName = target.tagName.toLowerCase();
      return (
        target.isContentEditable ||
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target.closest('[contenteditable="true"]') !== null
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isEditableTarget(event.target) ||
        !activeTileset ||
        selectedTileIndex === null
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const columns = Math.max(1, activeTileset.columns);
      const column = selectedTileIndex % columns;
      let nextTileIndex: number | null = null;

      if (key === 'arrowleft' && column > 0) {
        nextTileIndex = selectedTileIndex - 1;
      } else if (
        key === 'arrowright' &&
        column < columns - 1 &&
        selectedTileIndex + 1 < activeTileset.tileCount
      ) {
        nextTileIndex = selectedTileIndex + 1;
      } else if (key === 'arrowup' && selectedTileIndex - columns >= 0) {
        nextTileIndex = selectedTileIndex - columns;
      } else if (key === 'arrowdown' && selectedTileIndex + columns < activeTileset.tileCount) {
        nextTileIndex = selectedTileIndex + columns;
      }

      if (key.startsWith('arrow')) {
        event.preventDefault();
        if (nextTileIndex !== null) handleTileSelect(nextTileIndex);
        return;
      }

      if (event.repeat) return;

      const selectedTile = activeTileset.tiles[selectedTileIndex] ?? {};

      if (key === 'c') {
        if (selectedTile.collision?.type === 'full') return;

        event.preventDefault();
        updateTileDefinition(activeTileset.id, selectedTileIndex, {
          ...selectedTile,
          collision: { type: 'full' },
        });
        return;
      }

      if (key === 'n') {
        if (!selectedTile.collision || selectedTile.collision.type === 'none') return;

        event.preventDefault();
        updateTileDefinition(activeTileset.id, selectedTileIndex, {
          ...selectedTile,
          collision: { type: 'none' },
        });
        return;
      }

      if (key === 'p') {
        const existingPoints = getPolygonFromCollision(selectedTile.collision, tileSize);
        if (selectedTile.collision?.type === 'complex' && existingPoints.length >= 3) return;

        event.preventDefault();
        updateTileDefinition(activeTileset.id, selectedTileIndex, {
          ...selectedTile,
          collision: buildPolygonCollision(
            existingPoints.length >= 3 ? existingPoints : FULL_TILE_POLYGON,
          ),
        });
        return;
      }

      if (!/^\d$/.test(key)) return;

      const pivotY = Number(key);
      if ((selectedTile.pivotY ?? 1) === pivotY) return;

      event.preventDefault();
      updateTileDefinition(activeTileset.id, selectedTileIndex, {
        ...selectedTile,
        pivotY,
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTileset, handleTileSelect, selectedTileIndex, tileSize, updateTileDefinition]);

  // Extra store helpers for handling missing sprite replacement
  const loadedSprites = useEditorStore((s) => s.loadedSprites);
  const loadSprite = useEditorStore((s) => s.loadSprite);
  const updateTileset = useEditorStore((s) => s.updateTileset);

  const sprite = activeTileset ? loadedSprites.get(activeTileset.spriteSheet) : null;

  const handleSetImage = async () => {
    try {
      const { fileSystem } = await import('../../../lib/fileSystem');
      const rawPath = await fileSystem.selectAsset();
      if (!rawPath) return;
      const blob = await fileSystem.readFileAsBlob(rawPath);
      const name = rawPath.split(/[\\/]/).pop() || 'tileset.png';
      const internalPath = await fileSystem.saveAsset(name, blob);

      await updateTileset(activeTileset!.id, { spriteSheet: internalPath });
      try {
        await loadSprite(internalPath, blob);
      } catch (e) {
        console.warn('Failed to load sprite after setting image:', e);
      }
      toast({ title: 'Tileset image set', status: 'success' });
    } catch (e: unknown) {
      toast({
        title: 'Failed to set image',
        description: e instanceof Error ? e.message : String(e),
        status: 'error',
      });
    }
  };

  // If tileset metadata exists but sprite failed to load, show repair UI
  if (activeTileset && !sprite) {
    return (
      <>
        <ResizableEditorLayout
          content={
            <Flex h="full" alignItems="center" justifyContent="center">
              <VStack spacing={4} align="center">
                <Text fontSize="lg" fontWeight="black">
                  Tileset image missing
                </Text>
                <Text color="gray.400" maxW="xl" textAlign="center">
                  The image for this tileset could not be loaded (it may have been moved or
                  deleted). Choose a replacement image or re-import the tileset metadata.
                </Text>
                <VStack spacing={3} pt={4}>
                  <Button colorScheme="blue" onClick={handleSetImage}>
                    Choose Image
                  </Button>
                  <Button variant="ghost" onClick={onCreatorOpen}>
                    Import New Tileset
                  </Button>
                </VStack>
              </VStack>
            </Flex>
          }
          rightPanel={rightPanel}
          rightPanelDefaultSize={22}
        />

        <CreateTilesetDialog isOpen={isCreatorOpen} onClose={onCreatorClose} />
      </>
    );
  }

  if (!activeTileset) {
    return (
      <>
        <ResizableEditorLayout
          content={
            <EmptyScreen
              icon="🎨"
              title="No Tileset Active"
              description="Select or create a tileset from the sidebar."
              buttonLabel="Create Tileset"
              onCreate={onCreatorOpen}
            />
          }
        />
        <CreateTilesetDialog isOpen={isCreatorOpen} onClose={onCreatorClose} />
      </>
    );
  }

  return (
    <>
      <ResizableEditorLayout
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
                enableMultiSelect={tilesetMode === 'objects'}
              />
            </Box>
          </Flex>
        }
        rightPanel={rightPanel}
        rightPanelDefaultSize={22}
      />

      <CreateTilesetDialog isOpen={isCreatorOpen} onClose={onCreatorClose} />

      <TilesetMetadataDialog isOpen={isMetaOpen} onClose={onMetaClose} tileset={activeTileset} />
    </>
  );
};

export default TilesetEditor;
