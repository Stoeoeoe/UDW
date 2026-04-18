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
import { getTriggerCenter } from '../../../lib/locationLinkUtils';
import { getPattern as getPatternUtil } from '../../../lib/patternUtils';
import { applyShape as applyShapeUtil } from '../../../lib/shapeUtils';
import { applyTerrainShape as applyTerrainShapeUtil } from '../../../lib/terrainShapeUtils';
import { MapTrigger } from '../../../types/schema';

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
  const addTrigger = useEditorStore((state) => state.addTrigger);
  const updateTrigger = useEditorStore((state) => state.updateTrigger);
  const removeTrigger = useEditorStore((state) => state.removeTrigger);
  const selectTrigger = useEditorStore((state) => state.selectTrigger);
  const setHoveredTile = useEditorStore((state) => state.setHoveredTile);
  const setDrawPreview = useEditorStore((state) => state.setDrawPreview);
  const setPolygonPreviewPoints = useEditorStore((state) => state.setPolygonPreviewPoints);
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
  const draggingTriggerRef = useRef<string | null>(null);
  const dragTriggerOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const draggingTriggerHandleRef = useRef<string | null>(null);
  const dragTriggerInitialRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const draggingVertexIndexRef = useRef<number | null>(null); // polygon vertex drag
  const triggerPlaceStartRef = useRef<{ x: number; y: number } | null>(null);
  // Polygon pen-draw state: list of vertices placed so far
  const polygonDrawPointsRef = useRef<[number, number][] | null>(null);
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

  /**
   * Hit-test a location link by clicking near the midpoint of the line drawn
   * between its source trigger and (same-map) target anchor. Only same-map
   * links are clickable directly; cross-map links must be selected from panel.
   */
  const hitTestLink = useCallback(
    (worldX: number, worldY: number): import('../../../types/schema').LocationLink | undefined => {
      const links = currentMap?.locationLinks ?? [];
      if (!currentMap) return undefined;
      const triggers = currentMap.spatialPrimitives?.triggers ?? [];
      const anchors = currentMap.spatialPrimitives?.anchors ?? [];
      const radius = Math.max(8, Math.floor(projectTileSize * 0.4));
      const radiusSq = radius * radius;

      for (const link of [...links].reverse()) {
        if (link.targetMapId !== currentMap.id) continue;
        const trigger = triggers.find((t) => t.id === link.triggerId);
        const anchor = anchors.find((a) => a.id === link.targetAnchorId);
        if (!trigger || !anchor) continue;
        const [cx, cy] = getTriggerCenter(trigger);
        const mx = (cx + anchor.position[0]) / 2;
        const my = (cy + anchor.position[1]) / 2;
        const dx = worldX - mx;
        const dy = worldY - my;
        if (dx * dx + dy * dy <= radiusSq) return link;
      }
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

  // Returns { trigger, handle } where handle is 'body' | 'nw'|'ne'|'sw'|'se'|'left'|'right'|'top'|'bottom'
  // Point-in-polygon using ray casting
  const pointInPolygon = useCallback(
    (px: number, py: number, points: [number, number][]): boolean => {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    },
    [],
  );

  const hitTestTrigger = useCallback(
    (worldX: number, worldY: number): { trigger: MapTrigger; handle: string } | undefined => {
      const triggers = currentMap?.spatialPrimitives?.triggers ?? [];
      const selectedTriggerId = useEditorStore.getState().selectedTriggerId;
      const HANDLE_RADIUS = 5;
      const HANDLE_SIZE = 6;

      for (const trigger of [...triggers].reverse()) {
        if (trigger.shape === 'rectangle' && trigger.size) {
          const [tx, ty] = trigger.position;
          const [tw, th] = trigger.size;
          const expand = trigger.id === selectedTriggerId ? HANDLE_SIZE : 0;

          // Check resize handles first (selected only)
          if (trigger.id === selectedTriggerId) {
            const handles: Record<string, { x: number; y: number; w: number; h: number }> = {
              nw: { x: tx - HANDLE_SIZE, y: ty - HANDLE_SIZE, w: HANDLE_SIZE, h: HANDLE_SIZE },
              ne: { x: tx + tw, y: ty - HANDLE_SIZE, w: HANDLE_SIZE, h: HANDLE_SIZE },
              sw: { x: tx - HANDLE_SIZE, y: ty + th, w: HANDLE_SIZE, h: HANDLE_SIZE },
              se: { x: tx + tw, y: ty + th, w: HANDLE_SIZE, h: HANDLE_SIZE },
              left: {
                x: tx - HANDLE_SIZE,
                y: ty + th / 2 - HANDLE_SIZE / 2,
                w: HANDLE_SIZE,
                h: HANDLE_SIZE,
              },
              right: {
                x: tx + tw,
                y: ty + th / 2 - HANDLE_SIZE / 2,
                w: HANDLE_SIZE,
                h: HANDLE_SIZE,
              },
              top: {
                x: tx + tw / 2 - HANDLE_SIZE / 2,
                y: ty - HANDLE_SIZE,
                w: HANDLE_SIZE,
                h: HANDLE_SIZE,
              },
              bottom: {
                x: tx + tw / 2 - HANDLE_SIZE / 2,
                y: ty + th,
                w: HANDLE_SIZE,
                h: HANDLE_SIZE,
              },
            };
            for (const [name, r] of Object.entries(handles)) {
              if (worldX >= r.x && worldX <= r.x + r.w && worldY >= r.y && worldY <= r.y + r.h) {
                return { trigger, handle: name };
              }
            }
          }

          // Body hit
          if (
            worldX >= tx - expand &&
            worldX < tx + tw + expand &&
            worldY >= ty - expand &&
            worldY < ty + th + expand
          ) {
            return { trigger, handle: 'body' };
          }
        } else if (trigger.shape === 'polygon' && trigger.points && trigger.points.length >= 3) {
          const pts = trigger.points;

          // Check vertex handles first (selected only)
          if (trigger.id === selectedTriggerId) {
            for (let i = 0; i < pts.length; i++) {
              const [px, py] = pts[i];
              const dx = worldX - px;
              const dy = worldY - py;
              if (Math.sqrt(dx * dx + dy * dy) <= HANDLE_RADIUS + 2) {
                return { trigger, handle: `vertex-${i}` };
              }
            }
          }

          // Body hit via point-in-polygon
          if (pointInPolygon(worldX, worldY, pts)) {
            return { trigger, handle: 'body' };
          }
        }
      }
      return undefined;
    },
    [currentMap, pointInPolygon],
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
      const inBounds =
        !!worldPos &&
        worldPos.x >= 0 &&
        worldPos.x < currentMap.width * projectTileSize &&
        worldPos.y >= 0 &&
        worldPos.y < currentMap.height * projectTileSize;

      // ── Global Select (V) — works across ALL layers ─────────────────────────
      if (activeTool === 'select' && e.button === 0) {
        const worldPos = screenToWorldUtil(viewport, e.clientX, e.clientY);
        if (!worldPos) return;

        // 1. Hit-test links (click on midpoint marker between trigger & anchor)
        const hitLink = inBounds && worldPos ? hitTestLink(worldPos.x, worldPos.y) : undefined;
        if (hitLink) {
          const navLayer = currentMap.layers.find((l) => l.kind === 'navigation');
          if (navLayer) useEditorStore.getState().selectLayer(navLayer.id);
          useEditorStore.getState().selectLink(hitLink.id);
          useEditorStore.getState().selectEntity(null);
          return;
        }

        // 2. Hit-test triggers
        const hitTriggerResult =
          inBounds && worldPos ? hitTestTrigger(worldPos.x, worldPos.y) : undefined;
        if (hitTriggerResult) {
          const navLayer = currentMap.layers.find((l) => l.kind === 'navigation');
          if (navLayer) useEditorStore.getState().selectLayer(navLayer.id);
          selectTrigger(hitTriggerResult.trigger.id);
          selectEntity(null);
          useEditorStore.getState().selectLink(null);
          selectAnchor(null);
          return;
        }

        // 3. Hit-test anchors
        const hitAnchor = hitTestAnchor(worldPos.x, worldPos.y);
        if (hitAnchor) {
          const navLayer = currentMap.layers.find((layer) => layer.kind === 'navigation');
          if (navLayer) useEditorStore.getState().selectLayer(navLayer.id);
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

        // 4. Hit-test entities
        const hitEntity = hitTestEntity(worldPos.x, worldPos.y);
        if (hitEntity) {
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

        // 5. Clicked empty space — deselect everything
        selectEntity(null);
        selectAnchor(null);
        selectTrigger(null);
        useEditorStore.getState().selectLink(null);
        draggingEntityRef.current = null;
        draggingAnchorRef.current = null;
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
      // Click on a trigger to start a new link from it; inspector/dialog picks
      // the target map + anchor.
      if (activeTool === 'linkPlace' && e.button === 0 && inBounds && worldPos) {
        const hit = hitTestTrigger(worldPos.x, worldPos.y);
        if (!hit) return;
        const { addLocationLink } = useEditorStore.getState();
        const newLink: import('../../../types/schema').LocationLink = {
          id: `link-${Date.now()}`,
          triggerId: hit.trigger.id,
          targetMapId: currentMap.id,
          targetAnchorId: '',
        };
        addLocationLink(newLink);
        useEditorStore.getState().setActiveTool('linkSelect');
        return;
      }

      if (activeTool === 'linkSelect' && e.button === 0) {
        const hitLink = inBounds && worldPos ? hitTestLink(worldPos.x, worldPos.y) : undefined;
        if (hitLink) {
          useEditorStore.getState().selectLink(hitLink.id);
        } else {
          useEditorStore.getState().selectLink(null);
        }
        return;
      }

      if (activeTool === 'linkDelete' && e.button === 0) {
        const hitLink = inBounds && worldPos ? hitTestLink(worldPos.x, worldPos.y) : undefined;
        if (hitLink) useEditorStore.getState().removeLocationLink(hitLink.id);
        return;
      }

      // ── Trigger tools ───────────────────────────────────────────────────────
      if (activeTool === 'triggerPlace' && e.button === 0 && inBounds && worldPos) {
        const { entitySnapMode: snapMode } = useEditorStore.getState();
        const snappedX =
          snapMode === 'grid'
            ? Math.floor(worldPos.x / projectTileSize) * projectTileSize
            : Math.round(worldPos.x);
        const snappedY =
          snapMode === 'grid'
            ? Math.floor(worldPos.y / projectTileSize) * projectTileSize
            : Math.round(worldPos.y);
        triggerPlaceStartRef.current = { x: snappedX, y: snappedY };
        startHistoryBatch();
        return;
      }

      // Polygon pen tool — each left-click adds a vertex; close when near the start
      if (activeTool === 'triggerPolygon' && e.button === 0 && inBounds && worldPos) {
        const { entitySnapMode: snapMode } = useEditorStore.getState();
        const snappedX =
          snapMode === 'grid'
            ? Math.floor(worldPos.x / projectTileSize) * projectTileSize
            : Math.round(worldPos.x);
        const snappedY =
          snapMode === 'grid'
            ? Math.floor(worldPos.y / projectTileSize) * projectTileSize
            : Math.round(worldPos.y);
        const pts = polygonDrawPointsRef.current ?? [];
        const CLOSE_DIST = projectTileSize * 0.75;
        if (pts.length >= 3) {
          const [fx, fy] = pts[0];
          const dx = snappedX - fx;
          const dy = snappedY - fy;
          if (Math.sqrt(dx * dx + dy * dy) <= CLOSE_DIST) {
            // Close the polygon — create the trigger
            const minX = Math.min(...pts.map(([x]) => x));
            const minY = Math.min(...pts.map(([, y]) => y));
            addTrigger({
              id: `trigger-${Date.now()}`,
              type: 'locationLinkTrigger',
              shape: 'polygon',
              position: [minX, minY],
              points: pts,
              tags: [],
            });
            polygonDrawPointsRef.current = null;
            setPolygonPreviewPoints(null);
            useEditorStore.getState().setActiveTool('triggerSelect');
            return;
          }
        }
        const newPts: [number, number][] = [...pts, [snappedX, snappedY]];
        polygonDrawPointsRef.current = newPts;
        setPolygonPreviewPoints(newPts);
        return;
      }

      // Polygon pen tool — right-click removes the last vertex
      if (activeTool === 'triggerPolygon' && e.button === 2 && polygonDrawPointsRef.current) {
        const pts = polygonDrawPointsRef.current;
        if (pts.length <= 1) {
          polygonDrawPointsRef.current = null;
          setPolygonPreviewPoints(null);
        } else {
          const newPts: [number, number][] = pts.slice(0, -1);
          polygonDrawPointsRef.current = newPts;
          setPolygonPreviewPoints(newPts);
        }
        e.preventDefault();
        return;
      }

      if (activeTool === 'triggerSelect' && e.button === 0) {
        const hit = inBounds && worldPos ? hitTestTrigger(worldPos.x, worldPos.y) : undefined;
        if (hit) {
          selectTrigger(hit.trigger.id);
          startHistoryBatch();
          if (hit.handle.startsWith('vertex-')) {
            // Polygon vertex drag
            draggingVertexIndexRef.current = parseInt(hit.handle.replace('vertex-', ''), 10);
            draggingTriggerRef.current = hit.trigger.id;
          } else if (hit.handle !== 'body') {
            // Rectangle resize handle
            const [tx, ty] = hit.trigger.position;
            const [tw, th] = hit.trigger.size ?? [projectTileSize, projectTileSize];
            draggingTriggerHandleRef.current = hit.handle;
            dragTriggerInitialRef.current = { x: tx, y: ty, w: tw, h: th };
          } else {
            // Body drag
            const [tx, ty] = hit.trigger.position;
            draggingTriggerRef.current = hit.trigger.id;
            dragTriggerOffsetRef.current = {
              x: worldPos!.x - tx,
              y: worldPos!.y - ty,
            };
          }
        } else {
          selectTrigger(null);
        }
        return;
      }

      if (activeTool === 'triggerDelete' && e.button === 0) {
        const hit = inBounds && worldPos ? hitTestTrigger(worldPos.x, worldPos.y) : undefined;
        if (hit) removeTrigger(hit.trigger.id);
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
      setPolygonPreviewPoints,
      hitTestEntity,
      hitTestLink,
      hitTestTrigger,
      startHistoryBatch,
      selectTrigger,
      removeTrigger,
      addTrigger,
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

      // Drag polygon vertex
      if (
        e.buttons === 1 &&
        activeTool === 'triggerSelect' &&
        draggingTriggerRef.current &&
        draggingVertexIndexRef.current !== null &&
        worldPos
      ) {
        const triggerId = draggingTriggerRef.current;
        const vertIdx = draggingVertexIndexRef.current;
        const trigger = currentMap?.spatialPrimitives?.triggers?.find((t) => t.id === triggerId);
        if (trigger?.shape === 'polygon' && trigger.points) {
          const { entitySnapMode: snapMode } = useEditorStore.getState();
          let nx = worldPos.x;
          let ny = worldPos.y;
          if (snapMode === 'grid') {
            nx = Math.floor(nx / projectTileSize) * projectTileSize;
            ny = Math.floor(ny / projectTileSize) * projectTileSize;
          } else {
            nx = Math.round(nx);
            ny = Math.round(ny);
          }
          const newPoints: [number, number][] = trigger.points.map((p, i) =>
            i === vertIdx ? [nx, ny] : p,
          );
          updateTrigger(triggerId, { points: newPoints }, true);
        }
        return;
      }

      // Drag trigger body
      if (
        e.buttons === 1 &&
        activeTool === 'triggerSelect' &&
        draggingTriggerRef.current &&
        draggingVertexIndexRef.current === null &&
        worldPos
      ) {
        const triggerId = draggingTriggerRef.current;
        const trigger = currentMap?.spatialPrimitives?.triggers?.find((t) => t.id === triggerId);
        const { entitySnapMode: snapMode } = useEditorStore.getState();
        if (trigger?.shape === 'polygon' && trigger.points) {
          // Translate all polygon points by delta
          const offset = dragTriggerOffsetRef.current ?? { x: 0, y: 0 };
          const rawX = worldPos.x - offset.x;
          const rawY = worldPos.y - offset.y;
          const snappedX =
            snapMode === 'grid'
              ? Math.floor(rawX / projectTileSize) * projectTileSize
              : Math.round(rawX);
          const snappedY =
            snapMode === 'grid'
              ? Math.floor(rawY / projectTileSize) * projectTileSize
              : Math.round(rawY);
          const [origX, origY] = trigger.position;
          const dx = snappedX - origX;
          const dy = snappedY - origY;
          if (dx !== 0 || dy !== 0) {
            const newPoints: [number, number][] = trigger.points.map(([px, py]) => [
              px + dx,
              py + dy,
            ]);
            updateTrigger(triggerId, { position: [snappedX, snappedY], points: newPoints }, true);
          }
        } else {
          const offset = dragTriggerOffsetRef.current ?? { x: 0, y: 0 };
          const rawX = worldPos.x - offset.x;
          const rawY = worldPos.y - offset.y;
          const snappedX =
            snapMode === 'grid'
              ? Math.floor(rawX / projectTileSize) * projectTileSize
              : Math.round(rawX);
          const snappedY =
            snapMode === 'grid'
              ? Math.floor(rawY / projectTileSize) * projectTileSize
              : Math.round(rawY);
          updateTrigger(triggerId, { position: [snappedX, snappedY] }, true);
        }
      }

      // Resize trigger via handle (rectangles only)
      if (
        e.buttons === 1 &&
        activeTool === 'triggerSelect' &&
        draggingTriggerHandleRef.current &&
        dragTriggerInitialRef.current &&
        worldPos
      ) {
        const selectedId = useEditorStore.getState().selectedTriggerId;
        if (!selectedId) return;
        const init = dragTriggerInitialRef.current;
        const handle = draggingTriggerHandleRef.current;
        const { entitySnapMode: snapMode } = useEditorStore.getState();
        const px =
          snapMode === 'grid'
            ? Math.floor(worldPos.x / projectTileSize) * projectTileSize
            : Math.round(worldPos.x);
        const py =
          snapMode === 'grid'
            ? Math.floor(worldPos.y / projectTileSize) * projectTileSize
            : Math.round(worldPos.y);
        const MIN = 1;

        let nx = init.x,
          ny = init.y,
          nw = init.w,
          nh = init.h;
        switch (handle) {
          case 'nw':
            nx = px;
            ny = py;
            nw = init.x + init.w - px;
            nh = init.y + init.h - py;
            break;
          case 'ne':
            ny = py;
            nw = px - init.x;
            nh = init.y + init.h - py;
            break;
          case 'sw':
            nx = px;
            nw = init.x + init.w - px;
            nh = py - init.y;
            break;
          case 'se':
            nw = px - init.x;
            nh = py - init.y;
            break;
          case 'left':
            nx = px;
            nw = init.x + init.w - px;
            break;
          case 'right':
            nw = px - init.x;
            break;
          case 'top':
            ny = py;
            nh = init.y + init.h - py;
            break;
          case 'bottom':
            nh = py - init.y;
            break;
        }
        if (nw < MIN) nw = MIN;
        if (nh < MIN) nh = MIN;
        updateTrigger(
          selectedId,
          { position: [Math.round(nx), Math.round(ny)], size: [Math.round(nw), Math.round(nh)] },
          true,
        );
      }

      // triggerPlace drag — show draw preview
      if (
        e.buttons === 1 &&
        activeTool === 'triggerPlace' &&
        triggerPlaceStartRef.current &&
        worldPos
      ) {
        const start = triggerPlaceStartRef.current;
        const snappedX = Math.floor(worldPos.x / projectTileSize) * projectTileSize;
        const snappedY = Math.floor(worldPos.y / projectTileSize) * projectTileSize;
        setDrawPreview({
          isDrawing: true,
          start: {
            x: Math.floor(start.x / projectTileSize),
            y: Math.floor(start.y / projectTileSize),
          },
          end: {
            x: Math.floor(snappedX / projectTileSize),
            y: Math.floor(snappedY / projectTileSize),
          },
          mode: 'draw',
        });
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
      currentMap,
      screenToTile,
      setHoveredTile,
      setDrawPreview,
      applyShape,
      applyTerrainShape,
      moveEntity,
      updateTrigger,
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

      // Finalize triggerPlace drag → create the trigger
      if (activeTool === 'triggerPlace' && triggerPlaceStartRef.current) {
        const worldPos = screenToWorldUtil(viewport, e.clientX, e.clientY);
        const start = triggerPlaceStartRef.current;
        const { entitySnapMode: snapMode } = useEditorStore.getState();
        const snapFn = (v: number) =>
          snapMode === 'grid' ? Math.floor(v / projectTileSize) * projectTileSize : Math.round(v);
        const endX = worldPos ? snapFn(worldPos.x) : start.x;
        const endY = worldPos ? snapFn(worldPos.y) : start.y;
        const x = Math.min(start.x, endX);
        const y = Math.min(start.y, endY);
        const w = Math.max(projectTileSize, Math.abs(endX - start.x) + projectTileSize);
        const h = Math.max(projectTileSize, Math.abs(endY - start.y) + projectTileSize);
        addTrigger({
          id: `trigger-${Date.now()}`,
          type: 'locationLinkTrigger',
          shape: 'rectangle',
          position: [x, y],
          size: [w, h],
          tags: [],
        });
        useEditorStore.getState().setActiveTool('triggerSelect');
        triggerPlaceStartRef.current = null;
        setDrawPreview({ isDrawing: false, start: null, end: null });
        finishHistoryBatch();
        return;
      }
      triggerPlaceStartRef.current = null;

      // Flush trigger drag/resize save
      if (draggingTriggerRef.current || draggingTriggerHandleRef.current) {
        const { currentMap: map } = useEditorStore.getState();
        if (map) saveMapDebounced(map);
      }
      draggingTriggerRef.current = null;
      dragTriggerOffsetRef.current = null;
      draggingTriggerHandleRef.current = null;
      dragTriggerInitialRef.current = null;
      draggingVertexIndexRef.current = null;
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
      setPolygonPreviewPoints,
      setActiveTileset,
      setSelectedTile,
      setSelectedTiles,
      setSampledPattern,
      finishHistoryBatch,
      addTrigger,
      projectTileSize,
      viewport,
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
