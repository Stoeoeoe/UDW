import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { usePanZoom } from '../../../hooks/usePanZoom';
import { ZoomControls } from '../../common/ZoomControls';
import { useEditorStore } from '../../../store/useEditorStore';
import { resolveTileAt, resolveEntities } from '../../../lib/mapUtils';
import { DEFAULT_ENTITY_TYPES } from '../../../lib/defaultEntities';
import { DEFAULT_TILE_SIZE } from '../../../config/constants';

export const MapViewport: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Selection & Camera
    const camera = useEditorStore(state => state.camera);
    const setCamera = useEditorStore(state => state.setCamera);
    const resetCamera = useEditorStore(state => state.resetCamera);

    // Map State
    const currentMap = useEditorStore(state => state.currentMap);
    const activeVariationId = useEditorStore(state => state.activeVariationId);
    const activeTilesetId = useEditorStore(state => state.activeTilesetId);
    const selectedTileIndex = useEditorStore(state => state.selectedTileIndex);
    const selectedTileIndices = useEditorStore(state => state.selectedTileIndices);
    const activeTool = useEditorStore(state => state.activeTool);
    const drawMode = useEditorStore(state => state.drawMode);
    const selectedLayerId = useEditorStore(state => state.selectedLayerId);
    const selectedEntityTypeId = useEditorStore(state => state.selectedEntityTypeId);
    const selectedEntityId = useEditorStore(state => state.selectedEntityId);
    const hoveredTile = useEditorStore(state => state.hoveredTile);

    // Actions
    const paintTile = useEditorStore(state => state.paintTile);
    const eraseTile = useEditorStore(state => state.eraseTile);
    const bucketFill = useEditorStore(state => state.bucketFill);
    const placeEntity = useEditorStore(state => state.placeEntity);
    const selectEntity = useEditorStore(state => state.selectEntity);
    const setHoveredTile = useEditorStore(state => state.setHoveredTile);
    const setActiveTileset = useEditorStore(state => state.setActiveTileset);
    const setSelectedTile = useEditorStore(state => state.setSelectedTile);
    const selectLayer = useEditorStore(state => state.selectLayer);

    // Resources
    const tilesets = useEditorStore(state => state.tilesets);
    const loadedSprites = useEditorStore(state => state.loadedSprites);

    const [isPanning, setIsPanning] = useState(false);
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStart, setDrawStart] = useState<{ x: number, y: number } | null>(null);
    const [mouseWorld, setMouseWorld] = useState({ x: 0, y: 0 });
    const spaceHeld = useRef(false);

    const panZoom = usePanZoom({
        canvasRef,
        getCamera: () => useEditorStore.getState().camera,
        setCamera: (c) => setCamera(c),
        contentSize: currentMap ? { width: currentMap.width * DEFAULT_TILE_SIZE, height: currentMap.height * DEFAULT_TILE_SIZE } : null
    });

    // Center the map in the viewport when a map becomes active. Observe the parent
    // container (which determines the canvas final size) and center once it's measured.
    React.useEffect(() => {
        if (!currentMap) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const parent = canvas.parentElement || canvas;
        if (!parent) return;

        let ro: ResizeObserver | null = null;
        const tryCenter = () => {
            const pw = parent.clientWidth;
            const ph = parent.clientHeight;
            if (pw === 0 || ph === 0) return false;

            const mapPixelW = currentMap.width * DEFAULT_TILE_SIZE;
            const mapPixelH = currentMap.height * DEFAULT_TILE_SIZE;

            // Apply the same constraint logic as usePanZoom.getConstrainedPos so
            // the camera we set here matches pan/zoom constraints.
            const viewW = pw / camera.zoom;
            const viewH = ph / camera.zoom;
            const limitX = Math.max(mapPixelW, viewW * 0.4);
            const limitY = Math.max(mapPixelH, viewH * 0.4);

            const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
            const desiredX = mapPixelW / 2;
            const desiredY = mapPixelH / 2;
            const minX = -limitX / 2;
            const maxX = limitX * 1.5;
            const minY = -limitY / 2;
            const maxY = limitY * 1.5;

            const finalX = clamp(desiredX, minX, maxX);
            const finalY = clamp(desiredY, minY, maxY);

            setCamera({ x: finalX, y: finalY });
            return true;
        };

        // If parent already measured, center immediately
        if (!tryCenter()) {
            ro = new ResizeObserver(() => {
                if (tryCenter() && ro) {
                    ro.disconnect();
                    ro = null;
                }
            });
            try { ro.observe(parent); } catch (e) { /* ignore */ }

            const raf = requestAnimationFrame(() => { tryCenter(); });
            return () => { if (ro) ro.disconnect(); cancelAnimationFrame(raf); };
        }

        return undefined;
    }, [currentMap, setCamera, camera.zoom]);

    const handleWheel = useCallback((e: WheelEvent) => panZoom.handleWheel(e), [panZoom]);

    const screenToWorld = useCallback((clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;

        return {
            x: (mouseX - canvas.width / 2) / camera.zoom + camera.x,
            y: (mouseY - canvas.height / 2) / camera.zoom + camera.y
        };
    }, [camera.zoom, camera.x, camera.y]);

    const applyShape = (mode: 'point' | 'rect' | 'circle', start: { x: number, y: number }, end: { x: number, y: number }, action: 'paint' | 'erase') => {
        if (!currentMap || !selectedLayerId) return;
        if (action === 'paint' && (!activeTilesetId || (selectedTileIndex === null && (!selectedTileIndices || selectedTileIndices.length === 0)))) return;

        // Build a stencil pattern if multiple tiles are selected
        let pattern: (number | null)[][] | null = null;
        let patternW = 0;
        let patternH = 0;
        if (selectedTileIndices && selectedTileIndices.length > 0 && activeTilesetId) {
            const ts = tilesets.get(activeTilesetId);
            if (ts) {
                const cols = ts.columns;
                let minC = Infinity, minR = Infinity, maxC = -Infinity, maxR = -Infinity;
                for (const idx of selectedTileIndices) {
                    const c = idx % cols;
                    const r = Math.floor(idx / cols);
                    if (c < minC) minC = c;
                    if (c > maxC) maxC = c;
                    if (r < minR) minR = r;
                    if (r > maxR) maxR = r;
                }
                if (minC !== Infinity) {
                    patternW = maxC - minC + 1;
                    patternH = maxR - minR + 1;
                    pattern = Array.from({ length: patternH }, () => Array(patternW).fill(null));
                    for (const idx of selectedTileIndices) {
                        const c = idx % cols;
                        const r = Math.floor(idx / cols);
                        pattern[r - minR][c - minC] = idx;
                    }
                }
            }
        }

        const doAction = (tx: number, ty: number) => {
            if (tx < 0 || tx >= currentMap.width || ty < 0 || ty >= currentMap.height) return;
            if (action === 'paint') {
                if (pattern && patternW > 0 && patternH > 0 && activeTilesetId) {
                    // place the pattern anchored at (tx,ty) top-left
                    for (let py = 0; py < patternH; py++) {
                        for (let px = 0; px < patternW; px++) {
                            const tileIdx = pattern![py][px];
                            if (tileIdx !== null && tileIdx !== undefined) {
                                paintTile(selectedLayerId, tx + px, ty + py, activeTilesetId, tileIdx as number);
                            }
                        }
                    }
                } else {
                    paintTile(selectedLayerId, tx, ty, activeTilesetId!, selectedTileIndex!);
                }
            } else {
                // erase: if pattern present, erase pattern area, otherwise single
                if (pattern && patternW > 0 && patternH > 0) {
                    for (let py = 0; py < patternH; py++) {
                        for (let px = 0; px < patternW; px++) {
                            eraseTile(selectedLayerId, tx + px, ty + py);
                        }
                    }
                } else {
                    eraseTile(selectedLayerId, tx, ty);
                }
            }
        };

        if (mode === 'point') {
            doAction(end.x, end.y);
        } else if (mode === 'rect') {
            const minX = Math.min(start.x, end.x);
            const maxX = Math.max(start.x, end.x);
            const minY = Math.min(start.y, end.y);
            const maxY = Math.max(start.y, end.y);
            if (pattern && patternW > 0 && patternH > 0) {
                for (let y = minY; y <= maxY; y++) {
                    for (let x = minX; x <= maxX; x++) {
                        const dx = x - start.x;
                        const dy = y - start.y;
                        const px = ((dx % patternW) + patternW) % patternW;
                        const py = ((dy % patternH) + patternH) % patternH;
                        const tileIdx = pattern[py][px];
                        if (tileIdx !== null && tileIdx !== undefined && action === 'paint' && activeTilesetId) {
                            paintTile(selectedLayerId, x, y, activeTilesetId, tileIdx as number);
                        } else if (action === 'erase') {
                            eraseTile(selectedLayerId, x, y);
                        }
                    }
                }
            } else {
                for (let y = minY; y <= maxY; y++) {
                    for (let x = minX; x <= maxX; x++) {
                        doAction(x, y);
                    }
                }
            }
        } else if (mode === 'circle') {
            const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
            const minX = Math.floor(start.x - radius);
            const maxX = Math.ceil(start.x + radius);
            const minY = Math.floor(start.y - radius);
            const maxY = Math.ceil(start.y + radius);
            if (pattern && patternW > 0 && patternH > 0) {
                for (let y = minY; y <= maxY; y++) {
                    for (let x = minX; x <= maxX; x++) {
                        const dist = Math.sqrt(Math.pow(x - start.x, 2) + Math.pow(y - start.y, 2));
                        if (dist <= radius) {
                            const dx = x - start.x;
                            const dy = y - start.y;
                            const px = ((dx % patternW) + patternW) % patternW;
                            const py = ((dy % patternH) + patternH) % patternH;
                            const tileIdx = pattern[py][px];
                            if (tileIdx !== null && tileIdx !== undefined && action === 'paint' && activeTilesetId) {
                                paintTile(selectedLayerId, x, y, activeTilesetId, tileIdx as number);
                            } else if (action === 'erase') {
                                eraseTile(selectedLayerId, x, y);
                            }
                        }
                    }
                }
            } else {
                for (let y = minY; y <= maxY; y++) {
                    for (let x = minX; x <= maxX; x++) {
                        const dist = Math.sqrt(Math.pow(x - start.x, 2) + Math.pow(y - start.y, 2));
                        if (dist <= radius) doAction(x, y);
                    }
                }
            }
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            setIsPanning(true);
            panZoom.startPan(e.clientX, e.clientY);
            e.preventDefault();
            return;
        }

        if (e.button === 0 && currentMap) {
            const world = screenToWorld(e.clientX, e.clientY);
            const tx = Math.floor(world.x / 16);
            const ty = Math.floor(world.y / 16);

            if (activeTool === 'select') {
                const resolvedEntities = resolveEntities(currentMap, activeVariationId);
                const hit = [...resolvedEntities].reverse().find(entity => {
                    const ex = entity.position[0] * 16;
                    const ey = entity.position[1] * 16;
                    return world.x >= ex && world.x < ex + 16 && world.y >= ey && world.y < ey + 16;
                });
                selectEntity(hit?.id || null);
            } else if (activeTool === 'tilePaint' || activeTool === 'tileErase') {
                if (drawMode === 'point') {
                    applyShape('point', { x: tx, y: ty }, { x: tx, y: ty }, activeTool === 'tilePaint' ? 'paint' : 'erase');
                } else {
                    setDrawStart({ x: tx, y: ty });
                    setIsDrawing(true);
                }
            } else if (activeTool === 'tileFill' && selectedLayerId && activeTilesetId && selectedTileIndex !== null) {
                if (tx >= 0 && tx < currentMap.width && ty >= 0 && ty < currentMap.height) {
                    bucketFill(selectedLayerId, tx, ty, activeTilesetId, selectedTileIndex);
                }
            } else if (activeTool === 'entityPlace' && selectedEntityTypeId) {
                const type = DEFAULT_ENTITY_TYPES.find(t => t.id === selectedEntityTypeId);
                if (type) {
                    placeEntity({
                        id: `ent-${Date.now()}`,
                        typeId: selectedEntityTypeId,
                        position: [tx, ty],
                        properties: type.properties.reduce((acc, p) => ({ ...acc, [p.key]: p.defaultValue }), {})
                    });
                }
            }
        }
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        const world = screenToWorld(e.clientX, e.clientY);
        setMouseWorld(world);

        const tx = Math.floor(world.x / 16);
        const ty = Math.floor(world.y / 16);

        if (currentMap && tx >= 0 && tx < currentMap.width && ty >= 0 && ty < currentMap.height) {
            setHoveredTile({ x: tx, y: ty });
        } else {
            setHoveredTile(null);
        }

        if (isPanning) {
            // delegate panning to hook
            if (panZoom.panMove(e.clientX, e.clientY)) {
                return;
            }
        }

        // Handle painting/erasing while dragging in point mode
        if (e.buttons === 1 && !e.altKey && currentMap && drawMode === 'point') {
            if (tx >= 0 && tx < currentMap.width && ty >= 0 && ty < currentMap.height && selectedLayerId) {
                if (activeTool === 'tilePaint' && activeTilesetId && selectedTileIndex !== null) {
                    paintTile(selectedLayerId, tx, ty, activeTilesetId, selectedTileIndex);
                } else if (activeTool === 'tileErase') {
                    eraseTile(selectedLayerId, tx, ty);
                }
            }
        }
    }, [isPanning, setCamera, currentMap, activeTool, drawMode, selectedLayerId, activeTilesetId, selectedTileIndex, paintTile, eraseTile, screenToWorld, setHoveredTile, panZoom]);

    const handleMouseUp = useCallback((e: MouseEvent) => {
        if (isDrawing && drawStart && currentMap) {
            const world = screenToWorld(e.clientX, e.clientY);
            const tx = Math.floor(world.x / 16);
            const ty = Math.floor(world.y / 16);
            applyShape(drawMode, drawStart, { x: tx, y: ty }, activeTool === 'tilePaint' ? 'paint' : 'erase');
        }
        panZoom.stopPan();
        setIsPanning(false);
        setIsDrawing(false);
        setDrawStart(null);
    }, [isDrawing, drawStart, drawMode, activeTool, currentMap, screenToWorld, applyShape, panZoom]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.addEventListener('wheel', handleWheel, { passive: false });
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            canvas.removeEventListener('wheel', handleWheel);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleWheel, handleMouseMove, handleMouseUp]);

    // Keyboard handlers: shortcuts for tools and spacebar panning
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore when typing in inputs
            const active = document.activeElement;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) return;

            if (e.code === 'Space') {
                // start panning on space
                if (!spaceHeld.current) {
                    spaceHeld.current = true;
                    setIsPanning(true);
                }
                e.preventDefault();
                return;
            }

            // Tool shortcuts: V, B, E, G, N
            if (e.key === 'v' || e.key === 'V') { useEditorStore.getState().setActiveTool('select'); }
            if (e.key === 'b' || e.key === 'B') { useEditorStore.getState().setActiveTool('tilePaint'); }
            if (e.key === 'e' || e.key === 'E') { useEditorStore.getState().setActiveTool('tileErase'); }
            if (e.key === 'g' || e.key === 'G') { useEditorStore.getState().setActiveTool('tileFill'); }
            if (e.key === 'n' || e.key === 'N') { useEditorStore.getState().setActiveTool('entityPlace'); }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                spaceHeld.current = false;
                setIsPanning(false);
                e.preventDefault();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // Ensure prerequisites for painting are present when paint tool is active.
    useEffect(() => {
        if (activeTool === 'tilePaint') {
            // Ensure a layer is selected
            if (!selectedLayerId && currentMap && currentMap.layers.length > 0) {
                selectLayer(currentMap.layers[0].id);
            }

            // Ensure a tileset is active
            if (!activeTilesetId && tilesets && tilesets.size > 0) {
                const firstTs = Array.from(tilesets.values())[0];
                if (firstTs) setActiveTileset(firstTs.id);
            }

            // Ensure a tile index is selected
            if (selectedTileIndex === null) {
                setSelectedTile(0);
            }
        }
    }, [activeTool, currentMap, tilesets, selectedLayerId, activeTilesetId, selectedTileIndex, selectLayer, setActiveTileset, setSelectedTile]);

    // Cancel drawing when tool or drawMode changes to avoid sticky draw states
    useEffect(() => {
        setIsDrawing(false);
        setDrawStart(null);
    }, [activeTool, drawMode]);

    // RENDER LOOP
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        ctx.imageSmoothingEnabled = false;

        // Resize
        const parent = canvas.parentElement;
        if (parent) {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
        }

        ctx.fillStyle = '#0a0a0b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);

        if (currentMap) {
            const pixelWidth = currentMap.width * 16;
            const pixelHeight = currentMap.height * 16;

            // Render Layers with Variation Resolution
            [...currentMap.layers].sort((a, b) => a.zOrder - b.zOrder).forEach(layer => {
                if (!layer.visible || layer.kind !== 'visual') return;

                for (let y = 0; y < currentMap.height; y++) {
                    for (let x = 0; x < currentMap.width; x++) {
                        const tileRef = resolveTileAt(currentMap, layer.id, x, y, activeVariationId);
                        if (!tileRef) continue;

                        const [tsId, indexStr] = tileRef.split(':');
                        const index = parseInt(indexStr);
                        const tileset = tilesets.get(tsId);

                        if (tileset) {
                            let effectiveTileset = tileset;
                            const variation = currentMap.variations?.find(v => v.id === activeVariationId);
                            if (variation?.tilesetSuffix) {
                                const suffixed = tilesets.get(`${tsId}${variation.tilesetSuffix}`);
                                if (suffixed) effectiveTileset = suffixed;
                            }

                            const sprite = loadedSprites.get(effectiveTileset.spriteSheet);
                            if (sprite) {
                                const sx = (index % effectiveTileset.columns) * effectiveTileset.tileWidth;
                                const sy = Math.floor(index / effectiveTileset.columns) * effectiveTileset.tileHeight;
                                ctx.imageSmoothingEnabled = false;
                                ctx.drawImage(
                                    sprite,
                                    sx, sy, effectiveTileset.tileWidth, effectiveTileset.tileHeight,
                                    x * 16, y * 16, 16, 16
                                );
                            }
                        }
                    }
                }
            });

            // Entities
            const resolvedEntities = resolveEntities(currentMap, activeVariationId);
            resolvedEntities.forEach(entity => {
                const type = DEFAULT_ENTITY_TYPES.find(t => t.id === entity.typeId);
                const color = type?.placeholderColor || '#ffff00';

                if (entity.id === selectedEntityId) {
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2 / camera.zoom;
                    ctx.strokeRect(entity.position[0] * 16 - 1, entity.position[1] * 16 - 1, 18, 18);
                }

                ctx.fillStyle = color;
                ctx.globalAlpha = 0.6;
                ctx.fillRect(entity.position[0] * 16, entity.position[1] * 16, 16, 16);
                ctx.globalAlpha = 1.0;

                ctx.fillStyle = '#fff';
                ctx.font = '8px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(entity.typeId.charAt(0).toUpperCase(), entity.position[0] * 16 + 8, entity.position[1] * 16 + 11);
            });

            // Grid
            ctx.strokeStyle = '#2d3748';
            ctx.lineWidth = 0.5 / camera.zoom;
            ctx.beginPath();
            for (let x = 0; x <= pixelWidth; x += 16) {
                ctx.moveTo(x, 0); ctx.lineTo(x, pixelHeight);
            }
            for (let y = 0; y <= pixelHeight; y += 16) {
                ctx.moveTo(0, y); ctx.lineTo(pixelWidth, y);
            }
            ctx.stroke();

            // Hover Highlight
            if (hoveredTile) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.fillRect(hoveredTile.x * 16, hoveredTile.y * 16, 16, 16);
            }

            // Selected Tile Preview (50% opacity) — single tile or multi-tile stencil
            if (activeTool === 'tilePaint' && activeTilesetId && hoveredTile) {
                const ts = tilesets.get(activeTilesetId);
                if (ts) {
                    let effectiveTileset = ts;
                    const variation = currentMap?.variations?.find(v => v.id === activeVariationId);
                    if (variation?.tilesetSuffix) {
                        const suffixed = tilesets.get(`${activeTilesetId}${variation.tilesetSuffix}`);
                        if (suffixed) effectiveTileset = suffixed;
                    }

                    const sprite = loadedSprites.get(effectiveTileset.spriteSheet);
                    if (sprite) {
                        ctx.globalAlpha = 0.5;
                        if (selectedTileIndices && selectedTileIndices.length > 0) {
                            // build pattern
                            const cols = effectiveTileset.columns;
                            let minC = Infinity, minR = Infinity, maxC = -Infinity, maxR = -Infinity;
                            for (const idx of selectedTileIndices) {
                                const c = idx % cols;
                                const r = Math.floor(idx / cols);
                                if (c < minC) minC = c;
                                if (c > maxC) maxC = c;
                                if (r < minR) minR = r;
                                if (r > maxR) maxR = r;
                            }
                            if (minC !== Infinity) {
                                const pW = maxC - minC + 1;
                                const pH = maxR - minR + 1;
                                for (let py = 0; py < pH; py++) {
                                    for (let px = 0; px < pW; px++) {
                                        const tileIdx = selectedTileIndices.find(t => {
                                            const c = t % cols; const r = Math.floor(t / cols);
                                            return r - minR === py && c - minC === px;
                                        });
                                        if (tileIdx !== undefined) {
                                            const sx = (tileIdx % effectiveTileset.columns) * effectiveTileset.tileWidth;
                                            const sy = Math.floor(tileIdx / effectiveTileset.columns) * effectiveTileset.tileHeight;
                                            ctx.drawImage(sprite, sx, sy, effectiveTileset.tileWidth, effectiveTileset.tileHeight, (hoveredTile.x + px) * 16, (hoveredTile.y + py) * 16, 16, 16);
                                        }
                                    }
                                }
                            }
                        } else if (selectedTileIndex !== null) {
                            const sx = (selectedTileIndex % effectiveTileset.columns) * effectiveTileset.tileWidth;
                            const sy = Math.floor(selectedTileIndex / effectiveTileset.columns) * effectiveTileset.tileHeight;
                            ctx.drawImage(sprite, sx, sy, effectiveTileset.tileWidth, effectiveTileset.tileHeight, hoveredTile.x * 16, hoveredTile.y * 16, 16, 16);
                        }
                        ctx.globalAlpha = 1.0;
                    }
                }
            }

            // Draw Previews (Rect/Circle)
            if (isDrawing && drawStart) {
                const tx = Math.floor(mouseWorld.x / 16);
                const ty = Math.floor(mouseWorld.y / 16);
                ctx.strokeStyle = '#3182ce';
                ctx.lineWidth = 2 / camera.zoom;

                if (drawMode === 'rect') {
                    const minX = Math.min(drawStart.x, tx);
                    const maxX = Math.max(drawStart.x, tx);
                    const minY = Math.min(drawStart.y, ty);
                    const maxY = Math.max(drawStart.y, ty);
                    ctx.strokeRect(minX * 16, minY * 16, (maxX - minX + 1) * 16, (maxY - minY + 1) * 16);
                } else if (drawMode === 'circle') {
                    const radius = Math.sqrt(Math.pow(tx - drawStart.x, 2) + Math.pow(ty - drawStart.y, 2));
                    ctx.beginPath();
                    ctx.arc(drawStart.x * 16 + 8, drawStart.y * 16 + 8, radius * 16, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }

            // Bounds
            ctx.strokeStyle = '#4A5568';
            ctx.lineWidth = 2 / camera.zoom;
            ctx.strokeRect(0, 0, pixelWidth, pixelHeight);

            // GHOST (Entity Preview)
            if (activeTool === 'entityPlace' && selectedEntityTypeId) {
                const tx = Math.floor(mouseWorld.x / 16);
                const ty = Math.floor(mouseWorld.y / 16);
                const type = DEFAULT_ENTITY_TYPES.find(t => t.id === selectedEntityTypeId);
                if (type) {
                    ctx.fillStyle = type.placeholderColor;
                    ctx.globalAlpha = 0.3;
                    ctx.fillRect(tx * 16, ty * 16, 16, 16);
                    ctx.globalAlpha = 1.0;
                }
            }
        }

        ctx.restore();
    }, [camera, currentMap, activeVariationId, tilesets, loadedSprites, activeTool, selectedEntityTypeId, mouseWorld, selectedEntityId, hoveredTile, isDrawing, drawStart, drawMode, selectedTileIndex, selectedTileIndices, activeTilesetId]);

    return (
        <Box w="full" h="full" position="relative" overflow="hidden">
            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                style={{
                    display: 'block',
                    touchAction: 'none',
                    cursor: isPanning ? 'grabbing' : ((activeTool === 'tilePaint' || activeTool === 'tileErase' || activeTool === 'tileFill') ? 'crosshair' : 'default')
                }}
            />

            <>
                {/* Zoom controls (extracted) */}
                {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
                {/* @ts-ignore: dynamic canvasRef usage */}
                <ZoomControls
                    zoomPercent={camera.zoom * 100}
                    onZoomOut={() => panZoom.applyZoom(camera.zoom * 0.8, canvasRef.current!.width / 2, canvasRef.current!.height / 2)}
                    onZoomIn={() => panZoom.applyZoom(camera.zoom * 1.2, canvasRef.current!.width / 2, canvasRef.current!.height / 2)}
                    onReset={resetCamera}
                />
            </>

            <Box position="absolute" top="4" left="4" bg="blackAlpha.700" px={3} py={1} rounded="full" pointerEvents="none">
                <Text color="gray.400" fontSize="10px" fontWeight="black" textTransform="uppercase" letterSpacing="widest">
                    Variation: <Text as="span" color="blue.400">{activeVariationId || 'BASE'}</Text>
                </Text>
            </Box>
        </Box>
    );
};
