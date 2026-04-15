import { useCallback, useRef, useEffect } from 'react';
import { Viewport } from 'pixi-viewport';
import {
  beginEditorHistoryBatch,
  endEditorHistoryBatch,
  useEditorStore,
} from '../../../store/useEditorStore';
import { resolveEntities, resolveTileAt } from '../../../lib/mapUtils';
import { DEFAULT_TILE_SIZE } from '../../../config/constants';
import {
  screenToTile as screenToTileUtil,
  screenToWorld as screenToWorldUtil,
} from '../../../lib/viewportUtils';
import { saveMapDebounced } from '../../../lib/saveManager';
import { getDefaultLinkTargetPosition, resolveLinkTarget } from '../../../lib/locationLinkUtils';
import { getPattern as getPatternUtil } from '../../../lib/patternUtils';
import { applyShape as applyShapeUtil } from '../../../lib/shapeUtils';
import { applyTerrainShape as applyTerrainShapeUtil } from '../../../lib/terrainShapeUtils';

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
  const projectTileSize = useEditorStore((state) => state.project?.tileSize ?? DEFAULT_TILE_SIZE);
  const tilesets = useEditorStore((state) => state.tilesets);

  const paintTilesBatch = useEditorStore((state) => state.paintTilesBatch);
  const eraseTilesBatch = useEditorStore((state) => state.eraseTilesBatch);
  const paintTerrainDataBatch = useEditorStore((state) => state.paintTerrainDataBatch);
  const bucketFillAdvanced = useEditorStore((state) => state.bucketFillAdvanced);
  const placeEntity = useEditorStore((state) => state.placeEntity);
  const removeEntity = useEditorStore((state) => state.removeEntity);
  const moveEntity = useEditorStore((state) => state.moveEntity);
  const selectEntity = useEditorStore((state) => state.selectEntity);
  const addAnchor = useEditorStore((state) => state.addAnchor);
  const updateAnchor = useEditorStore((state) => state.updateAnchor);
  const removeAnchor = useEditorStore((state) => state.removeAnchor);
  const selectAnchor = useEditorStore((state) => state.selectAnchor);
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
  const lineAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const draggingEntityRef = useRef<string | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null); // Entity drag offset
  const draggingAnchorRef = useRef<string | null>(null);
  const dragAnchorOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const draggingLinkRef = useRef<string | null>(null); // Link id being dragged
  const dragLinkOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const dragLinkEndRef = useRef<'source' | 'target'>('source'); // Which end is being dragged
  const draggingLinkHandleRef = useRef<string | null>(null); // e.g., 'nw','ne','sw','se','left','right','top','bottom'
  const dragLinkInitialRef = useRef<{ sx: number; sy: number; tw: number; th: number } | null>(null);
  const isShiftHeldRef = useRef(false);
  const terrainGridRef = useRef<Map<string, string | null>>(new Map());
  const lastTerrainPaintRef = useRef<{ x: number; y: number } | null>(null);
  const isSamplingRef = useRef(false);
  const sampleStartRef = useRef<{ x: number; y: number } | null>(null);
  const historyBatchActiveRef = useRef(false);

  const startHistoryBatch = useCallback(() => {
    if (!historyBatchActiveRef.current) {
      beginEditorHistoryBatch();
      historyBatchActiveRef.current = true;
    }
  }, []);

  const finishHistoryBatch = useCallback(() => {
    if (historyBatchActiveRef.current) {
      endEditorHistoryBatch();
      historyBatchActiveRef.current = false;
    }
  }, []);

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
        paintTerrainDataBatch,
        brushSize,
        mode,
        start,
        end,
        terrainId,
        terrainGridRef: terrainGridRef.current,
      });
    },
    [
      currentMap,
      selectedLayerId,
      activeTilesetId,
      tilesets,
      paintTilesBatch,
      eraseTilesBatch,
      paintTerrainDataBatch,
    ],
  );

  // Helper: hit-test all entities across all layers
  const hitTestEntity = useCallback(
    (worldX: number, worldY: number) => {
      const { entityTypes: allEntityTypes } = useEditorStore.getState();
      const resolvedEntities = resolveEntities(currentMap!, activeVariationId);
      return [...resolvedEntities].reverse().find((entity) => {
        const type = allEntityTypes.find((t) => t.id === entity.typeId);
        const [ew, eh] = type?.defaultSize ?? [projectTileSize, projectTileSize];
        return (
          worldX >= entity.position[0] &&
          worldX < entity.position[0] + ew &&
          worldY >= entity.position[1] &&
          worldY < entity.position[1] + eh
        );
      });
    },
    [currentMap, activeVariationId, projectTileSize],
  );

  // Helper: hit-test location links by tile position — returns link + which end was hit
  const hitTestLink = useCallback(
    (
      worldX: number,
      worldY: number,
    ):
      | { link: import('../../../types/schema').LocationLink; end: 'source' | 'target' }
      | undefined => {
      const { maps, selectedLinkId } = useEditorStore.getState();
      const links = currentMap?.locationLinks ?? [];
      const HANDLE_SIZE = 5; // must match renderer

      // Check source trigger areas first (in reverse so top link wins)
      // Expand hit area by HANDLE_SIZE for the selected link so handle clicks register
      const sourceHit = [...links].reverse().find((link) => {
        const [sx, sy] = link.sourcePosition; // pixels
        const [tw, th] = link.triggerSize; // pixels
        const expand = link.id === selectedLinkId ? HANDLE_SIZE : 0;
        return worldX >= sx - expand && worldX < sx + tw + expand && worldY >= sy - expand && worldY < sy + th + expand;
      });
      if (sourceHit) return { link: sourceHit, end: 'source' };

      // Then check target position (same-map links only). Targets are points (pixel-perfect)
      const targetRadius = Math.max(6, Math.floor(projectTileSize * 0.25));
      const targetRadiusSq = targetRadius * targetRadius;
      const targetHit = [...links].reverse().find((link) => {
        const isSameMap = !link.targetMapId || link.targetMapId === currentMap?.id;
        if (!isSameMap) return false;
        const [tx, ty] = resolveLinkTarget(link, currentMap, maps).position;
        const dx = worldX - tx;
        const dy = worldY - ty;
        return dx * dx + dy * dy <= targetRadiusSq;
      });
      if (targetHit) return { link: targetHit, end: 'target' };

      return undefined;
    },
    [currentMap, projectTileSize],
  );

  const hitTestAnchor = useCallback(
    (worldX: number, worldY: number): import('../../../types/schema').Anchor | undefined => {
      const anchors = currentMap?.spatialPrimitives?.anchors ?? [];
      const radius = Math.max(8, Math.floor(projectTileSize * 0.35));
      const radiusSq = radius * radius;
      return [...anchors].reverse().find((anchor) => {
        const dx = worldX - anchor.position[0];
        const dy = worldY - anchor.position[1];
        return dx * dx + dy * dy <= radiusSq;
      });
    },
    [currentMap, projectTileSize],
  );

  // Handle pointer down
  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (!viewport || !currentMap) return;
      if (e.button === 1) return; // middle mouse → viewport pan

      const tile = screenToTile(e.clientX, e.clientY);
      const worldPos = screenToWorldUtil(viewport, e.clientX, e.clientY);
      if (!tile && !worldPos) return;
      const { x: tx, y: ty } = tile ?? { x: 0, y: 0 };
      const inBounds = !!worldPos && worldPos.x >= 0 && worldPos.x < currentMap.width * projectTileSize && worldPos.y >= 0 && worldPos.y < currentMap.height * projectTileSize;

      // ── Target-picking mode (🎯 pick entry tile for a link) ────────────────
      const { pickingLinkTargetForLinkId, commitLinkTarget } = useEditorStore.getState();
      if (e.button === 0 && pickingLinkTargetForLinkId) {
        if (inBounds && worldPos) commitLinkTarget(pickingLinkTargetForLinkId, currentMap.id, [Math.round(worldPos.x), Math.round(worldPos.y)]);
        e.stopPropagation();
        return;
      }

      // ── Global Select (V) — works across ALL layers ─────────────────────────
        if (activeTool === 'select' && e.button === 0) {
        const worldPos = screenToWorldUtil(viewport, e.clientX, e.clientY);
        if (!worldPos) return;

        // 1. Hit-test links first (they're on top visually)
        const hitLinkResult = inBounds && worldPos ? hitTestLink(worldPos.x, worldPos.y) : undefined;
        if (hitLinkResult) {
          const { link: hitLink, end: hitEnd } = hitLinkResult;
            // Check for resize-handle hit (allow starting resize even if not already selected)
            const store = useEditorStore.getState();
            const alreadySelected = store.selectedLinkId === hitLink.id;
            if (worldPos) {
            const [sx, sy] = hitLink.sourcePosition; // pixels
            const [tw, th] = hitLink.triggerSize; // pixels
            const handleSize = 5; // must match renderer
            const handles: { [k: string]: { x: number; y: number; w: number; h: number } } = {};
            // Corners — fully outside the rect
            handles.nw = { x: sx - handleSize, y: sy - handleSize, w: handleSize, h: handleSize };
            handles.ne = { x: sx + tw, y: sy - handleSize, w: handleSize, h: handleSize };
            handles.sw = { x: sx - handleSize, y: sy + th, w: handleSize, h: handleSize };
            handles.se = { x: sx + tw, y: sy + th, w: handleSize, h: handleSize };
            // Edges — fully outside the rect
            handles.left = { x: sx - handleSize, y: sy + th / 2 - handleSize / 2, w: handleSize, h: handleSize };
            handles.right = { x: sx + tw, y: sy + th / 2 - handleSize / 2, w: handleSize, h: handleSize };
            handles.top = { x: sx + tw / 2 - handleSize / 2, y: sy - handleSize, w: handleSize, h: handleSize };
            handles.bottom = { x: sx + tw / 2 - handleSize / 2, y: sy + th, w: handleSize, h: handleSize };

            const wx = worldPos.x;
            const wy = worldPos.y;
            for (const [name, r] of Object.entries(handles)) {
              if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) {
                // start resizing
                // select the link if not already
                if (!alreadySelected) {
                  const linkLayer = currentMap.layers.find((l) => l.kind === 'locationlink');
                  if (linkLayer) useEditorStore.getState().selectLayer(linkLayer.id);
                  useEditorStore.getState().selectLink(hitLink.id);
                  useEditorStore.getState().selectEntity(null);
                }
                startHistoryBatch();
                draggingLinkRef.current = hitLink.id;
                draggingLinkHandleRef.current = name;
                dragLinkInitialRef.current = { sx, sy, tw, th };
                return;
              }
            }
          }
          const linkLayer = currentMap.layers.find((l) => l.kind === 'locationlink');
          if (linkLayer) useEditorStore.getState().selectLayer(linkLayer.id);
          useEditorStore.getState().selectLink(hitLink.id);
          useEditorStore.getState().selectEntity(null);
          startHistoryBatch();
          draggingLinkRef.current = hitLink.id;
          dragLinkEndRef.current = hitEnd;
          // Store offset from cursor to the dragged position so it doesn't snap
          if (hitEnd === 'source') {
            dragLinkOffsetRef.current = {
              x: worldPos.x - hitLink.sourcePosition[0],
              y: worldPos.y - hitLink.sourcePosition[1],
            };
          } else {
            const [targetX, targetY] = resolveLinkTarget(
              hitLink,
              currentMap,
              useEditorStore.getState().maps,
            ).position;
            dragLinkOffsetRef.current = {
              x: worldPos.x - targetX,
              y: worldPos.y - targetY,
            };
          }
          return;
        }

        // 2. Hit-test entities
        const hitAnchor = hitTestAnchor(worldPos.x, worldPos.y);
        if (hitAnchor) {
          const anchorLayer = currentMap.layers.find((layer) => layer.kind === 'anchor');
          if (anchorLayer) useEditorStore.getState().selectLayer(anchorLayer.id);
          selectAnchor(hitAnchor.id);
          selectEntity(null);
          useEditorStore.getState().selectLink(null);
          startHistoryBatch();
          draggingAnchorRef.current = hitAnchor.id;
          dragAnchorOffsetRef.current = {
            x: worldPos.x - hitAnchor.position[0],
            y: worldPos.y - hitAnchor.position[1],
          };
          return;
        }

        // 3. Hit-test entities
        const hitEntity = hitTestEntity(worldPos.x, worldPos.y);
        if (hitEntity) {
          // Find which layer owns this entity and switch to it
          const ownerLayer = currentMap.layers.find(
            (l) => l.kind === 'entity' && l.entities?.some((en) => en.id === hitEntity.id),
          );
          if (ownerLayer) useEditorStore.getState().selectLayer(ownerLayer.id);
          selectEntity(hitEntity.id);
          useEditorStore.getState().selectLink(null);
          startHistoryBatch();
          draggingEntityRef.current = hitEntity.id;
          dragOffsetRef.current = {
            x: worldPos.x - hitEntity.position[0],
            y: worldPos.y - hitEntity.position[1],
          };
          return;
        }

        // 4. Clicked empty space — deselect everything
        selectEntity(null);
        selectAnchor(null);
        useEditorStore.getState().selectLink(null);
        draggingEntityRef.current = null;
        draggingAnchorRef.current = null;
        draggingLinkRef.current = null;
        return;
      }

      if (activeTool === 'anchorPlace' && e.button === 0 && inBounds && worldPos) {
        const snapMode = useEditorStore.getState().entitySnapMode;
        const position: [number, number] =
          snapMode === 'grid'
            ? [
                Math.floor(worldPos.x / projectTileSize) * projectTileSize,
                Math.floor(worldPos.y / projectTileSize) * projectTileSize,
              ]
            : [Math.round(worldPos.x), Math.round(worldPos.y)];
        addAnchor({
          id: `anchor-${Date.now()}`,
          name: 'Anchor',
          position,
          facing: [0, 1],
          tags: [],
        });
        useEditorStore.getState().setActiveTool('anchorSelect');
        return;
      }

      if (activeTool === 'anchorSelect' && e.button === 0) {
        const hitAnchor = inBounds && worldPos ? hitTestAnchor(worldPos.x, worldPos.y) : undefined;
        if (hitAnchor) {
          selectAnchor(hitAnchor.id);
          startHistoryBatch();
          draggingAnchorRef.current = hitAnchor.id;
          dragAnchorOffsetRef.current = {
            x: worldPos!.x - hitAnchor.position[0],
            y: worldPos!.y - hitAnchor.position[1],
          };
        } else {
          selectAnchor(null);
          draggingAnchorRef.current = null;
        }
        return;
      }

      if (activeTool === 'anchorDelete' && e.button === 0) {
        const hitAnchor = inBounds && worldPos ? hitTestAnchor(worldPos.x, worldPos.y) : undefined;
        if (hitAnchor) removeAnchor(hitAnchor.id);
        return;
      }

      // ── Link tools ─────────────────────────────────────────────────────────
      if (activeTool === 'linkPlace' && e.button === 0 && inBounds && worldPos) {
        const { addLocationLink, selectLink } = useEditorStore.getState();
        // Snap to grid or pixel based on entitySnapMode
        const snapMode = useEditorStore.getState().entitySnapMode;
        let pos: [number, number];
        if (snapMode === 'grid') {
          pos = [
            Math.floor(worldPos.x / projectTileSize) * projectTileSize,
            Math.floor(worldPos.y / projectTileSize) * projectTileSize,
          ];
        } else {
          pos = [Math.round(worldPos.x), Math.round(worldPos.y)];
        }
        const triggerSize: [number, number] = [projectTileSize, projectTileSize];
        const newLink = {
          id: `link-${Date.now()}`,
          sourcePosition: pos,
          triggerSize,
          targetMapId: '',
          targetPosition: getDefaultLinkTargetPosition(pos, triggerSize, projectTileSize),
          direction: 'one-way' as const,
        };
        addLocationLink(newLink);
        selectLink(newLink.id);
        // Switch to select mode so the user can immediately drag/edit
        useEditorStore.getState().setActiveTool('linkSelect');
        return;
      }

      if (activeTool === 'linkSelect' && e.button === 0) {
        const hitLinkResult = inBounds && worldPos ? hitTestLink(worldPos.x, worldPos.y) : undefined;
        if (hitLinkResult) {
          const { link: hitLink, end: hitEnd } = hitLinkResult;
          useEditorStore.getState().selectLink(hitLink.id);
          startHistoryBatch();

          // Check for resize-handle hit on the source area
          const [sx, sy] = hitLink.sourcePosition;
          const [tw, th] = hitLink.triggerSize;
          const handleSize = 5; // must match renderer
          const handles: { [k: string]: { x: number; y: number } } = {
            nw: { x: sx - handleSize, y: sy - handleSize },
            ne: { x: sx + tw, y: sy - handleSize },
            sw: { x: sx - handleSize, y: sy + th },
            se: { x: sx + tw, y: sy + th },
            left: { x: sx - handleSize, y: sy + th / 2 - handleSize / 2 },
            right: { x: sx + tw, y: sy + th / 2 - handleSize / 2 },
            top: { x: sx + tw / 2 - handleSize / 2, y: sy - handleSize },
            bottom: { x: sx + tw / 2 - handleSize / 2, y: sy + th },
          };
          // worldPos is guaranteed non-null here (hitTestLink wouldn't have matched otherwise)
          const wx = worldPos!.x;
          const wy = worldPos!.y;
          let hitHandle: string | null = null;
          for (const [name, r] of Object.entries(handles)) {
            if (wx >= r.x && wx <= r.x + handleSize && wy >= r.y && wy <= r.y + handleSize) {
              hitHandle = name;
              break;
            }
          }

          if (hitHandle) {
            draggingLinkRef.current = hitLink.id;
            draggingLinkHandleRef.current = hitHandle;
            dragLinkInitialRef.current = { sx, sy, tw, th };
          } else {
            draggingLinkRef.current = hitLink.id;
            dragLinkEndRef.current = hitEnd;
            if (hitEnd === 'source') {
              dragLinkOffsetRef.current = {
                x: wx - hitLink.sourcePosition[0],
                y: wy - hitLink.sourcePosition[1],
              };
            } else {
              const [targetX, targetY] = resolveLinkTarget(
                hitLink,
                currentMap,
                useEditorStore.getState().maps,
              ).position;
              dragLinkOffsetRef.current = {
                x: wx - targetX,
                y: wy - targetY,
              };
            }
          }
        } else {
          useEditorStore.getState().selectLink(null);
          draggingLinkRef.current = null;
        }
        return;
      }

      if (activeTool === 'linkDelete' && e.button === 0) {
        const hitLinkResult = inBounds && worldPos ? hitTestLink(worldPos.x, worldPos.y) : undefined;
        if (hitLinkResult) useEditorStore.getState().removeLocationLink(hitLinkResult.link.id);
        return;
      }

      // Right Click = Eyedropper: sample tiles from map (supports drag for multi-tile patterns)
      // Works in stamp/random/erase modes
      if (
        e.button === 2 &&
        (activeTool === 'stamp' ||
          activeTool === 'random' ||
          activeTool === 'erase' ||
          activeTool === 'fill')
      ) {
        if (!selectedLayerId) return;
        if (!inBounds) return;

        // Start sampling mode - will complete on pointer up
        isSamplingRef.current = true;
        sampleStartRef.current = { x: tx, y: ty };
        e.preventDefault();
        return;
      }

      if (activeTool === 'entitySelect' || activeTool === 'entityDelete') {
        const worldPos = screenToWorldUtil(viewport, e.clientX, e.clientY);
        if (!worldPos) return;
        const resolvedEntities = resolveEntities(currentMap, activeVariationId);
        const { entityTypes: allEntityTypes } = useEditorStore.getState();
        const hit = [...resolvedEntities].reverse().find((entity) => {
          const type = allEntityTypes.find((t) => t.id === entity.typeId);
          const [ew, eh] = type?.defaultSize ?? [projectTileSize, projectTileSize];
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
            startHistoryBatch();
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
      } else if (
        activeTool === 'stamp' ||
        activeTool === 'random' ||
        activeTool === 'erase' ||
        activeTool === 'fill'
      ) {
        const shouldFlood = activeTool === 'fill' || drawMode === 'flood';

        if (shouldFlood) {
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
            } else if ((activeTool === 'stamp' || activeTool === 'fill') && activeTilesetId) {
              // Stamp/fill flood fill - supports stencil patterns
              bucketFillAdvanced(selectedLayerId, tx, ty, {
                mode: 'stamp',
                tilesetId: activeTilesetId,
                tileIndex: selectedTileIndex ?? undefined,
                pattern: patternData ?? undefined,
              });
            }
          }
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore -- activeTool is narrowed by outer condition but 'fill' is valid at runtime
        } else if (activeTool !== 'fill' && drawMode === 'point') {
          startHistoryBatch();
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
          // @ts-ignore
        } else if (activeTool !== 'fill') {
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
          startHistoryBatch();
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
                  Math.floor(worldPos.x / projectTileSize) * projectTileSize,
                  Math.floor(worldPos.y / projectTileSize) * projectTileSize,
                ];
              } else {
                position = [Math.round(worldPos.x), Math.round(worldPos.y)];
              }
            } else {
              // Fallback using tile coords
              position = [tx * projectTileSize, ty * projectTileSize];
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
      projectTileSize,
      screenToTile,
      applyShape,
      applyTerrainShape,
      selectEntity,
      removeEntity,
      bucketFillAdvanced,
      getPattern,
      placeEntity,
      setDrawPreview,
      hitTestEntity,
      hitTestLink,
      startHistoryBatch,
    ],
  );

  // Handle pointer move
  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!viewport || !currentMap) return;
      const worldPos = screenToWorldUtil(viewport, e.clientX, e.clientY);

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

      // Drag link source/target move or resize in global select or linkSelect
      if (e.buttons === 1 && (activeTool === 'select' || activeTool === 'linkSelect') && draggingLinkRef.current && worldPos) {
        const wx = worldPos.x;
        const wy = worldPos.y;
        if (wx >= 0 && wx < currentMap.width * projectTileSize && wy >= 0 && wy < currentMap.height * projectTileSize) {
          // If a resize handle is active, perform resize logic
          if (draggingLinkHandleRef.current && dragLinkInitialRef.current) {
            const handle = draggingLinkHandleRef.current;
            const init = dragLinkInitialRef.current;
            // For resizing we want pixel-perfect control (no snapping)
            let px = Math.round(wx);
            let py = Math.round(wy);

            let nsx = init.sx;
            let nsy = init.sy;
            let ntw = init.tw;
            let nth = init.th;

            const minSize = 1;
            switch (handle) {
              case 'nw':
                nsx = px;
                nsy = py;
                ntw = init.sx + init.tw - nsx;
                nth = init.sy + init.th - nsy;
                break;
              case 'ne':
                nsx = init.sx;
                nsy = py;
                ntw = px - init.sx;
                nth = init.sy + init.th - nsy;
                break;
              case 'sw':
                nsx = px;
                nsy = init.sy;
                ntw = init.sx + init.tw - nsx;
                nth = py - init.sy;
                break;
              case 'se':
                nsx = init.sx;
                nsy = init.sy;
                ntw = px - init.sx;
                nth = py - init.sy;
                break;
              case 'left':
                nsx = px;
                ntw = init.sx + init.tw - nsx;
                break;
              case 'right':
                nsx = init.sx;
                ntw = px - init.sx;
                break;
              case 'top':
                nsy = py;
                nth = init.sy + init.th - nsy;
                break;
              case 'bottom':
                nsy = init.sy;
                nth = py - init.sy;
                break;
            }

            // Clamp sizes
            if (ntw < minSize) ntw = minSize;
            if (nth < minSize) nth = minSize;

            useEditorStore.getState().updateLocationLink(draggingLinkRef.current, {
              sourcePosition: [Math.round(nsx), Math.round(nsy)],
              triggerSize: [Math.round(ntw), Math.round(nth)],
            }, true);
          } else {
            // Regular move of one end — always pixel-perfect (no snapping)
            const offset = dragLinkOffsetRef.current ?? { x: 0, y: 0 };
            const pos: [number, number] = [Math.round(wx - offset.x), Math.round(wy - offset.y)];
            if (dragLinkEndRef.current === 'target') {
              const store = useEditorStore.getState();
              const draggingLink = currentMap.locationLinks?.find(
                (link) => link.id === draggingLinkRef.current,
              );
              if (draggingLink?.targetAnchorId) {
                store.updateMapAnchor(currentMap.id, draggingLink.targetAnchorId, { position: pos }, true);
              } else {
                store.updateLocationLink(
                  draggingLinkRef.current,
                  {
                    targetPosition: pos,
                  },
                  true,
                );
              }
            } else {
              useEditorStore.getState().updateLocationLink(draggingLinkRef.current, {
                sourcePosition: pos,
              }, true);
            }
          }
        }
      }

      // Move entity while dragging with entitySelect or global select
      if (
        e.buttons === 1 &&
        (activeTool === 'entitySelect' || activeTool === 'select') &&
        draggingEntityRef.current
      ) {
        const worldPos = screenToWorldUtil(viewport, e.clientX, e.clientY);
        if (worldPos) {
          const { entitySnapMode: snapMode } = useEditorStore.getState();
          const offset = dragOffsetRef.current ?? { x: 0, y: 0 };
          const rawX = worldPos.x - offset.x;
          const rawY = worldPos.y - offset.y;
          let position: [number, number];
          if (snapMode === 'grid') {
            position = [
              Math.floor(rawX / projectTileSize) * projectTileSize,
              Math.floor(rawY / projectTileSize) * projectTileSize,
            ];
          } else {
            position = [Math.round(rawX), Math.round(rawY)];
          }
          moveEntity(draggingEntityRef.current, position);
        }
      }

      if (
        e.buttons === 1 &&
        (activeTool === 'anchorSelect' || activeTool === 'select') &&
        draggingAnchorRef.current &&
        worldPos
      ) {
        const offset = dragAnchorOffsetRef.current ?? { x: 0, y: 0 };
        const { entitySnapMode: snapMode } = useEditorStore.getState();
        const rawX = worldPos.x - offset.x;
        const rawY = worldPos.y - offset.y;
        const position: [number, number] =
          snapMode === 'grid'
            ? [
                Math.floor(rawX / projectTileSize) * projectTileSize,
                Math.floor(rawY / projectTileSize) * projectTileSize,
              ]
            : [Math.round(rawX), Math.round(rawY)];
        updateAnchor(draggingAnchorRef.current, { position }, true);
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
      projectTileSize,
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
            } else {
              // Right-clicked an empty tile — sample an "empty" pattern (null)
              // Keep the active tool the same; stamping this pattern will erase
              const pattern = [[null]] as (number | null)[][];
              setSampledPattern({
                tilesetId: activeTilesetId ?? '',
                pattern,
                width: 1,
                height: 1,
              });
              setSelectedTile(null);
              setSelectedTiles([]);
            }

            isSamplingRef.current = false;
            sampleStartRef.current = null;
            setDrawPreview({ isDrawing: false, start: null, end: null });
            finishHistoryBatch();
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
          } else {
            // Sampled region contained no tiles — store an all-null sampled pattern
            setSampledPattern({
              tilesetId: activeTilesetId ?? '',
              pattern,
              width,
              height,
            });
            setSelectedTile(null);
            setSelectedTiles([]);
          }
        }

        isSamplingRef.current = false;
        sampleStartRef.current = null;
        setDrawPreview({ isDrawing: false, start: null, end: null });
        finishHistoryBatch();
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
      if (draggingAnchorRef.current) {
        const { currentMap: map } = useEditorStore.getState();
        if (map) saveMapDebounced(map);
      }
      draggingAnchorRef.current = null;
      dragAnchorOffsetRef.current = null;
      // If a link was being dragged/resized, flush the deferred save now
      if (draggingLinkRef.current) {
        const { currentMap: map } = useEditorStore.getState();
        if (map) saveMapDebounced(map);
      }
      draggingLinkRef.current = null;
      dragLinkOffsetRef.current = null;
      draggingLinkHandleRef.current = null;
      dragLinkInitialRef.current = null;
      // Clear any custom cursor left by handle hover
      try {
        const viewEl = viewport?.options.events?.domElement as HTMLElement | undefined;
        if (viewEl) viewEl.style.cursor = '';
      } catch (err) {
        // ignore
      }
      setDrawPreview({ isDrawing: false, start: null, end: null });
      finishHistoryBatch();
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
      finishHistoryBatch,
    ],
  );

  // Keep latest handler refs so stable wrapper closures always call the current version
  const handlePointerDownRef = useRef(handlePointerDown);
  const handlePointerMoveRef = useRef(handlePointerMove);
  const handlePointerUpRef = useRef(handlePointerUp);
  handlePointerDownRef.current = handlePointerDown;
  handlePointerMoveRef.current = handlePointerMove;
  handlePointerUpRef.current = handlePointerUp;

  // Set up event listeners — only re-fires when viewport changes, not on every state update
  useEffect(() => {
    if (!viewport) return;

    const view = viewport.options.events?.domElement;
    if (!view) return;

    const onDown = (e: PointerEvent) => handlePointerDownRef.current(e);
    const onMove = (e: PointerEvent) => handlePointerMoveRef.current(e);
    const onUp = (e: PointerEvent) => handlePointerUpRef.current(e);
    const preventContextMenu = (e: Event) => {
      e.preventDefault();
    };

    view.addEventListener('pointerdown', onDown);
    view.addEventListener('pointermove', onMove);
    view.addEventListener('pointerup', onUp);
    view.addEventListener('contextmenu', preventContextMenu);

    return () => {
      view.removeEventListener('pointerdown', onDown);
      view.removeEventListener('pointermove', onMove);
      view.removeEventListener('pointerup', onUp);
      view.removeEventListener('contextmenu', preventContextMenu);
    };
  }, [viewport]);

  // Reset drawing state when tool/mode changes
  useEffect(() => {
    isDrawingRef.current = false;
    drawStartRef.current = null;
    lineAnchorRef.current = null;
    setDrawPreview({ isDrawing: false, start: null, end: null });
    finishHistoryBatch();
  }, [activeTool, drawMode, setDrawPreview, finishHistoryBatch]);

  useEffect(
    () => () => {
      finishHistoryBatch();
    },
    [finishHistoryBatch],
  );

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
