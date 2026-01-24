import React, { useEffect, useRef } from 'react';
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

        // 1. Handle resize roughly (should be more robust later)
        const parent = canvas.parentElement;
        if (parent) {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
        }

        // 2. Clear
        ctx.fillStyle = '#171717'; // slate-900
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
        ctx.strokeStyle = '#3b82f6'; // blue-500
        ctx.lineWidth = 1 / camera.zoom;
        ctx.stroke();

        // 5. Draw Placeholder Map Bounds & Content
        if (currentMap) {
            const pixelWidth = currentMap.width * 16;
            const pixelHeight = currentMap.height * 16;

            // Draw grid behind
            ctx.strokeStyle = '#262626'; // slate-800
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
            // We need access to tilesets and sprites from the store
            // NOTE: In a real app, passing these as dependencies to useEffect might trigger too many re-renders.
            // Better to use a refs or a dedicated render loop subscription.
            const state = useEditorStore.getState();

            [...currentMap.layers].sort((a, b) => a.zOrder - b.zOrder).forEach(layer => {
                if (!layer.visible || layer.kind !== 'visual') return;

                layer.data.forEach((row, y) => {
                    row.forEach((tileId, x) => {
                        if (!tileId) return;

                        // Resolve Tile
                        // This is inefficient (O(N) lookup per tile), optimization needed for Phase 2 (Lookup Map)
                        let foundTile: { tilesetId: string, spriteIndex: number } | null = null;

                        // Simple lookup: iterate tilesets to find who owns this tileId
                        // Assumption: tileId is unique across tilesets or we know the prefix
                        // In our importer we used `${config.id}_${i}`

                        // Optimisation: Try to split by first underscore to get tileset ID
                        const underscoreIndex = tileId.indexOf('_');
                        if (underscoreIndex > 0) {
                            const tilesetId = tileId.substring(0, underscoreIndex);
                            const tileset = state.tilesets.get(tilesetId);
                            if (tileset) {
                                // The part after underscore is the index? Warning: brittle
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
                                    x * 16, y * 16, 16, 16 // Drawing at fixed 16x16 for map grid for now, should use project.tileSize
                                );
                            }
                        }
                    });
                });
            });

            // Draw Bounds Border
            ctx.strokeStyle = '#525252'; // slate-600
            ctx.lineWidth = 2 / camera.zoom;
            ctx.strokeRect(0, 0, pixelWidth, pixelHeight);
        }

        ctx.restore();

    }, [camera, currentMap, /* Add window resize listener dep later */]);

    return (
        <div className="w-full h-full relative overflow-hidden bg-slate-900">
            <canvas
                ref={canvasRef}
                className="block touch-none"
            />
            {/* Overlay UI (e.g. Zoom level indicator) */}
            <div className="absolute bottom-4 right-4 bg-slate-800 text-slate-400 text-xs px-2 py-1 rounded border border-slate-700 pointer-events-none">
                {Math.round(camera.zoom * 100)}%
            </div>
        </div>
    );
};
