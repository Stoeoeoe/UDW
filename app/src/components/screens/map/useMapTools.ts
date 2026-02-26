import { useCallback, useRef, useEffect } from 'react';
import { Viewport } from 'pixi-viewport';
import { useEditorStore } from '../../../store/useEditorStore';
import { resolveEntities, resolveTileAt } from '../../../lib/mapUtils';
import { DEFAULT_TILE_SIZE } from '../../../config/constants';
import {
    buildTerrainGridFromLayer,
    applyTerrainToTile,
    getCornerTerrainsForTile,
    findBestMatchingTileWithFallback,
} from '../../../lib/terrainUtils';
import { buildPatternFromSelection } from '../../../lib/tileUtils';
import { sampleRandomTile } from '../../../lib/randomUtils';
import { bresenhamLine, circularBrush } from '../../../lib/algorithms';

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
    const sampledPattern = useEditorStore(state => state.sampledPattern);
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
    const setSelectedTiles = useEditorStore(state => state.setSelectedTiles);
    const setActiveTileset = useEditorStore(state => state.setActiveTileset);
    const setSampledPattern = useEditorStore(state => state.setSampledPattern);
    const selectedTerrainId = useEditorStore(state => state.selectedTerrainId);

    const isDrawingRef = useRef(false);
    const drawStartRef = useRef<{ x: number; y: number } | null>(null);
    const lineAnchorRef = useRef<{ x: number; y: number } | null>(null); // For line tool: last clicked anchor
    const isShiftHeldRef = useRef(false); // Track shift key state
    const terrainGridRef = useRef<Map<string, string | null>>(new Map()); // Terrain grid cache for terrain brush
    const lastTerrainPaintRef = useRef<{ x: number; y: number } | null>(null); // Track last painted position to avoid duplicates
    const isSamplingRef = useRef(false); // Track right-click eyedropper sampling mode
    const sampleStartRef = useRef<{ x: number; y: number } | null>(null); // Start position for sampling rectangle

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

    // Build pattern from multi-tile selection or use sampled pattern from right-click copy
    // Priority: sampledPattern > multi-tile selection > single tile (no pattern)
    const getPattern = useCallback(() => {
        if (activeTool === 'random') return null;
        
        // Priority 1: Use sampled pattern if available (from right-click copy)
        if (sampledPattern && sampledPattern.tilesetId === activeTilesetId) {
            return {
                pattern: sampledPattern.pattern,
                patternW: sampledPattern.width,
                patternH: sampledPattern.height,
                minCol: 0,
                minRow: 0
            };
        }
        
        // Priority 2: Build pattern from multi-tile selection (2+ tiles)
        if (!selectedTileIndices || selectedTileIndices.length <= 1 || !activeTilesetId) return null;

        const ts = tilesets.get(activeTilesetId);
        if (!ts) return null;

        return buildPatternFromSelection(selectedTileIndices, ts);
    }, [activeTool, sampledPattern, selectedTileIndices, activeTilesetId, tilesets]);

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

        // Get tileset for random sampling
        const ts = activeTilesetId ? tilesets.get(activeTilesetId) : undefined;

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
                        const chosen = sampleRandomTile(selectedTileIndices, ts);
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
            
            // Use shared circular brush utility
            for (const { x, y } of circularBrush(cx, cy, radius)) {
                collectTile(x, y);
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
            // Use shared Bresenham algorithm with brush size
            for (const { x, y } of bresenhamLine(start.x, start.y, end.x, end.y)) {
                collectBrush(x, y, effectiveBrushSize);
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

    // Apply terrain brush over a shape (point, rect, circle, line)
    const applyTerrainShape = useCallback((
        mode: 'point' | 'rect' | 'circle' | 'line',
        start: { x: number; y: number },
        end: { x: number; y: number },
        terrainId: string | null
    ) => {
        if (!currentMap || !selectedLayerId || !activeTilesetId) return;
        
        const tileset = tilesets.get(activeTilesetId);
        if (!tileset) return;

        const layer = currentMap.layers.find(l => l.id === selectedLayerId);
        if (!layer) return;

        // Get brush size for point and line modes
        const currentBrushSize = useEditorStore.getState().brushSize;
        const effectiveBrushSize = (mode === 'point' || mode === 'line') ? currentBrushSize : 1;

        // Helper to collect tiles in a circular brush
        const collectBrush = (cx: number, cy: number, positions: Array<{ x: number; y: number }>) => {
            for (const { x, y } of circularBrush(cx, cy, effectiveBrushSize)) {
                if (x >= 0 && x < currentMap.width && y >= 0 && y < currentMap.height) {
                    positions.push({ x, y });
                }
            }
        };

        // Collect all tile positions to paint
        const positions: Array<{ x: number; y: number }> = [];

        if (mode === 'point') {
            collectBrush(end.x, end.y, positions);
        } else if (mode === 'rect') {
            const minX = Math.min(start.x, end.x);
            const maxX = Math.max(start.x, end.x);
            const minY = Math.min(start.y, end.y);
            const maxY = Math.max(start.y, end.y);
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    if (x >= 0 && x < currentMap.width && y >= 0 && y < currentMap.height) {
                        positions.push({ x, y });
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
                    if (dist <= radius && x >= 0 && x < currentMap.width && y >= 0 && y < currentMap.height) {
                        positions.push({ x, y });
                    }
                }
            }
        } else if (mode === 'line') {
            for (const { x, y } of bresenhamLine(start.x, start.y, end.x, end.y)) {
                collectBrush(x, y, positions);
            }
        }

        if (positions.length === 0) return;

        // Build terrain grid fresh for this operation
        terrainGridRef.current = buildTerrainGridFromLayer(layer.data, tilesets, currentMap.tilesetRefs);

        // Apply terrain to all positions and collect all affected tiles
        const allTilesToUpdate = new Map<string, { tileX: number; tileY: number }>();

        for (const pos of positions) {
            const tilesToUpdate = applyTerrainToTile(
                pos.x,
                pos.y,
                terrainId,
                terrainGridRef.current,
                currentMap.width,
                currentMap.height
            );
            for (const tile of tilesToUpdate) {
                allTilesToUpdate.set(`${tile.tileX},${tile.tileY}`, tile);
            }
        }

        // Resolve tiles and paint
        const tilesToPaint: Array<{ x: number; y: number; tilesetId: string; tileIndex: number }> = [];
        const tilesToErase: Array<{ x: number; y: number }> = [];

        for (const { tileX, tileY } of allTilesToUpdate.values()) {
            if (tileX < 0 || tileX >= currentMap.width || tileY < 0 || tileY >= currentMap.height) continue;

            const corners = getCornerTerrainsForTile(tileX, tileY, terrainGridRef.current);
            const matchingTile = findBestMatchingTileWithFallback(tileset, corners, true);

            if (matchingTile !== null) {
                tilesToPaint.push({ x: tileX, y: tileY, tilesetId: activeTilesetId, tileIndex: matchingTile });
            } else if (corners.every(c => c === null)) {
                tilesToErase.push({ x: tileX, y: tileY });
            }
        }

        if (tilesToPaint.length > 0) {
            paintTilesBatch(selectedLayerId, tilesToPaint);
        }
        if (tilesToErase.length > 0) {
            eraseTilesBatch(selectedLayerId, tilesToErase);
        }
    }, [currentMap, selectedLayerId, activeTilesetId, tilesets, paintTilesBatch, eraseTilesBatch]);

    // Handle pointer down
    const handlePointerDown = useCallback((e: PointerEvent) => {
        if (!viewport || !currentMap) return;

        // Let viewport handle middle mouse for panning
        if (e.button === 1) return;

        const tile = screenToTile(e.clientX, e.clientY);
        if (!tile) return;

        // Right Click = Eyedropper: sample tiles from map (supports drag for multi-tile patterns)
        // Works in stamp/random/erase modes
        if (e.button === 2 && ((activeTool === 'stamp' || activeTool === 'random' || activeTool === 'erase'))) {
            if (!selectedLayerId) return;
            const { x: tx, y: ty } = tile;
            if (tx < 0 || tx >= currentMap.width || ty < 0 || ty >= currentMap.height) return;
            
            // Start sampling mode - will complete on pointer up
            isSamplingRef.current = true;
            sampleStartRef.current = { x: tx, y: ty };
            e.preventDefault();
            return;
        }

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
                setDrawPreview({ isDrawing: true, start: { x: tx, y: ty }, end: { x: tx, y: ty }, mode: 'draw' });
            }
        } else if (activeTool === 'terrain') {
            // Terrain brush: paint terrain at clicked position
            // Clear terrain grid cache when starting a new stroke
            terrainGridRef.current = new Map();
            lastTerrainPaintRef.current = { x: tx, y: ty };
            isDrawingRef.current = true;
            drawStartRef.current = { x: tx, y: ty };
            
            if (drawMode === 'point') {
                // Point mode: paint immediately on click with brush size support
                applyTerrainShape('point', { x: tx, y: ty }, { x: tx, y: ty }, selectedTerrainId);
            } else {
                // Rect, circle, line modes: show preview, apply on release
                setDrawPreview({ isDrawing: true, start: { x: tx, y: ty }, end: { x: tx, y: ty }, mode: 'draw' });
            }
        } else if (activeTool === 'entityPlace' && selectedEntityTypeId) {
            const entityTypes = useEditorStore.getState().entityTypes;
            const type = entityTypes.find(t => t.id === selectedEntityTypeId);
            if (type) {
                placeEntity({
                    id: `ent-${Date.now()}`,
                    typeId: selectedEntityTypeId,
                    position: [tx, ty],
                    properties: type.properties.reduce((acc, p) => ({ ...acc, [p.key]: p.defaultValue }), {})
                });
            }
        }
    }, [viewport, currentMap, activeTool, drawMode, selectedLayerId, activeTilesetId, selectedTileIndex, selectedTileIndices, selectedEntityTypeId, activeVariationId, selectedTerrainId, screenToTile, applyShape, applyTerrainShape, selectEntity, bucketFillAdvanced, getPattern, placeEntity, setDrawPreview]);

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
        if (drawMode === 'point' && lineAnchorRef.current && tile && e.shiftKey && activeTool !== 'terrain') {
            setDrawPreview({ isDrawing: true, start: lineAnchorRef.current, end: { x: tile.x, y: tile.y }, mode: 'draw' });
        } else if (drawMode === 'point' && !e.shiftKey && !isDrawingRef.current && activeTool !== 'terrain') {
            // Clear line preview when shift released in point mode
            setDrawPreview({ isDrawing: false, start: null, end: null });
        }

        // Update live draw preview while dragging a rect/circle/line (for both tile tools and terrain)
        if (isDrawingRef.current && drawStartRef.current && tile && drawMode !== 'point') {
            setDrawPreview({ isDrawing: true, start: drawStartRef.current, end: { x: tile.x, y: tile.y }, mode: 'draw' });
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

        // Continuous terrain painting while dragging (point mode only) - use applyTerrainShape for brush support
        if (e.buttons === 1 && activeTool === 'terrain' && isDrawingRef.current && tile && drawMode === 'point') {
            const { x: tx, y: ty } = tile;
            // Only paint if we've moved to a new position
            if (lastTerrainPaintRef.current?.x !== tx || lastTerrainPaintRef.current?.y !== ty) {
                lastTerrainPaintRef.current = { x: tx, y: ty };
                if (tx >= 0 && tx < currentMap.width && ty >= 0 && ty < currentMap.height) {
                    applyTerrainShape('point', { x: tx, y: ty }, { x: tx, y: ty }, selectedTerrainId);
                }
            }
        }

        // Show preview rectangle while sampling with right-click drag
        if (e.buttons === 2 && isSamplingRef.current && sampleStartRef.current && tile) {
            setDrawPreview({ isDrawing: true, start: sampleStartRef.current, end: { x: tile.x, y: tile.y }, mode: 'select' });
        }
    }, [viewport, currentMap, drawMode, selectedLayerId, activeTool, activeTilesetId, selectedTerrainId, screenToTile, setHoveredTile, setDrawPreview, applyShape, applyTerrainShape]);

    // Handle pointer up
    const handlePointerUp = useCallback((e: PointerEvent) => {
        // Handle right-click sampling completion
        if (isSamplingRef.current && sampleStartRef.current && currentMap && selectedLayerId) {
            const tile = screenToTile(e.clientX, e.clientY);
            if (tile) {
                const minX = Math.min(sampleStartRef.current.x, tile.x);
                const maxX = Math.max(sampleStartRef.current.x, tile.x);
                const minY = Math.min(sampleStartRef.current.y, tile.y);
                const maxY = Math.max(sampleStartRef.current.y, tile.y);
                const width = maxX - minX + 1;
                const height = maxY - minY + 1;

                // Single tile click (no drag) - use simple eyedropper
                if (width === 1 && height === 1) {
                    const tileRef = resolveTileAt(currentMap, selectedLayerId, tile.x, tile.y, activeVariationId);
                    if (tileRef) {
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
                    
                    isSamplingRef.current = false;
                    sampleStartRef.current = null;
                    setDrawPreview({ isDrawing: false, start: null, end: null });
                    return;
                }

                // Multi-tile drag - build pattern
                const pattern: (number | null)[][] = Array.from(
                    { length: height },
                    () => Array(width).fill(null)
                );
                let firstTilesetId: string | null = null;

                for (let ty = minY; ty <= maxY; ty++) {
                    for (let tx = minX; tx <= maxX; tx++) {
                        if (tx >= 0 && tx < currentMap.width && ty >= 0 && ty < currentMap.height) {
                            const tileRef = resolveTileAt(currentMap, selectedLayerId, tx, ty, activeVariationId);
                            if (tileRef) {
                                const colonIdx = tileRef.lastIndexOf(':');
                                if (colonIdx > 0) {
                                    const tilesetId = tileRef.substring(0, colonIdx);
                                    const tileIndex = parseInt(tileRef.substring(colonIdx + 1), 10);
                                    if (!isNaN(tileIndex)) {
                                        if (!firstTilesetId) firstTilesetId = tilesetId;
                                        // Only include tiles from the same tileset
                                        if (tilesetId === firstTilesetId) {
                                            pattern[ty - minY][tx - minX] = tileIndex;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if (firstTilesetId) {
                    // Set the active tileset
                    setActiveTileset(firstTilesetId);
                    
                    // Store the sampled pattern for stamping
                    setSampledPattern({
                        tilesetId: firstTilesetId,
                        pattern,
                        width,
                        height
                    });

                    // Check if tiles form a contiguous rectangle in the tileset
                    // Only highlight in tileset palette if they do
                    const ts = tilesets.get(firstTilesetId);
                    if (ts) {
                        const cols = ts.columns;
                        // Collect unique tile indices and their positions in tileset
                        const tileIndices: number[] = [];
                        for (let py = 0; py < height; py++) {
                            for (let px = 0; px < width; px++) {
                                const idx = pattern[py][px];
                                if (idx !== null && !tileIndices.includes(idx)) {
                                    tileIndices.push(idx);
                                }
                            }
                        }

                        // Check if tiles form a contiguous rectangle in tileset
                        if (tileIndices.length > 0) {
                            // Find bounding box in tileset
                            let minCol = Infinity, maxCol = -Infinity;
                            let minRow = Infinity, maxRow = -Infinity;
                            for (const idx of tileIndices) {
                                const c = idx % cols;
                                const r = Math.floor(idx / cols);
                                minCol = Math.min(minCol, c);
                                maxCol = Math.max(maxCol, c);
                                minRow = Math.min(minRow, r);
                                maxRow = Math.max(maxRow, r);
                            }
                            
                            const tilesetW = maxCol - minCol + 1;
                            const tilesetH = maxRow - minRow + 1;
                            
                            // Check if all expected tiles in the bounding box are present
                            const expectedCount = tilesetW * tilesetH;
                            const allPresent = expectedCount === tileIndices.length;
                            
                            // Also check if the arrangement matches (same dimensions)
                            const dimensionsMatch = tilesetW === width && tilesetH === height;
                            
                            if (allPresent && dimensionsMatch) {
                                // Tiles form a contiguous rectangle - highlight in tileset
                                if (tileIndices.length === 1) {
                                    setSelectedTile(tileIndices[0]);
                                } else {
                                    setSelectedTiles(tileIndices);
                                }
                            }
                            // If not contiguous, don't update tileset selection - 
                            // the sampledPattern will still be used for stamping
                        }
                    }
                }
            }
            
            isSamplingRef.current = false;
            sampleStartRef.current = null;
            setDrawPreview({ isDrawing: false, start: null, end: null });
            return;
        }

        // Handle terrain shape drawing on pointer up
        if (isDrawingRef.current && drawStartRef.current && currentMap && activeTool === 'terrain' && drawMode !== 'point') {
            const tile = screenToTile(e.clientX, e.clientY);
            setDrawPreview({ isDrawing: false, start: null, end: null });
            if (tile) {
                applyTerrainShape(drawMode as 'rect' | 'circle' | 'line', drawStartRef.current, tile, selectedTerrainId);
            }
        }

        if (isDrawingRef.current && drawStartRef.current && currentMap && drawMode !== 'flood' && activeTool !== 'terrain') {
            const tile = screenToTile(e.clientX, e.clientY);
            // Clear preview immediately to avoid flicker after commit
            setDrawPreview({ isDrawing: false, start: null, end: null });
            if (tile) {
                applyShape(drawMode as 'point' | 'rect' | 'circle' | 'line', drawStartRef.current, tile, (activeTool === 'stamp' || activeTool === 'random') ? 'paint' : 'erase');
            }
        }
        isDrawingRef.current = false;
        drawStartRef.current = null;
        lastTerrainPaintRef.current = null;
        setDrawPreview({ isDrawing: false, start: null, end: null });
    }, [currentMap, selectedLayerId, activeVariationId, drawMode, activeTool, selectedTerrainId, tilesets, screenToTile, applyShape, applyTerrainShape, setDrawPreview, setActiveTileset, setSelectedTile, setSelectedTiles, setSampledPattern]);

    // Set up event listeners
    useEffect(() => {
        if (!viewport) return;

        const view = viewport.options.events?.domElement;
        if (!view) return;

        // Prevent context menu on right-click (we use right-click for eyedropper)
        const preventContextMenu = (e: Event) => {
            e.preventDefault();
        };

        view.addEventListener('pointerdown', handlePointerDown);
        view.addEventListener('pointermove', handlePointerMove);
        view.addEventListener('pointerup', handlePointerUp);
        view.addEventListener('contextmenu', preventContextMenu);

        return () => {
            view.removeEventListener('pointerdown', handlePointerDown);
            view.removeEventListener('pointermove', handlePointerMove);
            view.removeEventListener('pointerup', handlePointerUp);
            view.removeEventListener('contextmenu', preventContextMenu);
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
                    setDrawPreview({ isDrawing: true, start: lineAnchorRef.current, end: hoveredTile, mode: 'draw' });
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
