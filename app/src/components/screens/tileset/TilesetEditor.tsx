import React, { useEffect } from 'react';
import { Flex, Box, useDisclosure, IconButton, Tooltip, useToast, Text } from '@chakra-ui/react';
import { EditIcon, DeleteIcon } from '@chakra-ui/icons';
import { useEditorStore } from '../../../store/useEditorStore';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { TilesetCanvas } from '../../tileset/TilesetCanvas';
import { TilesetInspector } from '../../tileset/TilesetInspector';
import { TilesetTerrainPanel } from '../../tileset/TilesetTerrainPanel';
import TilesetMetadataDialog from '../../tileset/TilesetMetadataDialog';
import TilesetCreator from '../../dialogs/TilesetCreator';
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
  const resetSelectedTiles = useEditorStore((state) => state.resetSelectedTiles);

  const { selectedTileIndex, handleTileSelect } = useTileSelection();

  const activeTileset = activeTilesetId ? tilesets.get(activeTilesetId) : null;

  const tilesetItems: ListPanelItem[] = Array.from(tilesets.values()).map((ts) => ({
    id: ts.id,
    label: ts.name,
    sublabel: `${ts.tileWidth}×${ts.tileHeight} • ${ts.tileCount} tiles`,
  }));

  const toast = useToast();
  const { isOpen: isCreatorOpen, onOpen: onCreatorOpen, onClose: onCreatorClose } = useDisclosure();
  const { isOpen: isMetaOpen, onOpen: onMetaOpen, onClose: onMetaClose } = useDisclosure();

  const leftPanel = (
    <ListPanel
      title="Tilesets"
      items={tilesetItems}
      selectedId={activeTilesetId}
      onSelect={setActiveTileset}
      autoSelectFirst={true}
      emptyMessage="No tilesets imported"
      onAdd={onCreatorOpen}
      renderItem={(item, isSelected) => {
        const ts = Array.from(tilesets.values()).find((t) => t.id === item.id)!;
        return (
          <Box
            px={3}
            py={2}
            rounded="md"
            cursor={item.disabled ? 'not-allowed' : 'pointer'}
            bg={isSelected ? 'blue.900' : 'transparent'}
            border="1px"
            borderColor={isSelected ? 'blue.500' : 'transparent'}
            _hover={{ bg: isSelected ? 'blue.900' : 'whiteAlpha.50' }}
            transition="all 0.1s"
            role="group"
            onClick={() => !item.disabled && setActiveTileset(item.id)}
          >
            <Flex align="center" justify="space-between">
              <Box flex={1} minW={0}>
                <Text
                  fontSize="xs"
                  fontWeight={isSelected ? 'bold' : 'normal'}
                  color={isSelected ? 'white' : 'gray.200'}
                  noOfLines={1}
                >
                  {item.label}
                </Text>
                {item.sublabel && (
                  <Text fontSize="10px" color="gray.500">
                    {item.sublabel}
                  </Text>
                )}
              </Box>
              <Flex align="center" gap={1} opacity={0} _groupHover={{ opacity: 1 }}>
                <Tooltip label="Edit tileset" placement="right" hasArrow>
                  <IconButton
                    aria-label="Edit Tileset"
                    icon={<EditIcon fontSize="10px" />}
                    size="xs"
                    variant="ghost"
                    color="gray.400"
                    _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeTilesetId !== ts.id) setActiveTileset(ts.id);
                      onMetaOpen();
                    }}
                  />
                </Tooltip>
                <Tooltip label="Delete tileset" placement="right" hasArrow>
                  <IconButton
                    aria-label="Delete Tileset"
                    icon={<DeleteIcon fontSize="10px" />}
                    size="xs"
                    variant="ghost"
                    color="gray.400"
                    _hover={{ color: 'red.300', bg: 'whiteAlpha.100' }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (
                        confirm(
                          `Delete tileset "${ts.name}"? This removes metadata but not the image file.`,
                        )
                      ) {
                        try {
                          await useEditorStore.getState().deleteTileset(ts.id);
                          toast({ title: 'Tileset deleted', status: 'info' });
                        } catch (err: any) {
                          toast({
                            title: 'Failed to delete',
                            description: err.message,
                            status: 'error',
                          });
                        }
                      }
                    }}
                  />
                </Tooltip>
              </Flex>
            </Flex>
          </Box>
        );
      }}
    />
  );

  const rightPanel = activeTileset ? (
    tilesetMode === 'terrain' ? (
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
      </>
    );
  }

  return (
    <>
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

      <EditorModal isOpen={isCreatorOpen} onClose={onCreatorClose}>
        <TilesetCreator onCreate={onCreatorClose} onCancel={onCreatorClose} />
      </EditorModal>

      <TilesetMetadataDialog isOpen={isMetaOpen} onClose={onMetaClose} tileset={activeTileset} />
    </>
  );
};

export default TilesetEditor;
