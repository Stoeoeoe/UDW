import React, { useEffect } from 'react';
import { VStack, Text, Center, Flex, Box, useDisclosure, Modal, ModalOverlay, ModalContent } from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { EditorLayout } from '../common/EditorLayout';
import { TilesetCanvas } from '../../tileset/TilesetCanvas';
import { TilesetInspector } from '../../tileset/TilesetInspector';
import { TilesetImporter } from '../../tileset/TilesetImporter';
import { ListPanel, ListPanelItem, EmptyScreen } from '../common';

/**
 * TilesetEditor - The complete tileset editing experience.
 * Provides: canvas viewport, tileset list, tile inspector.
 */
export const TilesetEditor: React.FC = () => {
    const activeTilesetId = useEditorStore(state => state.activeTilesetId);
    const tilesets = useEditorStore(state => state.tilesets);
    const setActiveTileset = useEditorStore(state => state.setActiveTileset);
    const selectedTileIndex = useEditorStore(state => state.selectedTileIndex);
    const selectedTileIndices = useEditorStore(state => state.selectedTileIndices);
    const setSelectedTile = useEditorStore(state => state.setSelectedTile);
    const setSelectedTiles = useEditorStore(state => state.setSelectedTiles);
    const toggleSelectedTile = useEditorStore(state => state.toggleSelectedTile);

    const handleTileSelect = (index: number, meta?: { ctrlKey?: boolean; shiftKey?: boolean }) => {
        if (meta?.ctrlKey) {
            toggleSelectedTile(index);
            setSelectedTile(index);
            return;
        }
        if (meta?.shiftKey && selectedTileIndices.length > 0) {
            const last = selectedTileIndices[selectedTileIndices.length - 1] ?? (selectedTileIndex ?? 0);
            const start = Math.min(last, index);
            const end = Math.max(last, index);
            const range: number[] = [];
            for (let i = start; i <= end; i++) range.push(i);
            setSelectedTiles(range);
            setSelectedTile(index);
            return;
        }
        setSelectedTiles([index]);
        setSelectedTile(index);
    };

    const activeTileset = activeTilesetId ? tilesets.get(activeTilesetId) : null;

    // Build tileset list items
    const tilesetItems: ListPanelItem[] = Array.from(tilesets.values()).map(ts => ({
        id: ts.id,
        label: ts.name,
        sublabel: `${ts.tileWidth}×${ts.tileHeight} • ${ts.tileCount} tiles`,
    }));

    // Left panel: tileset list
    const leftPanel = (
        <ListPanel
            title="Tilesets"
            items={tilesetItems}
            selectedId={activeTilesetId}
            onSelect={setActiveTileset}
            emptyMessage="No tilesets imported"
        />
    );

    // Auto-select first tileset when editor opens if tilesets exist
    useEffect(() => {
        if (tilesets.size > 0 && !activeTilesetId) {
            const first = Array.from(tilesets.values())[0];
            if (first) setActiveTileset(first.id);
        }
    }, [tilesets, activeTilesetId, setActiveTileset]);

    const { isOpen, onOpen, onClose } = useDisclosure();

    // Right panel: tile inspector (only if tileset active)
    const rightPanel = activeTileset ? (
        <TilesetInspector tileset={activeTileset} />
    ) : null;

    // No tileset active state — use EmptyScreen and allow quick import
    if (!activeTileset) {
        return (
            <>
                <EditorLayout
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

                <Modal isOpen={isOpen} onClose={onClose} size="xl" isCentered>
                    <ModalOverlay backdropFilter="blur(4px)" />
                    <ModalContent bg="transparent" border="none" boxShadow="none">
                        <TilesetImporter onImport={onClose} onCancel={onClose} />
                    </ModalContent>
                </Modal>
            </>
        );
    }

    return (
        <EditorLayout
            header={{
                title: activeTileset.name,
                subtitle: `${activeTileset.tileWidth}×${activeTileset.tileHeight} • ${activeTileset.columns} columns • ${activeTileset.tileCount} tiles`,
            }}
            content={
                <Flex h="full" overflow="hidden" position="relative">
                    <Box flex={1} position="relative">
                        <TilesetCanvas
                            tileset={activeTileset}
                            selectedIndex={selectedTileIndex}
                            onSelect={handleTileSelect}
                        />
                    </Box>
                </Flex>
            }
            leftPanel={leftPanel}
            rightPanel={rightPanel}
            leftWidth="240px"
            rightWidth="280px"
        />
    );
};

export default TilesetEditor;
