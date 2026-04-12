import React, { useEffect, useMemo, useState } from 'react';
import { Flex, Box, useDisclosure, useToast, Text, VStack, Button } from '@chakra-ui/react';
import { EditIcon, DeleteIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../../store/useEditorStore';
import { useProject } from '../../../hooks/useProject';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { TilesetCanvas } from '../../tileset/TilesetCanvas';
import { TilesetInspector } from '../../tileset/TilesetInspector';
import { TilesetTerrainPanel } from '../../tileset/TilesetTerrainPanel';
import TilesetMetadataDialog from '../../tileset/TilesetMetadataDialog';
import TilesetCreator from '../../dialogs/TilesetCreator';
import { ListPanel, ListPanelItem, EmptyScreen } from '../common';
import { EditorModal } from '../../common/EditorModal';
import { useTileSelection } from '../../../hooks/useTileSelection';
import TileMetadataDefinitionsDialog from '../../tileset/TileMetadataDefinitionsDialog';
import TilesetMetadataEntryInspector from '../../tileset/TilesetMetadataEntryInspector';

/**
 * TilesetEditor - The complete tileset editing experience.
 * Provides: canvas viewport, tileset list, tile inspector.
 */
export const TilesetEditor: React.FC = () => {
  const tilesetMode = useEditorStore((state) => state.tilesetToolMode);
  const activeTilesetId = useEditorStore((state) => state.activeTilesetId);
  const tilesets = useEditorStore((state) => state.tilesets);
  const setActiveTileset = useEditorStore((state) => state.setActiveTileset);
  const resetSelectedTiles = useEditorStore((state) => state.resetSelectedTiles);
  const tileMetadataDefinitions = useEditorStore((state) => state.tileMetadataDefinitions);
  const setTileMetadataDefinitions = useEditorStore((state) => state.setTileMetadataDefinitions);

  const { selectedTileIndex, handleTileSelect } = useTileSelection();
  const { tileSize } = useProject();

  const activeTileset = activeTilesetId ? tilesets.get(activeTilesetId) : null;

  const tilesetItems: ListPanelItem[] = Array.from(tilesets.values()).map((ts) => ({
    id: ts.id,
    label: ts.name,
    sublabel: `${tileSize}×${tileSize} • ${ts.tileCount} tiles`,
  }));

  const metadataItems: ListPanelItem[] = useMemo(
    () =>
      tileMetadataDefinitions.map((definition) => ({
        id: definition.key,
        label: definition.label || definition.key,
        sublabel: `${definition.type}${definition.required ? ' • required' : ''}`,
      })),
    [tileMetadataDefinitions],
  );

  const [selectedMetadataKey, setSelectedMetadataKey] = useState<string | null>(null);

  const toast = useToast();
  const { isOpen: isCreatorOpen, onOpen: onCreatorOpen, onClose: onCreatorClose } = useDisclosure();
  const { isOpen: isMetaOpen, onOpen: onMetaOpen, onClose: onMetaClose } = useDisclosure();
  const {
    isOpen: isMetadataDefsOpen,
    onOpen: onMetadataDefsOpen,
    onClose: onMetadataDefsClose,
  } = useDisclosure();

  const selectedMetadataDefinition = useMemo(
    () =>
      selectedMetadataKey
        ? tileMetadataDefinitions.find((definition) => definition.key === selectedMetadataKey) ||
          null
        : null,
    [selectedMetadataKey, tileMetadataDefinitions],
  );

  const handleSelectTileset = (id: string) => {
    setSelectedMetadataKey(null);
    setActiveTileset(id);
    resetSelectedTiles?.();
  };

  const handleSelectMetadata = (id: string) => {
    setSelectedMetadataKey(id);
    resetSelectedTiles?.();
  };

  const handleCreateMetadataDefinition = async (
    definition: (typeof tileMetadataDefinitions)[number],
  ) => {
    await setTileMetadataDefinitions([...tileMetadataDefinitions, definition]);
    setSelectedMetadataKey(definition.key);
  };

  const tilesetListPanel = (
    <ListPanel
      title="Tilesets"
      items={tilesetItems}
      selectedId={activeTilesetId}
      onSelect={handleSelectTileset}
      autoSelectFirst={true}
      emptyMessage="No tilesets imported"
      onAdd={onCreatorOpen}
      itemActions={(item) => [
        {
          id: 'edit',
          label: 'Edit tileset',
          icon: <EditIcon fontSize="10px" />,
          ariaLabel: 'Edit Tileset',
          onClick: () => {
            if (activeTilesetId !== item.id) handleSelectTileset(item.id);
            onMetaOpen();
          },
        },
        {
          id: 'delete',
          label: 'Delete tileset',
          icon: <DeleteIcon fontSize="10px" />,
          ariaLabel: 'Delete Tileset',
          hoverColor: 'red.300',
          onClick: async () => {
            const ts = tilesets.get(item.id);
            if (!ts) return;

            if (
              confirm(`Delete tileset "${ts.name}"? This removes metadata but not the image file.`)
            ) {
              try {
                await useEditorStore.getState().deleteTileset(ts.id);
                toast({ title: 'Tileset deleted', status: 'info' });
              } catch (err: unknown) {
                toast({
                  title: 'Failed to delete',
                  description: err instanceof Error ? err.message : 'Unknown error',
                  status: 'error',
                });
              }
            }
          },
        },
      ]}
    />
  );

  const metadataListPanel = (
    <ListPanel
      title="Metadata"
      items={metadataItems}
      selectedId={selectedMetadataKey}
      onSelect={handleSelectMetadata}
      onAdd={onMetadataDefsOpen}
      emptyMessage="No metadata fields defined"
      onDeleteItem={async (item) => {
        const nextDefinitions = tileMetadataDefinitions.filter(
          (definition) => definition.key !== item.id,
        );
        await setTileMetadataDefinitions(nextDefinitions);
        if (selectedMetadataKey === item.id) {
          setSelectedMetadataKey(null);
        }
      }}
      deleteActionLabel="Delete metadata field"
    />
  );

  const leftPanel = (
    <Flex direction="column" h="full">
      <Box flex={3} minH={0}>
        {tilesetListPanel}
      </Box>
      <Box h="1px" bg="editor.border" />
      <Box flex={2} minH={0}>
        {metadataListPanel}
      </Box>
    </Flex>
  );

  const rightPanel = activeTileset ? (
    selectedMetadataDefinition ? (
      <TilesetMetadataEntryInspector
        tileset={activeTileset}
        selectedTileIndex={selectedTileIndex}
        metadataDefinition={selectedMetadataDefinition}
        metadataDefinitions={tileMetadataDefinitions}
        onMetadataDefinitionsChange={setTileMetadataDefinitions}
      />
    ) : tilesetMode === 'terrain' ? (
      <TilesetTerrainPanel tileset={activeTileset} />
    ) : (
      <TilesetInspector tileset={activeTileset} selectedIndex={selectedTileIndex} />
    )
  ) : null;

  useEffect(() => {
    if (activeTilesetId) {
      resetSelectedTiles?.();
    }
  }, [activeTilesetId, resetSelectedTiles]);

  useEffect(() => {
    if (!selectedMetadataKey) return;
    const stillExists = tileMetadataDefinitions.some(
      (definition) => definition.key === selectedMetadataKey,
    );
    if (!stillExists) {
      setSelectedMetadataKey(null);
    }
  }, [selectedMetadataKey, tileMetadataDefinitions]);

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
          header={{
            title: activeTileset.name,
            subtitle: `${tileSize}×${tileSize} • ${activeTileset.columns} columns • ${activeTileset.tileCount} tiles`,
          }}
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
          leftPanel={leftPanel}
          rightPanel={rightPanel}
          leftPanelDefaultSize={18}
          rightPanelDefaultSize={22}
        />

        <EditorModal isOpen={isCreatorOpen} onClose={onCreatorClose}>
          <TilesetCreator onCreate={onCreatorClose} onCancel={onCreatorClose} />
        </EditorModal>

        <EditorModal isOpen={isMetadataDefsOpen} onClose={onMetadataDefsClose}>
          <TileMetadataDefinitionsDialog
            existingDefinitions={tileMetadataDefinitions}
            onCreate={handleCreateMetadataDefinition}
            onClose={onMetadataDefsClose}
          />
        </EditorModal>
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
          leftPanel={leftPanel}
        />
        <EditorModal isOpen={isCreatorOpen} onClose={onCreatorClose}>
          <TilesetCreator onCreate={onCreatorClose} onCancel={onCreatorClose} />
        </EditorModal>

        <EditorModal isOpen={isMetadataDefsOpen} onClose={onMetadataDefsClose}>
          <TileMetadataDefinitionsDialog
            existingDefinitions={tileMetadataDefinitions}
            onCreate={handleCreateMetadataDefinition}
            onClose={onMetadataDefsClose}
          />
        </EditorModal>
      </>
    );
  }

  return (
    <>
      <ResizableEditorLayout
        header={{
          title: activeTileset.name,
          subtitle: `${tileSize}×${tileSize} • ${activeTileset.columns} columns • ${activeTileset.tileCount} tiles`,
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

      <EditorModal isOpen={isCreatorOpen} onClose={onCreatorClose}>
        <TilesetCreator onCreate={onCreatorClose} onCancel={onCreatorClose} />
      </EditorModal>

      <EditorModal isOpen={isMetadataDefsOpen} onClose={onMetadataDefsClose}>
        <TileMetadataDefinitionsDialog
          existingDefinitions={tileMetadataDefinitions}
          onCreate={handleCreateMetadataDefinition}
          onClose={onMetadataDefsClose}
        />
      </EditorModal>

      <TilesetMetadataDialog isOpen={isMetaOpen} onClose={onMetaClose} tileset={activeTileset} />
    </>
  );
};

export default TilesetEditor;
