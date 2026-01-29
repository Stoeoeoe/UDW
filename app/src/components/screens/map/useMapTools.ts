import { useCallback, useRef, useEffect } from 'react';
import { Viewport } from 'pixi-viewport';
import { useEditorStore } from '../../../store/useEditorStore';
import { resolveEntities } from '../../../lib/mapUtils';
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

    const paintTile = useEditorStore(state => state.paintTile);
    const paintTilesBatch = useEditorStore(state => state.paintTilesBatch);
    const eraseTile = useEditorStore(state => state.eraseTile);
    const eraseTilesBatch = useEditorStore(state => state.eraseTilesBatch);
    const bucketFill = useEditorStore(state => state.bucketFill);
    const placeEntity = useEditorStore(state => state.placeEntity);
    const selectEntity = useEditorStore(state => state.selectEntity);
    const setHoveredTile = useEditorStore(state => state.setHoveredTile);
    const setDrawPreview = useEditorStore(state => state.setDrawPreview);

    const isDrawingRef = useRef(false);
    const drawStartRef = useRef<{ x: number; y: number } | null>(null);

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

    // Build pattern from multi-tile selection
    const getPattern = useCallback(() => {
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
    }, [selectedTileIndices, activeTilesetId, tilesets]);

    // Apply a shape (point, rect, circle) - uses batch updates for performance
    const applyShape = useCallback((
        mode: 'point' | 'rect' | 'circle',
        start: { x: number; y: number },
        end: { x: number; y: number },
        action: 'paint' | 'erase'
    ) => {
        if (!currentMap || !selectedLayerId) return;
        if (action === 'paint' && (!activeTilesetId || (selectedTileIndex === null && (!selectedTileIndices || selectedTileIndices.length === 0)))) return;

        const patternData = getPattern();
        const pattern = patternData?.pattern;
        const patternW = patternData?.patternW || 1;
        const patternH = patternData?.patternH || 1;

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

        if (mode === 'point') {
            collectTile(end.x, end.y);
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
        }

        // Execute batch updates (single store mutation each)
        if (tilesToPaint.length > 0) {
            paintTilesBatch(selectedLayerId, tilesToPaint);
        }
        if (tilesToErase.length > 0) {
            eraseTilesBatch(selectedLayerId, tilesToErase);
        }
    }, [currentMap, selectedLayerId, activeTilesetId, selectedTileIndex, selectedTileIndices, getPattern, paintTilesBatch, eraseTilesBatch]);

    // Handle pointer down
    const handlePointerDown = useCallback((e: PointerEvent) => {
        if (!viewport || !currentMap) return;

        // Let viewport handle middle mouse and alt+left for panning
        if (e.button === 1 || (e.button === 0 && e.altKey)) return;

        const tile = screenToTile(e.clientX, e.clientY);
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
        } else if (activeTool === 'tilePaint' || activeTool === 'tileErase') {
            if (drawMode === 'point') {
                applyShape('point', { x: tx, y: ty }, { x: tx, y: ty }, activeTool === 'tilePaint' ? 'paint' : 'erase');
            } else {
                drawStartRef.current = { x: tx, y: ty };
                isDrawingRef.current = true;
                setDrawPreview({ isDrawing: true, start: { x: tx, y: ty }, end: { x: tx, y: ty } });
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
    }, [viewport, currentMap, activeTool, drawMode, selectedLayerId, activeTilesetId, selectedTileIndex, selectedEntityTypeId, activeVariationId, screenToTile, applyShape, selectEntity, bucketFill, placeEntity]);

    // Handle pointer move
    const handlePointerMove = useCallback((e: PointerEvent) => {
        if (!viewport || !currentMap) return;

        const tile = screenToTile(e.clientX, e.clientY);
        if (tile && tile.x >= 0 && tile.x < currentMap.width && tile.y >= 0 && tile.y < currentMap.height) {
            setHoveredTile({ x: tile.x, y: tile.y });
        } else {
            setHoveredTile(null);
        }

        // Update live draw preview while dragging a rect/circle
        if (isDrawingRef.current && drawStartRef.current && tile) {
            setDrawPreview({ isDrawing: true, start: drawStartRef.current, end: { x: tile.x, y: tile.y } });
        }

        // Paint/erase while dragging in point mode
        if (e.buttons === 1 && !e.altKey && drawMode === 'point' && selectedLayerId && tile) {
            const { x: tx, y: ty } = tile;
            if (tx >= 0 && tx < currentMap.width && ty >= 0 && ty < currentMap.height) {
                if (activeTool === 'tilePaint' && activeTilesetId && selectedTileIndex !== null) {
                    paintTile(selectedLayerId, tx, ty, activeTilesetId, selectedTileIndex);
                } else if (activeTool === 'tileErase') {
                    eraseTile(selectedLayerId, tx, ty);
                }
            }
        }
    }, [viewport, currentMap, drawMode, selectedLayerId, activeTool, activeTilesetId, selectedTileIndex, screenToTile, setHoveredTile, paintTile, eraseTile]);

    // Handle pointer up
    const handlePointerUp = useCallback((e: PointerEvent) => {
        if (isDrawingRef.current && drawStartRef.current && currentMap) {
            const tile = screenToTile(e.clientX, e.clientY);
            // Clear preview immediately to avoid flicker after commit
            setDrawPreview({ isDrawing: false, start: null, end: null });
            if (tile) {
                applyShape(drawMode, drawStartRef.current, tile, activeTool === 'tilePaint' ? 'paint' : 'erase');
            }
        }
        isDrawingRef.current = false;
        drawStartRef.current = null;
        setDrawPreview({ isDrawing: false, start: null, end: null });
    }, [currentMap, drawMode, activeTool, screenToTile, applyShape]);

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
    }, [activeTool, drawMode]);

    return {
        screenToTile,
        applyShape
    };
}
