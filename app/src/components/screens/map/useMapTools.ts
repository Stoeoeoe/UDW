import { useCallback, useRef, useEffect } from 'react';
import { Viewport } from 'pixi-viewport';
import { useEditorStore } from '../../../store/useEditorStore';
import { resolveEntities, resolveTileAt } from '../../../lib/mapUtils';
import { DEFAULT_TILE_SIZE } from '../../../config/constants';
import {
  screenToTile as screenToTileUtil,
  screenToWorld as screenToWorldUtil,
} from '../../../lib/viewportUtils';
import { getPattern as getPatternUtil } from '../../../lib/patternUtils';
import { applyShape as applyShapeUtil } from '../../../lib/shapeUtils';
import { applyTerrainShape as applyTerrainShapeUtil } from '../../../lib/terrainShapeUtils';
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
  const currentMap = useEditorStore((state) => state.currentMap);
  const activeVariationId = useEditorStore((state) => state.activeVariationId);
  const activeTilesetId = useEditorStore((state) => state.activeTilesetId);
  const selectedTileIndex = useEditorStore((state) => state.selectedTileIndex);
  const selectedTileIndices = useEditorStore((state) => state.selectedTileIndices);
  const sampledPattern = useEditorStore((state) => state.sampledPattern);
  const activeTool = useEditorStore((state) => state.activeTool);
  const drawMode = useEditorStore((state) => state.drawMode);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const selectedEntityTypeId = useEditorStore((state) => state.selectedEntityTypeId);
  const tilesets = useEditorStore((state) => state.tilesets);

  const paintTilesBatch = useEditorStore((state) => state.paintTilesBatch);
  const eraseTilesBatch = useEditorStore((state) => state.eraseTilesBatch);
  const bucketFillAdvanced = useEditorStore((state) => state.bucketFillAdvanced);
  const placeEntity = useEditorStore((state) => state.placeEntity);
  const removeEntity = useEditorStore((state) => state.removeEntity);
  const moveEntity = useEditorStore((state) => state.moveEntity);
  const selectEntity = useEditorStore((state) => state.selectEntity);
  const setHoveredTile = useEditorStore((state) => state.setHoveredTile);
  const setDrawPreview = useEditorStore((state) => state.setDrawPreview);
  const setSelectedTile = useEditorStore((state) => state.setSelectedTile);
  const setSelectedTiles = useEditorStore((state) => state.setSelectedTiles);
  const setActiveTileset = useEditorStore((state) => state.setActiveTileset);
  const setSampledPattern = useEditorStore((state) => state.setSampledPattern);
  const selectedTerrainId = useEditorStore((state) => state.selectedTerrainId);
  const entitySnapMode = useEditorStore((state) => state.entitySnapMode);

  const isDrawingRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const lineAnchorRef = useRef<{ x: number; y: number } | null>(null); // For line tool: last clicked anchor
  const draggingEntityRef = useRef<string | null>(null); // Entity id being dragged
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null); // Click offset within entity bounds
  const isShiftHeldRef = useRef(false); // Track shift key state
  const terrainGridRef = useRef<Map<string, string | null>>(new Map()); // Terrain grid cache for terrain brush
  const lastTerrainPaintRef = useRef<{ x: number; y: number } | null>(null); // Track last painted position to avoid duplicates
  const isSamplingRef = useRef(false); // Track right-click eyedropper sampling mode
  const sampleStartRef = useRef<{ x: number; y: number } | null>(null); // Start position for sampling rectangle

  // Convert screen coordinates to tile coordinates (delegates to shared util)
  const screenToTile = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null =>
      screenToTileUtil(viewport, clientX, clientY),
    [viewport],
  );

  // Build pattern (delegates to shared util)
  const getPattern = useCallback(
    () =>
      getPatternUtil({
        activeTool,
        sampledPattern,
        selectedTileIndices,
        activeTilesetId,
        tilesets,
      }),
    [activeTool, sampledPattern, selectedTileIndices, activeTilesetId, tilesets],
  );

  // Apply a shape (delegates to shared util)
  const applyShape = useCallback(
    (
      mode: 'point' | 'rect' | 'circle' | 'line',
      start: { x: number; y: number },
      end: { x: number; y: number },
      action: 'paint' | 'erase',
    ) => {
      const brushSize = useEditorStore.getState().brushSize;
      return applyShapeUtil({
        currentMap,
        selectedLayerId,
        activeTilesetId,
        selectedTileIndex,
        selectedTileIndices,
        activeTool,
        tilesets,
        paintTilesBatch,
        eraseTilesBatch,
        getPattern,
        brushSize,
        mode,
        start,
        end,
        action,
      });
    },
    [
      currentMap,
      selectedLayerId,
      activeTilesetId,
      selectedTileIndex,
      selectedTileIndices,
      activeTool,
      tilesets,
      paintTilesBatch,
      eraseTilesBatch,
      getPattern,
    ],
  );

  // Apply terrain brush (delegates to shared util)
  const applyTerrainShape = useCallback(
    (
      mode: 'point' | 'rect' | 'circle' | 'line',
      start: { x: number; y: number },
      end: { x: number; y: number },
      terrainId: string | null,
    ) => {
      const brushSize = useEditorStore.getState().brushSize;
      return applyTerrainShapeUtil({
        currentMap,
        selectedLayerId,
        activeTilesetId,
        tilesets,
        paintTilesBatch,
        eraseTilesBatch,
        brushSize,
        mode,
        start,
        end,
        terrainId,
        terrainGridRef: terrainGridRef.current,
      });
    },
    [currentMap, selectedLayerId, activeTilesetId, tilesets, paintTilesBatch, eraseTilesBatch],
  );

  // Handle pointer down
  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (!viewport || !currentMap) return;

      // Let viewport handle middle mouse for panning
      if (e.button === 1) return;

      const tile = screenToTile(e.clientX, e.clientY);
      if (!tile) return;

      // Right Click = Eyedropper: sample tiles from map (supports drag for multi-tile patterns)
      // Works in stamp/random/erase modes
      if (
        e.button === 2 &&
        (activeTool === 'stamp' || activeTool === 'random' || activeTool === 'erase')
      ) {
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

      if (activeTool === 'entitySelect' || activeTool === 'entityDelete') {
        const worldPos = screenToWorldUtil(viewport, e.clientX, e.clientY);
        if (!worldPos) return;
        const resolvedEntities = resolveEntities(currentMap, activeVariationId);
        const { entityTypes: allEntityTypes } = useEditorStore.getState();
        const hit = [...resolvedEntities].reverse().find((entity) => {
          const type = allEntityTypes.find((t) => t.id === entity.typeId);
          const [ew, eh] = type?.defaultSize ?? [DEFAULT_TILE_SIZE, DEFAULT_TILE_SIZE];
          const ex = entity.position[0];
          const ey = entity.position[1];
          return (
            worldPos.x >= ex && worldPos.x < ex + ew && worldPos.y >= ey && worldPos.y < ey + eh
          );
        });
        if (activeTool === 'entityDelete') {
          if (hit) removeEntity(hit.id);
        } else {
          selectEntity(hit?.id || null);
          if (hit) {
            draggingEntityRef.current = hit.id;
            dragOffsetRef.current = {
              x: worldPos.x - hit.position[0],
              y: worldPos.y - hit.position[1],
            };
          } else {
            draggingEntityRef.current = null;
            dragOffsetRef.current = null;
          }
        }
      } else if (activeTool === 'select') {
        selectEntity(null);
      } else if (activeTool === 'stamp' || activeTool === 'random' || activeTool === 'erase') {
        if (drawMode === 'flood') {
          // Flood fill mode: uses bucketFillAdvanced with stencil/random/erase support
          if (
            selectedLayerId &&
            tx >= 0 &&
            tx < currentMap.width &&
            ty >= 0 &&
            ty < currentMap.height
          ) {
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
                tileIndices:
                  selectedTileIndices && selectedTileIndices.length > 0
                    ? selectedTileIndices
                    : undefined,
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
            applyShape(
              'line',
              lineAnchorRef.current,
              { x: tx, y: ty },
              activeTool === 'stamp' || activeTool === 'random' ? 'paint' : 'erase',
            );
            // Update anchor to end of line for chaining
            lineAnchorRef.current = { x: tx, y: ty };
          } else {
            // Set new anchor point and paint single tile
            lineAnchorRef.current = { x: tx, y: ty };
            applyShape(
              'point',
              { x: tx, y: ty },
              { x: tx, y: ty },
              activeTool === 'stamp' || activeTool === 'random' ? 'paint' : 'erase',
            );
          }
        } else {
          // Rect, circle, line modes: click-drag-release
          drawStartRef.current = { x: tx, y: ty };
          isDrawingRef.current = true;
          setDrawPreview({
            isDrawing: true,
            start: { x: tx, y: ty },
            end: { x: tx, y: ty },
            mode: 'draw',
          });
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
          setDrawPreview({
            isDrawing: true,
            start: { x: tx, y: ty },
            end: { x: tx, y: ty },
            mode: 'draw',
          });
        }
      } else if (activeTool === 'entityPlace' && selectedEntityTypeId) {
        const entityTypes = useEditorStore.getState().entityTypes;
        const type = entityTypes.find((t) => t.id === selectedEntityTypeId);
        if (type) {
          // Only place entities when an entity layer is selected
          const selLayer = currentMap?.layers.find((l) => l.id === selectedLayerId);
          if (selLayer && selLayer.kind === 'entity') {
            // Always store absolute pixel position (rounded to integer)
            // Grid mode snaps to tile grid; pixel mode places freely
            const worldPos = screenToWorldUtil(viewport, e.clientX, e.clientY);
            let position: [number, number];
            if (worldPos) {
              if (entitySnapMode === 'grid') {
                // Snap to tile grid
                position = [
                  Math.floor(worldPos.x / DEFAULT_TILE_SIZE) * DEFAULT_TILE_SIZE,
                  Math.floor(worldPos.y / DEFAULT_TILE_SIZE) * DEFAULT_TILE_SIZE,
                ];
              } else {
                position = [Math.round(worldPos.x), Math.round(worldPos.y)];
              }
            } else {
              // Fallback using tile coords
              position = [tx * DEFAULT_TILE_SIZE, ty * DEFAULT_TILE_SIZE];
            }
            placeEntity({
              id: `ent-${Date.now()}`,
              typeId: selectedEntityTypeId,
              position,
              properties: type.properties.reduce(
                (acc, p) => ({ ...acc, [p.key]: p.defaultValue }),
                {},
              ),
            });
          }
        }
      }
    },
    [
      viewport,
      currentMap,
      activeTool,
      drawMode,
      selectedLayerId,
      activeTilesetId,
      selectedTileIndex,
      selectedTileIndices,
      selectedEntityTypeId,
      activeVariationId,
      selectedTerrainId,
      entitySnapMode,
      screenToTile,
      applyShape,
      applyTerrainShape,
      selectEntity,
      removeEntity,
      bucketFillAdvanced,
      getPattern,
      placeEntity,
      setDrawPreview,
    ],
  );

  // Handle pointer move
  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!viewport || !currentMap) return;

      const tile = screenToTile(e.clientX, e.clientY);
      if (
        tile &&
        tile.x >= 0 &&
        tile.x < currentMap.width &&
        tile.y >= 0 &&
        tile.y < currentMap.height
      ) {
        setHoveredTile({ x: tile.x, y: tile.y });
      } else {
        setHoveredTile(null);
      }

      // Update shift key state for line preview
      isShiftHeldRef.current = e.shiftKey;

      // Show line preview when in point mode with anchor and shift held
      if (
        drawMode === 'point' &&
        lineAnchorRef.current &&
        tile &&
        e.shiftKey &&
        activeTool !== 'terrain'
      ) {
        setDrawPreview({
          isDrawing: true,
          start: lineAnchorRef.current,
          end: { x: tile.x, y: tile.y },
          mode: 'draw',
        });
      } else if (
        drawMode === 'point' &&
        !e.shiftKey &&
        !isDrawingRef.current &&
        activeTool !== 'terrain'
      ) {
        // Clear line preview when shift released in point mode
        setDrawPreview({ isDrawing: false, start: null, end: null });
      }

      // Update live draw preview while dragging a rect/circle/line (for both tile tools and terrain)
      if (isDrawingRef.current && drawStartRef.current && tile && drawMode !== 'point') {
        setDrawPreview({
          isDrawing: true,
          start: drawStartRef.current,
          end: { x: tile.x, y: tile.y },
          mode: 'draw',
        });
      }

      // Move entity while dragging with entitySelect
      if (e.buttons === 1 && activeTool === 'entitySelect' && draggingEntityRef.current) {
        const worldPos = screenToWorldUtil(viewport, e.clientX, e.clientY);
        if (worldPos) {
          const { entitySnapMode: snapMode } = useEditorStore.getState();
          const offset = dragOffsetRef.current ?? { x: 0, y: 0 };
          const rawX = worldPos.x - offset.x;
          const rawY = worldPos.y - offset.y;
          let position: [number, number];
          if (snapMode === 'grid') {
            position = [
              Math.floor(rawX / DEFAULT_TILE_SIZE) * DEFAULT_TILE_SIZE,
              Math.floor(rawY / DEFAULT_TILE_SIZE) * DEFAULT_TILE_SIZE,
            ];
          } else {
            position = [Math.round(rawX), Math.round(rawY)];
          }
          moveEntity(draggingEntityRef.current, position);
        }
      }

      // Paint/erase while dragging in point mode - use applyShape for proper brush/stencil support
      if (
        e.buttons === 1 &&
        !e.altKey &&
        !e.shiftKey &&
        drawMode === 'point' &&
        selectedLayerId &&
        tile
      ) {
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
      if (
        e.buttons === 1 &&
        activeTool === 'terrain' &&
        isDrawingRef.current &&
        tile &&
        drawMode === 'point'
      ) {
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
        setDrawPreview({
          isDrawing: true,
          start: sampleStartRef.current,
          end: { x: tile.x, y: tile.y },
          mode: 'select',
        });
      }
    },
    [
      viewport,
      currentMap,
      drawMode,
      selectedLayerId,
      activeTool,
      activeTilesetId,
      selectedTerrainId,
      screenToTile,
      setHoveredTile,
      setDrawPreview,
      applyShape,
      applyTerrainShape,
      moveEntity,
    ],
  );

  // Handle pointer up
  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
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
            const tileRef = resolveTileAt(
              currentMap,
              selectedLayerId,
              tile.x,
              tile.y,
              activeVariationId,
            );
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
          const pattern: (number | null)[][] = Array.from({ length: height }, () =>
            Array(width).fill(null),
          );
          let firstTilesetId: string | null = null;

          for (let ty = minY; ty <= maxY; ty++) {
            for (let tx = minX; tx <= maxX; tx++) {
              if (tx >= 0 && tx < currentMap.width && ty >= 0 && ty < currentMap.height) {
                const tileRef = resolveTileAt(
                  currentMap,
                  selectedLayerId,
                  tx,
                  ty,
                  activeVariationId,
                );
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
              height,
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
                let minCol = Infinity,
                  maxCol = -Infinity;
                let minRow = Infinity,
                  maxRow = -Infinity;
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
      if (
        isDrawingRef.current &&
        drawStartRef.current &&
        currentMap &&
        activeTool === 'terrain' &&
        drawMode !== 'point'
      ) {
        const tile = screenToTile(e.clientX, e.clientY);
        setDrawPreview({ isDrawing: false, start: null, end: null });
        if (tile) {
          applyTerrainShape(
            drawMode as 'rect' | 'circle' | 'line',
            drawStartRef.current,
            tile,
            selectedTerrainId,
          );
        }
      }

      if (
        isDrawingRef.current &&
        drawStartRef.current &&
        currentMap &&
        drawMode !== 'flood' &&
        activeTool !== 'terrain'
      ) {
        const tile = screenToTile(e.clientX, e.clientY);
        // Clear preview immediately to avoid flicker after commit
        setDrawPreview({ isDrawing: false, start: null, end: null });
        if (tile) {
          applyShape(
            drawMode as 'point' | 'rect' | 'circle' | 'line',
            drawStartRef.current,
            tile,
            activeTool === 'stamp' || activeTool === 'random' ? 'paint' : 'erase',
          );
        }
      }
      isDrawingRef.current = false;
      drawStartRef.current = null;
      lastTerrainPaintRef.current = null;
      draggingEntityRef.current = null;
      dragOffsetRef.current = null;
      setDrawPreview({ isDrawing: false, start: null, end: null });
    },
    [
      currentMap,
      selectedLayerId,
      activeVariationId,
      drawMode,
      activeTool,
      selectedTerrainId,
      tilesets,
      screenToTile,
      applyShape,
      applyTerrainShape,
      setDrawPreview,
      setActiveTileset,
      setSelectedTile,
      setSelectedTiles,
      setSampledPattern,
    ],
  );

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
          setDrawPreview({
            isDrawing: true,
            start: lineAnchorRef.current,
            end: hoveredTile,
            mode: 'draw',
          });
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
    applyShape,
  };
}
