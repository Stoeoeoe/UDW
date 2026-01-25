import React, { useMemo, useState } from 'react';
import {
    Box,
    Flex,
    Text,
    IconButton,
    Select,
    Grid,
    Modal,
    ModalOverlay,
    ModalContent,
    useDisclosure,
} from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { TilesetImporter } from '../tileset/TilesetImporter';
import { Tileset, TileDefinition } from '../../types/schema';
import { fileSystem } from '../../lib/fileSystem';

export const TilesetPanel: React.FC = () => {
    const tilesets = useEditorStore(state => state.tilesets);
    const loadedSprites = useEditorStore(state => state.loadedSprites);
    const selectedTileId = useEditorStore(state => state.selectedTileId);
    const selectTile = useEditorStore(state => state.selectTile);
    const loadSprite = useEditorStore(state => state.loadSprite);

    const { isOpen: isImporterOpen, onOpen: openImporter, onClose: closeImporter } = useDisclosure();

    const [activeTilesetId, setActiveTilesetId] = useState<string | null>(
        tilesets.size > 0 ? Array.from(tilesets.keys())[0] : null
    );

    const activeTileset = activeTilesetId ? tilesets.get(activeTilesetId) : null;
    const activeSprite = activeTileset ? loadedSprites.get(activeTileset.spriteSheet) : null;

    // derived tiles list
    const tiles = useMemo(() => {
        if (!activeTileset) return [];
        return activeTileset.tiles;
    }, [activeTileset]);

    const handleImport = async (config: Tileset, file: File) => {
        try {
            // 1. Save the sprite image to assets/
            const spritePath = await fileSystem.saveAsset(file.name, file);

            // 2. Update config with actual saved path
            config.spriteSheet = spritePath;

            // 3. Load Sprite to Store
            await loadSprite(spritePath, file);

            // 4. Get image dimensions to calculate columns/count
            const img = useEditorStore.getState().loadedSprites.get(spritePath);
            if (!img) throw new Error("Failed to load sprite image");

            const columns = Math.floor(img.width / config.tileWidth);
            const rows = Math.floor(img.height / config.tileHeight);
            const tileCount = columns * rows;

            // 5. Generate default tiles
            const tiles: TileDefinition[] = [];
            for (let i = 0; i < tileCount; i++) {
                tiles.push({
                    id: `${config.id}_${i}`,
                    spriteIndex: i,
                    tags: [],
                    collision: 'none'
                });
            }

            const fullTileset: Tileset = {
                ...config,
                columns,
                tileCount,
                tiles
            };

            // 6. Save tileset to disk
            await fileSystem.saveTileset(fullTileset);

            // 7. Add to Store
            useEditorStore.setState(state => {
                state.tilesets.set(fullTileset.id, fullTileset);
            });

            setActiveTilesetId(fullTileset.id);
            closeImporter();

        } catch (e) {
            console.error(e);
            alert("Failed to import tileset: " + (e as Error).message);
        }
    };

    return (
        <Flex direction="column" h="full" bg="gray.900" color="gray.200" position="relative">
            {/* Header / Selector */}
            <Box p="3" borderBottom="1px" borderColor="gray.800">
                <Flex justify="space-between" align="center" mb="2">
                    <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="wider" color="gray.500">
                        Tilesets
                    </Text>
                    <IconButton
                        aria-label="Add Tileset"
                        icon={<Text fontSize="lg">+</Text>}
                        size="xs"
                        variant="ghost"
                        color="gray.500"
                        _hover={{ color: 'white', bg: 'gray.800' }}
                        onClick={openImporter}
                    />
                </Flex>

                {tilesets.size > 0 && (
                    <Select
                        size="xs"
                        bg="gray.800"
                        borderColor="gray.700"
                        _hover={{ borderColor: 'gray.600' }}
                        _focus={{ borderColor: 'blue.500', boxShadow: 'none' }}
                        value={activeTilesetId || ''}
                        onChange={(e) => setActiveTilesetId(e.target.value)}
                    >
                        {Array.from(tilesets.values()).map(ts => (
                            <option key={ts.id} value={ts.id}>{ts.name}</option>
                        ))}
                    </Select>
                )}
            </Box>

            {/* Tiles Grid */}
            <Box flex={1} overflowY="auto" p="2" bg="blackAlpha.200">
                {!activeTileset && (
                    <Text textAlign="center" fontSize="xs" color="gray.600" mt="10">
                        No tilesets loaded.
                    </Text>
                )}

                {activeTileset && !activeSprite && (
                    <Text textAlign="center" fontSize="xs" color="red.700" mt="10">
                        Image not found: {activeTileset.spriteSheet}
                    </Text>
                )}

                {activeTileset && activeSprite && (
                    <Grid
                        templateColumns={`repeat(auto-fill, minmax(${activeTileset.tileWidth}px, 1fr))`}
                        gap="1"
                    >
                        {tiles.map(tile => {
                            // Calculate background position
                            const col = tile.spriteIndex % activeTileset.columns;
                            const row = Math.floor(tile.spriteIndex / activeTileset.columns);

                            return (
                                <Box
                                    as="button"
                                    key={tile.id}
                                    title={tile.id}
                                    position="relative"
                                    rounded="sm"
                                    overflow="hidden"
                                    border="1px"
                                    borderColor={selectedTileId === tile.id ? "blue.500" : "transparent"}
                                    boxShadow={selectedTileId === tile.id ? "0 0 0 1px #3182ce" : "none"}
                                    zIndex={selectedTileId === tile.id ? 10 : 0}
                                    _hover={{ borderColor: selectedTileId === tile.id ? "blue.500" : "gray.600" }}
                                    transition="all 0.1s"
                                    w={`${activeTileset.tileWidth}px`}
                                    h={`${activeTileset.tileHeight}px`}
                                    onClick={() => selectTile(tile.id)}
                                >
                                    <Box
                                        w="100%"
                                        h="100%"
                                        backgroundImage={`url(${activeSprite.src})`}
                                        backgroundPosition={`-${col * activeTileset.tileWidth}px -${row * activeTileset.tileHeight}px`}
                                        style={{ imageRendering: 'pixelated' }}
                                    />
                                </Box>
                            );
                        })}
                    </Grid>
                )}
            </Box>

            {/* Importer Modal */}
            <Modal isOpen={isImporterOpen} onClose={closeImporter} size="xl" isCentered>
                <ModalOverlay backdropFilter="blur(4px)" bg="blackAlpha.800" />
                <ModalContent bg="transparent" border="none" boxShadow="none">
                    <TilesetImporter
                        onSave={handleImport}
                        onCancel={closeImporter}
                    />
                </ModalContent>
            </Modal>
        </Flex>
    );
};
