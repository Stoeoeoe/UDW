import React, { useEffect, useRef } from 'react';
import { Box } from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';

export const MapViewport: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const camera = useEditorStore(state => state.camera);
    const currentMap = useEditorStore(state => state.currentMap);

    // Pure Render Logic
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 1. Handle resize roughly
        const parent = canvas.parentElement;
        if (parent) {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
        }

        // 2. Clear
        ctx.fillStyle = '#171717'; // gray.900 equivalent
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 3. Apply Camera Transform
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2); // Center origin
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);

        // 4. Draw World Origin
        ctx.beginPath();
        ctx.moveTo(0, -50);
        ctx.lineTo(0, 50);
        ctx.moveTo(-50, 0);
        ctx.lineTo(50, 0);
        ctx.strokeStyle = '#3182ce'; // blue.500
        ctx.lineWidth = 1 / camera.zoom;
        ctx.stroke();

        // 5. Draw Placeholder Map Bounds & Content
        if (currentMap) {
            const pixelWidth = currentMap.width * 16;
            const pixelHeight = currentMap.height * 16;

            // Draw grid behind
            ctx.strokeStyle = '#262626';
            ctx.lineWidth = 1 / camera.zoom;
            ctx.beginPath();
            for (let x = 0; x <= pixelWidth; x += 16) {
                ctx.moveTo(x, 0); ctx.lineTo(x, pixelHeight);
            }
            for (let y = 0; y <= pixelHeight; y += 16) {
                ctx.moveTo(0, y); ctx.lineTo(pixelWidth, y);
            }
            ctx.stroke();

            // RENDER LAYERS
            const state = useEditorStore.getState();

            [...currentMap.layers].sort((a, b) => a.zOrder - b.zOrder).forEach(layer => {
                if (!layer.visible || layer.kind !== 'visual') return;

                layer.data.forEach((row, y) => {
                    row.forEach((tileId, x) => {
                        if (!tileId) return;

                        let foundTile: { tilesetId: string, spriteIndex: number } | null = null;
                        const underscoreIndex = tileId.indexOf('_');
                        if (underscoreIndex > 0) {
                            const tilesetId = tileId.substring(0, underscoreIndex);
                            const tileset = state.tilesets.get(tilesetId);
                            if (tileset) {
                                const localId = tileId;
                                const tileDef = tileset.tiles.find(t => t.id === localId);
                                if (tileDef) {
                                    foundTile = { tilesetId, spriteIndex: tileDef.spriteIndex };
                                }
                            }
                        }

                        if (foundTile) {
                            const tileset = state.tilesets.get(foundTile.tilesetId);
                            const sprite = state.loadedSprites.get(tileset?.spriteSheet || '');

                            if (tileset && sprite) {
                                const sx = (foundTile.spriteIndex % tileset.columns) * tileset.tileWidth;
                                const sy = Math.floor(foundTile.spriteIndex / tileset.columns) * tileset.tileHeight;

                                ctx.drawImage(
                                    sprite,
                                    sx, sy, tileset.tileWidth, tileset.tileHeight,
                                    x * 16, y * 16, 16, 16
                                );
                            }
                        }
                    });
                });
            });

            // Draw Bounds Border
            ctx.strokeStyle = '#525252';
            ctx.lineWidth = 2 / camera.zoom;
            ctx.strokeRect(0, 0, pixelWidth, pixelHeight);
        }

        ctx.restore();

    }, [camera, currentMap]);

    return (
        <Box w="full" h="full" position="relative" overflow="hidden" bg="gray.900">
            <canvas
                ref={canvasRef}
                style={{ display: 'block', touchAction: 'none' }}
            />
            {/* Overlay UI */}
            <Box
                position="absolute"
                bottom="4"
                right="4"
                bg="gray.800"
                color="gray.400"
                fontSize="xs"
                px="2"
                py="1"
                rounded="md"
                border="1px"
                borderColor="gray.700"
                pointerEvents="none"
            >
                {Math.round(camera.zoom * 100)}%
            </Box>
        </Box>
    );
};
