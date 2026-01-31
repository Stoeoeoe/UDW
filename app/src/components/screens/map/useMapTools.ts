import { useCallback, useRef, useEffect } from 'react';
import { Viewport } from 'pixi-viewport';
import { useEditorStore } from '../../../store/useEditorStore';
import { resolveEntities, resolveTileAt } from '../../../lib/mapUtils';
import { DEFAULT_ENTITY_TYPES } from '../../../lib/defaultEntities';
import { DEFAULT_TILE_SIZE } from '../../../config/constants';

interface UseMapToolsProps {
    viewport: Viewport | null;
}

/**
 * Hook that handles all tool interactions (paint, erase, fill, entity placement, selection).
 */
export function useMapTools({ viewport }: UseMapToolsProps) {
    const currentMap = useEditorStore(state => state.currentMap);
    const activeVariationId = useEditorStore(state => state.activeVariationId);
    const activeTilesetId = useEditorStore(state => state.activeTilesetId);
    const selectedTileIndex = useEditorStore(state => state.selectedTileIndex);
    const selectedTileIndices = useEditorStore(state => state.selectedTileIndices);
    const activeTool = useEditorStore(state => state.activeTool);
    const drawMode = useEditorStore(state => state.drawMode);
    const selectedLayerId = useEditorStore(state => state.selectedLayerId);
    const selectedEntityTypeId = useEditorStore(state => state.selectedEntityTypeId);
    const tilesets = useEditorStore(state => state.tilesets);

    const paintTilesBatch = useEditorStore(state => state.paintTilesBatch);
    const eraseTilesBatch = useEditorStore(state => state.eraseTilesBatch);
    const bucketFillAdvanced = useEditorStore(state => state.bucketFillAdvanced);
    const placeEntity = useEditorStore(state => state.placeEntity);
    const selectEntity = useEditorStore(state => state.selectEntity);
    const setHoveredTile = useEditorStore(state => state.setHoveredTile);
    const setDrawPreview = useEditorStore(state => state.setDrawPreview);
    const setSelectedTile = useEditorStore(state => state.setSelectedTile);
    const setActiveTileset = useEditorStore(state => state.setActiveTileset);

    const isDrawingRef = useRef(false);
    const drawStartRef = useRef<{ x: number; y: number } | null>(null);
    const lineAnchorRef = useRef<{ x: number; y: number } | null>(null); // For line tool: last clicked anchor
    const isShiftHeldRef = useRef(false); // Track shift key state

    // Convert screen coordinates to tile coordinates
    const screenToTile = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
        if (!viewport || !viewport.worldTransform) return null;

        try {
            // Get canvas position and calculate relative coordinates
            const canvas = (viewport as any).options?.events?.domElement || 
                           document.querySelector('canvas');
            if (!canvas) return null;
            
            const rect = canvas.getBoundingClientRect();
            const x = clientX - rect.left;
            const y = clientY - rect.top;
            
            const worldPos = viewport.toWorld(x, y);
            const tx = Math.floor(worldPos.x / DEFAULT_TILE_SIZE);
            const ty = Math.floor(worldPos.y / DEFAULT_TILE_SIZE);

            return { x: tx, y: ty };
        } catch (e) {
            // Viewport not fully initialized
            return null;
        }
    }, [viewport]);

    // Build pattern from multi-tile selection (skip for random tool as it samples per-tile)
    const getPattern = useCallback(() => {
        if (activeTool === 'random') return null;
        if (!selectedTileIndices || selectedTileIndices.length === 0 || !activeTilesetId) return null;

        const ts = tilesets.get(activeTilesetId);
        if (!ts) return null;

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

        if (minC === Infinity) return null;

        const patternW = maxC - minC + 1;
        const patternH = maxR - minR + 1;
        const pattern: (number | null)[][] = Array.from({ length: patternH }, () => Array(patternW).fill(null));

        for (const idx of selectedTileIndices) {
            const c = idx % cols;
            const r = Math.floor(idx / cols);
            pattern[r - minR][c - minC] = idx;
        }

        return { pattern, patternW, patternH };
    }, [activeTool, selectedTileIndices, activeTilesetId, tilesets]);

    // Apply a shape (point, rect, circle, line) - uses batch updates for performance
    const applyShape = useCallback((
        mode: 'point' | 'rect' | 'circle' | 'line',
        start: { x: number; y: number },
        end: { x: number; y: number },
        action: 'paint' | 'erase'
    ) => {
        if (!currentMap || !selectedLayerId) return;
        if (action === 'paint' && (!activeTilesetId || (selectedTileIndex === null && (!selectedTileIndices || selectedTileIndices.length === 0)))) return;

        // Read brushSize directly from store to ensure we have the latest value
        const currentBrushSize = useEditorStore.getState().brushSize;
        
        const patternData = getPattern();
        const pattern = patternData?.pattern;
        const patternW = patternData?.patternW || 1;
        const patternH = patternData?.patternH || 1;

        // Helper to sample a tile index from selected indices using probability weights
        const sampleTileIndex = (indices: number[], tilesetId?: string): number | null => {
            if (!indices || indices.length === 0) return null;
            const ts = tilesetId ? tilesets.get(tilesetId) : undefined;
            const weights = indices.map(i => {
                const def = ts?.tiles?.[i];
                const w = def && typeof def.probability === 'number' && def.probability > 0 ? def.probability : 1;
                return w;
            });
            const total = weights.reduce((a, b) => a + b, 0);
            if (total <= 0) return indices[0];
            let r = Math.random() * total;
            for (let k = 0; k < indices.length; k++) {
                r -= weights[k];
                if (r <= 0) return indices[k];
            }
            return indices[indices.length - 1];
        };

        // Collect tiles for batch update
        const tilesToPaint: Array<{ x: number; y: number; tilesetId: string; tileIndex: number }> = [];
        const tilesToErase: Array<{ x: number; y: number }> = [];

        const collectTile = (tx: number, ty: number) => {
            if (tx < 0 || tx >= currentMap.width || ty < 0 || ty >= currentMap.height) return;
            if (action === 'paint') {
                if (pattern && patternW > 0 && patternH > 0 && activeTilesetId) {
                    for (let py = 0; py < patternH; py++) {
                        for (let px = 0; px < patternW; px++) {
                            const tileIdx = pattern[py][px];
                            if (tileIdx !== null) {
                                const nx = tx + px, ny = ty + py;
                                if (nx >= 0 && nx < currentMap.width && ny >= 0 && ny < currentMap.height) {
                                    tilesToPaint.push({ x: nx, y: ny, tilesetId: activeTilesetId, tileIndex: tileIdx });
                                }
                            }
                        }
                    }
                } else if (activeTool === 'random' && activeTilesetId) {
                    // For random tile tool, sample from selected indices using probability weights
                    if (selectedTileIndices && selectedTileIndices.length > 0) {
                        const chosen = sampleTileIndex(selectedTileIndices, activeTilesetId);
                        if (chosen !== null) tilesToPaint.push({ x: tx, y: ty, tilesetId: activeTilesetId, tileIndex: chosen });
                    } else if (selectedTileIndex !== null) {
                        tilesToPaint.push({ x: tx, y: ty, tilesetId: activeTilesetId, tileIndex: selectedTileIndex });
                    }
                } else if (activeTilesetId && selectedTileIndex !== null) {
                    tilesToPaint.push({ x: tx, y: ty, tilesetId: activeTilesetId, tileIndex: selectedTileIndex });
                }
            } else {
                if (pattern && patternW > 0 && patternH > 0) {
                    for (let py = 0; py < patternH; py++) {
                        for (let px = 0; px < patternW; px++) {
                            const nx = tx + px, ny = ty + py;
                            if (nx >= 0 && nx < currentMap.width && ny >= 0 && ny < currentMap.height) {
                                tilesToErase.push({ x: nx, y: ny });
                            }
                        }
                    }
                } else {
                    tilesToErase.push({ x: tx, y: ty });
                }
            }
        };

        // Collect tiles in a circular brush around a center point
        // Note: brush size only applies when NOT using a multi-tile pattern
        const collectBrush = (cx: number, cy: number, radius: number) => {
            // If we have a multi-tile pattern, don't apply brush - just place the stencil once
            if (pattern && patternW > 0 && patternH > 0) {
                collectTile(cx, cy);
                return;
            }
            
            if (radius <= 1) {
                collectTile(cx, cy);
                return;
            }
            const r = radius - 1; // radius=1 means single tile, radius=2 means 3x3 area, etc.
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist <= r) {
                        collectTile(cx + dx, cy + dy);
                    }
                }
            }
        };

        // Get effective brush size (only for point/line modes) - use currentBrushSize from getState()
        const effectiveBrushSize = (mode === 'point' || mode === 'line') ? currentBrushSize : 1;

        if (mode === 'point') {
            collectBrush(end.x, end.y, effectiveBrushSize);
        } else if (mode === 'rect') {
            const minX = Math.min(start.x, end.x);
            const maxX = Math.max(start.x, end.x);
            const minY = Math.min(start.y, end.y);
            const maxY = Math.max(start.y, end.y);

            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    if (pattern && patternW > 0 && patternH > 0) {
                        const dx = x - start.x;
                        const dy = y - start.y;
                        const px = ((dx % patternW) + patternW) % patternW;
                        const py = ((dy % patternH) + patternH) % patternH;
                        const tileIdx = pattern[py][px];
                        if (tileIdx !== null && action === 'paint' && activeTilesetId) {
                            tilesToPaint.push({ x, y, tilesetId: activeTilesetId, tileIndex: tileIdx });
                        } else if (action === 'erase') {
                            tilesToErase.push({ x, y });
                        }
                    } else {
                        collectTile(x, y);
                    }
                }
            }
        } else if (mode === 'circle') {
            const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
            const minX = Math.floor(start.x - radius);
            const maxX = Math.ceil(start.x + radius);
            const minY = Math.floor(start.y - radius);
            const maxY = Math.ceil(start.y + radius);

            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    const dist = Math.sqrt(Math.pow(x - start.x, 2) + Math.pow(y - start.y, 2));
                    if (dist <= radius) {
                        if (pattern && patternW > 0 && patternH > 0) {
                            const dx = x - start.x;
                            const dy = y - start.y;
                            const px = ((dx % patternW) + patternW) % patternW;
                            const py = ((dy % patternH) + patternH) % patternH;
                            const tileIdx = pattern[py][px];
                            if (tileIdx !== null && action === 'paint' && activeTilesetId) {
                                tilesToPaint.push({ x, y, tilesetId: activeTilesetId, tileIndex: tileIdx });
                            } else if (action === 'erase') {
                                tilesToErase.push({ x, y });
                            }
                        } else {
                            collectTile(x, y);
                        }
                    }
                }
            }
        } else if (mode === 'line') {
            // Bresenham's line algorithm with brush size
            let x0 = start.x, y0 = start.y;
            const x1 = end.x, y1 = end.y;
            const dx = Math.abs(x1 - x0);
            const dy = Math.abs(y1 - y0);
            const sx = x0 < x1 ? 1 : -1;
            const sy = y0 < y1 ? 1 : -1;
            let err = dx - dy;

            while (true) {
                collectBrush(x0, y0, effectiveBrushSize);
                if (x0 === x1 && y0 === y1) break;
                const e2 = 2 * err;
                if (e2 > -dy) { err -= dy; x0 += sx; }
                if (e2 < dx) { err += dx; y0 += sy; }
            }
        }

        // Execute batch updates (single store mutation each)
        if (tilesToPaint.length > 0) {
            paintTilesBatch(selectedLayerId, tilesToPaint);
        }
        if (tilesToErase.length > 0) {
            eraseTilesBatch(selectedLayerId, tilesToErase);
        }
    }, [currentMap, selectedLayerId, activeTilesetId, selectedTileIndex, selectedTileIndices, activeTool, tilesets, getPattern, paintTilesBatch, eraseTilesBatch]);

    // Handle pointer down
    const handlePointerDown = useCallback((e: PointerEvent) => {
        if (!viewport || !currentMap) return;

        // Let viewport handle middle mouse for panning
        if (e.button === 1) return;

        const tile = screenToTile(e.clientX, e.clientY);
        if (!tile) return;

        // ALT+Left Click = Eyedropper: pick tile under cursor (when in stamp/random mode)
        // OR when eyedropper tool is active, just click to pick
        if (e.button === 0 && ((e.altKey && (activeTool === 'stamp' || activeTool === 'random')) || activeTool === 'eyedropper')) {
            if (!selectedLayerId) return;
            const { x: tx, y: ty } = tile;
            if (tx < 0 || tx >= currentMap.width || ty < 0 || ty >= currentMap.height) return;
            
            const tileRef = resolveTileAt(currentMap, selectedLayerId, tx, ty, activeVariationId);
            if (tileRef) {
                // Parse tile reference format: "tilesetId:tileIndex"
                const colonIdx = tileRef.lastIndexOf(':');
                if (colonIdx > 0) {
                    const tilesetId = tileRef.substring(0, colonIdx);
                    const tileIndex = parseInt(tileRef.substring(colonIdx + 1), 10);
                    if (!isNaN(tileIndex)) {
                        setActiveTileset(tilesetId);
                        setSelectedTile(tileIndex);
                    }
                }
            }
            return;
        }
        if (!tile) return;

        const { x: tx, y: ty } = tile;

        if (activeTool === 'select') {
            const worldPos = viewport.toWorld(e.clientX, e.clientY);
            const resolvedEntities = resolveEntities(currentMap, activeVariationId);
            const hit = [...resolvedEntities].reverse().find(entity => {
                const ex = entity.position[0] * DEFAULT_TILE_SIZE;
                const ey = entity.position[1] * DEFAULT_TILE_SIZE;
                return worldPos.x >= ex && worldPos.x < ex + DEFAULT_TILE_SIZE &&
                       worldPos.y >= ey && worldPos.y < ey + DEFAULT_TILE_SIZE;
            });
            selectEntity(hit?.id || null);
        } else if (activeTool === 'stamp' || activeTool === 'random' || activeTool === 'erase') {
            if (drawMode === 'flood') {
                // Flood fill mode: uses bucketFillAdvanced with stencil/random/erase support
                if (selectedLayerId && tx >= 0 && tx < currentMap.width && ty >= 0 && ty < currentMap.height) {
                    const patternData = getPattern();
                    
                    if (activeTool === 'erase') {
                        // Erase flood fill - clears all tiles in the area
                        bucketFillAdvanced(selectedLayerId, tx, ty, { mode: 'erase' });
                    } else if (activeTool === 'random' && activeTilesetId) {
                        // Random flood fill - each tile gets a random selection
                        bucketFillAdvanced(selectedLayerId, tx, ty, {
                            mode: 'random',
                            tilesetId: activeTilesetId,
                            tileIndex: selectedTileIndex ?? undefined,
                            tileIndices: selectedTileIndices && selectedTileIndices.length > 0 ? selectedTileIndices : undefined,
                        });
                    } else if (activeTool === 'stamp' && activeTilesetId) {
                        // Stamp flood fill - supports stencil patterns
                        bucketFillAdvanced(selectedLayerId, tx, ty, {
                            mode: 'stamp',
                            tilesetId: activeTilesetId,
                            tileIndex: selectedTileIndex ?? undefined,
                            pattern: patternData ?? undefined,
                        });
                    }
                }
            } else if (drawMode === 'point') {
                // Point mode: click to paint single tile, or shift+click to draw line from anchor
                if (e.shiftKey && lineAnchorRef.current) {
                    // Draw line from anchor to current position
                    applyShape('line', lineAnchorRef.current, { x: tx, y: ty }, (activeTool === 'stamp' || activeTool === 'random') ? 'paint' : 'erase');
                    // Update anchor to end of line for chaining
                    lineAnchorRef.current = { x: tx, y: ty };
                } else {
                    // Set new anchor point and paint single tile
                    lineAnchorRef.current = { x: tx, y: ty };
                    applyShape('point', { x: tx, y: ty }, { x: tx, y: ty }, (activeTool === 'stamp' || activeTool === 'random') ? 'paint' : 'erase');
                }
            } else {
                // Rect, circle, line modes: click-drag-release
                drawStartRef.current = { x: tx, y: ty };
                isDrawingRef.current = true;
                setDrawPreview({ isDrawing: true, start: { x: tx, y: ty }, end: { x: tx, y: ty } });
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
    }, [viewport, currentMap, activeTool, drawMode, selectedLayerId, activeTilesetId, selectedTileIndex, selectedTileIndices, selectedEntityTypeId, activeVariationId, screenToTile, applyShape, selectEntity, bucketFillAdvanced, getPattern, placeEntity, setDrawPreview, setSelectedTile, setActiveTileset]);

    // Handle pointer move
    const handlePointerMove = useCallback((e: PointerEvent) => {
        if (!viewport || !currentMap) return;

        const tile = screenToTile(e.clientX, e.clientY);
        if (tile && tile.x >= 0 && tile.x < currentMap.width && tile.y >= 0 && tile.y < currentMap.height) {
            setHoveredTile({ x: tile.x, y: tile.y });
        } else {
            setHoveredTile(null);
        }

        // Update shift key state for line preview
        isShiftHeldRef.current = e.shiftKey;

        // Show line preview when in point mode with anchor and shift held
        if (drawMode === 'point' && lineAnchorRef.current && tile && e.shiftKey) {
            setDrawPreview({ isDrawing: true, start: lineAnchorRef.current, end: { x: tile.x, y: tile.y } });
        } else if (drawMode === 'point' && !e.shiftKey && !isDrawingRef.current) {
            // Clear line preview when shift released in point mode
            setDrawPreview({ isDrawing: false, start: null, end: null });
        }

        // Update live draw preview while dragging a rect/circle/line
        if (isDrawingRef.current && drawStartRef.current && tile) {
            setDrawPreview({ isDrawing: true, start: drawStartRef.current, end: { x: tile.x, y: tile.y } });
        }

        // Paint/erase while dragging in point mode - use applyShape for proper brush/stencil support
        if (e.buttons === 1 && !e.altKey && !e.shiftKey && drawMode === 'point' && selectedLayerId && tile) {
            const { x: tx, y: ty } = tile;
            if (tx >= 0 && tx < currentMap.width && ty >= 0 && ty < currentMap.height) {
                if ((activeTool === 'stamp' || activeTool === 'random') && activeTilesetId) {
                    applyShape('point', { x: tx, y: ty }, { x: tx, y: ty }, 'paint');
                } else if (activeTool === 'erase') {
                    applyShape('point', { x: tx, y: ty }, { x: tx, y: ty }, 'erase');
                }
            }
        }
    }, [viewport, currentMap, drawMode, selectedLayerId, activeTool, activeTilesetId, screenToTile, setHoveredTile, setDrawPreview, applyShape]);

    // Handle pointer up
    const handlePointerUp = useCallback((e: PointerEvent) => {
        if (isDrawingRef.current && drawStartRef.current && currentMap && drawMode !== 'flood') {
            const tile = screenToTile(e.clientX, e.clientY);
            // Clear preview immediately to avoid flicker after commit
            setDrawPreview({ isDrawing: false, start: null, end: null });
            if (tile) {
                applyShape(drawMode as 'point' | 'rect' | 'circle' | 'line', drawStartRef.current, tile, (activeTool === 'stamp' || activeTool === 'random') ? 'paint' : 'erase');
            }
        }
        isDrawingRef.current = false;
        drawStartRef.current = null;
        setDrawPreview({ isDrawing: false, start: null, end: null });
    }, [currentMap, drawMode, activeTool, screenToTile, applyShape, setDrawPreview]);

    // Set up event listeners
    useEffect(() => {
        if (!viewport) return;

        const view = viewport.options.events?.domElement;
        if (!view) return;

        view.addEventListener('pointerdown', handlePointerDown);
        view.addEventListener('pointermove', handlePointerMove);
        view.addEventListener('pointerup', handlePointerUp);

        return () => {
            view.removeEventListener('pointerdown', handlePointerDown);
            view.removeEventListener('pointermove', handlePointerMove);
            view.removeEventListener('pointerup', handlePointerUp);
        };
    }, [viewport, handlePointerDown, handlePointerMove, handlePointerUp]);

    // Reset drawing state when tool/mode changes
    useEffect(() => {
        isDrawingRef.current = false;
        drawStartRef.current = null;
        lineAnchorRef.current = null;
        setDrawPreview({ isDrawing: false, start: null, end: null });
    }, [activeTool, drawMode, setDrawPreview]);

    // Keyboard listeners for shift key (for point mode line preview)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Shift' && drawMode === 'point' && lineAnchorRef.current) {
                isShiftHeldRef.current = true;
                // Trigger preview update via hoveredTile
                const hoveredTile = useEditorStore.getState().hoveredTile;
                if (hoveredTile) {
                    setDrawPreview({ isDrawing: true, start: lineAnchorRef.current, end: hoveredTile });
                }
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Shift') {
                isShiftHeldRef.current = false;
                setDrawPreview({ isDrawing: false, start: null, end: null });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [drawMode, setDrawPreview]);

    return {
        screenToTile,
        applyShape
    };
}
