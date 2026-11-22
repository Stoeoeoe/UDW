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
import { paintDisc, paintStroke } from '../../../lib/waterMask';
import {
  FLOW_ERASE_REACH,
  FLOW_POINT_SPACING,
  FLOW_SIMPLIFY_TOLERANCE,
  MIN_FLOW_STROKE_LENGTH,
  appendStrokePoint,
  distanceToStroke,
  simplifyStroke,
  strokeLength,
} from '../../../lib/waterFlow';
import { isWaterTool, waterBodyValue } from '../../../lib/waterBodies';
import { commitWaterBitmap, getWaterBitmap } from '../../../lib/waterMaskCache';
import { MapTrigger, MapCollision } from '../../../types/schema';
import {
  collectObjectPlacementOrigins,
  getCenteredObjectPlacementOrigin,
  getCenteredObjectPlacementPixelOrigin,
  getObjectInstanceAtTile,
  getObjectInstanceAtWorldPosition,
  indexObjects,
  objectPlacementIntersectsMap,
} from '../../../lib/mapObjects';

interface UseMapToolsProps {
  viewport: Viewport | null;
}

/**
 * Hook that handles all tool interactions (paint, erase, fill, entity placement, selection).
 */
const roundTenth = (value: number): number => Math.round(value * 10) / 10;

export function useMapTools({ viewport }: UseMapToolsProps) {
  const currentMap = useEditorStore((state) => state.currentMap);
  const activeVariationId = useEditorStore((state) => state.activeVariationId);
  const activeTilesetId = useEditorStore((state) => state.activeTilesetId);
  const selectedTileIndex = useEditorStore((state) => state.selectedTileIndex);
  const selectedTileIndices = useEditorStore((state) => state.selectedTileIndices);
  const sampledPattern = useEditorStore((state) => state.sampledPattern);
  const selectedObjectId = useEditorStore((state) => state.selectedObjectId);
  const activeTool = useEditorStore((state) => state.activeTool);
  const drawMode = useEditorStore((state) => state.drawMode);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const selectedEntityTypeId = useEditorStore((state) => state.selectedEntityTypeId);
  const projectTileSize = useEditorStore((state) => state.project?.tileSize ?? DEFAULT_TILE_SIZE);
  const tilesets = useEditorStore((state) => state.tilesets);
  const objects = useEditorStore((state) => state.objects);
  const objectIndex = indexObjects(objects);

  const paintTilesBatch = useEditorStore((state) => state.paintTilesBatch);
  const eraseTilesBatch = useEditorStore((state) => state.eraseTilesBatch);
  const placeObjectInstance = useEditorStore((state) => state.placeObjectInstance);
  const removeObjectInstance = useEditorStore((state) => state.removeObjectInstance);
  const moveObjectInstance = useEditorStore((state) => state.moveObjectInstance);
  const selectObjectInstance = useEditorStore((state) => state.selectObjectInstance);
  const paintTerrainDataBatch = useEditorStore((state) => state.paintTerrainDataBatch);
  const bucketFillAdvanced = useEditorStore((state) => state.bucketFillAdvanced);
  const placeEntity = useEditorStore((state) => state.placeEntity);
  const removeEntity = useEditorStore((state) => state.removeEntity);
  const moveEntity = useEditorStore((state) => state.moveEntity);
  const selectEntity = useEditorStore((state) => state.selectEntity);
  const addAnchor = useEditorStore((state) => state.addAnchor);
  const updateAnchor = useEditorStore((state) => state.updateAnchor);
  const selectAnchor = useEditorStore((state) => state.selectAnchor);
  const addTrigger = useEditorStore((state) => state.addTrigger);
  const updateTrigger = useEditorStore((state) => state.updateTrigger);
  const selectTrigger = useEditorStore((state) => state.selectTrigger);
  const addCollision = useEditorStore((state) => state.addCollision);
  const updateCollision = useEditorStore((state) => state.updateCollision);
  const selectCollision = useEditorStore((state) => state.selectCollision);
  const setHoveredTile = useEditorStore((state) => state.setHoveredTile);
  const setHoveredWorldPosition = useEditorStore((state) => state.setHoveredWorldPosition);
  const setDrawPreview = useEditorStore((state) => state.setDrawPreview);
  const setPolygonPreviewPoints = useEditorStore((state) => state.setPolygonPreviewPoints);
  const setSelectedTile = useEditorStore((state) => state.setSelectedTile);
  const setSelectedTiles = useEditorStore((state) => state.setSelectedTiles);
  const setSelectedObject = useEditorStore((state) => state.setSelectedObject);
  const setActiveTileset = useEditorStore((state) => state.setActiveTileset);
  const setSampledPattern = useEditorStore((state) => state.setSampledPattern);
  const selectedTerrainId = useEditorStore((state) => state.selectedTerrainId);
  const entitySnapMode = useEditorStore((state) => state.entitySnapMode);

  const isDrawingRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const lineAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const draggingEntityRef = useRef<string | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null); // Entity drag offset
  const draggingObjectInstanceRef = useRef<string | null>(null);
  const dragObjectOffsetRef = useRef<{ x: number; y: number } | null>(null);
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
  // Collision tool refs
  const collisionPlaceStartRef = useRef<{ x: number; y: number } | null>(null);
  const collisionCircleStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggingCollisionRef = useRef<string | null>(null);
  const dragCollisionOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const draggingCollisionHandleRef = useRef<string | null>(null);
  const dragCollisionInitialRef = useRef<{
    x: number;
    y: number;
    w?: number;
    h?: number;
    r?: number;
  } | null>(null);
  const draggingCollisionVertexRef = useRef<number | null>(null);
  const collisionPolygonPointsRef = useRef<[number, number][] | null>(null);
  const isShiftHeldRef = useRef(false);
  const terrainGridRef = useRef<Map<string, string | null>>(new Map());
  const terrainGridInitializedRef = useRef(false);
  const lastTerrainPaintRef = useRef<{ x: number; y: number } | null>(null);
  const isSamplingRef = useRef(false);
  const sampleStartRef = useRef<{ x: number; y: number } | null>(null);
  const historyBatchActiveRef = useRef(false);
  // Water brush stroke in progress: the layer, the body value being painted, and the last pixel.
  const waterStrokeRef = useRef<{ layerId: string; value: number; x: number; y: number } | null>(
    null,
  );
  // Flow stroke being dragged out, in map pixels.
  const waterFlowRef = useRef<{
    layerId: string;
    bodyId: string;
    points: [number, number][];
  } | null>(null);

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

  const snapWorldPosition = useCallback(
    (x: number, y: number): [number, number] => {
      if (entitySnapMode === 'grid') {
        return [
          Math.floor(x / projectTileSize) * projectTileSize,
          Math.floor(y / projectTileSize) * projectTileSize,
        ];
      }
      return [Math.round(x), Math.round(y)];
    },
    [entitySnapMode, projectTileSize],
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
        terrainGridInitializedRef,
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

  const hitTestCollision = useCallback(
    (worldX: number, worldY: number): { collision: MapCollision; handle: string } | undefined => {
      const collisions = currentMap?.spatialPrimitives?.collisions ?? [];
      const selectedCollisionId = useEditorStore.getState().selectedCollisionId;
      const HANDLE_RADIUS = 5;
      const HANDLE_SIZE = 6;

      for (const col of [...collisions].reverse()) {
        if (col.shape === 'rectangle' && col.size) {
          const [cx, cy] = col.position;
          const [cw, ch] = col.size;

          if (col.id === selectedCollisionId) {
            const handles: Record<string, { x: number; y: number; w: number; h: number }> = {
              nw: { x: cx - HANDLE_SIZE, y: cy - HANDLE_SIZE, w: HANDLE_SIZE, h: HANDLE_SIZE },
              ne: { x: cx + cw, y: cy - HANDLE_SIZE, w: HANDLE_SIZE, h: HANDLE_SIZE },
              sw: { x: cx - HANDLE_SIZE, y: cy + ch, w: HANDLE_SIZE, h: HANDLE_SIZE },
              se: { x: cx + cw, y: cy + ch, w: HANDLE_SIZE, h: HANDLE_SIZE },
              left: {
                x: cx - HANDLE_SIZE,
                y: cy + ch / 2 - HANDLE_SIZE / 2,
                w: HANDLE_SIZE,
                h: HANDLE_SIZE,
              },
              right: {
                x: cx + cw,
                y: cy + ch / 2 - HANDLE_SIZE / 2,
                w: HANDLE_SIZE,
                h: HANDLE_SIZE,
              },
              top: {
                x: cx + cw / 2 - HANDLE_SIZE / 2,
                y: cy - HANDLE_SIZE,
                w: HANDLE_SIZE,
                h: HANDLE_SIZE,
              },
              bottom: {
                x: cx + cw / 2 - HANDLE_SIZE / 2,
                y: cy + ch,
                w: HANDLE_SIZE,
                h: HANDLE_SIZE,
              },
            };
            for (const [name, r] of Object.entries(handles)) {
              if (worldX >= r.x && worldX <= r.x + r.w && worldY >= r.y && worldY <= r.y + r.h) {
                return { collision: col, handle: name };
              }
            }
          }

          if (worldX >= cx && worldX < cx + cw && worldY >= cy && worldY < cy + ch) {
            return { collision: col, handle: 'body' };
          }
        } else if (col.shape === 'circle' && col.radius !== undefined) {
          const [cx, cy] = col.position;
          const r = col.radius;

          if (col.id === selectedCollisionId) {
            const dx = worldX - (cx + r);
            const dy = worldY - cy;
            if (Math.sqrt(dx * dx + dy * dy) <= HANDLE_RADIUS + 2) {
              return { collision: col, handle: 'radius' };
            }
          }

          const dx = worldX - cx;
          const dy = worldY - cy;
          if (Math.sqrt(dx * dx + dy * dy) <= r) {
            return { collision: col, handle: 'body' };
          }
        } else if (col.shape === 'polygon' && col.points && col.points.length >= 3) {
          if (col.id === selectedCollisionId) {
            for (let i = 0; i < col.points.length; i++) {
              const [px, py] = col.points[i];
              const dx = worldX - px;
              const dy = worldY - py;
              if (Math.sqrt(dx * dx + dy * dy) <= HANDLE_RADIUS + 2) {
                return { collision: col, handle: `vertex-${i}` };
              }
            }
          }

          if (pointInPolygon(worldX, worldY, col.points)) {
            return { collision: col, handle: 'body' };
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

      // ── Water tools — brush and eraser paint pixels; flow tools draw and remove currents ──
      if (isWaterTool(activeTool) && e.button === 0) {
        const waterLayer = currentMap.layers.find((layer) => layer.id === selectedLayerId);
        if (!waterLayer || waterLayer.kind !== 'water' || !waterLayer.waterMask) return;
        if (waterLayer.locked || !inBounds || !worldPos) return;
        const state = useEditorStore.getState();

        if (activeTool === 'waterFlowErase') {
          // Remove the stroke nearest the click, if it is close enough to mean it.
          let nearest: { bodyId: string; strokeId: string; distance: number } | null = null;
          for (const body of waterLayer.waterBodies ?? []) {
            for (const stroke of body.flow) {
              const distance = distanceToStroke([worldPos.x, worldPos.y], stroke);
              if (distance <= FLOW_ERASE_REACH && (!nearest || distance < nearest.distance)) {
                nearest = { bodyId: body.id, strokeId: stroke.id, distance };
              }
            }
          }
          if (nearest) state.removeFlowStroke(waterLayer.id, nearest.bodyId, nearest.strokeId);
          return;
        }

        const bodyValue = waterBodyValue(waterLayer.waterBodies, state.selectedWaterBodyId);
        if (activeTool === 'waterFlow') {
          // A current belongs to the selected body; without one there is nothing to attach it to.
          if (!state.selectedWaterBodyId || bodyValue === 0) return;
          const points: [number, number][] = [[roundTenth(worldPos.x), roundTenth(worldPos.y)]];
          waterFlowRef.current = {
            layerId: waterLayer.id,
            bodyId: state.selectedWaterBodyId,
            points,
          };
          state.setWaterStrokePreview(points);
          return;
        }

        // The eraser paints body 0; the brush needs a body to paint with.
        const value = activeTool === 'waterBrush' ? bodyValue : 0;
        if (activeTool === 'waterBrush' && value === 0) return;
        const { width, height } = waterLayer.waterMask;
        const pixelX = Math.floor(worldPos.x);
        const pixelY = Math.floor(worldPos.y);
        paintDisc(
          getWaterBitmap(waterLayer.id, waterLayer.waterMask),
          width,
          height,
          pixelX,
          pixelY,
          state.waterBrushRadius,
          value,
        );
        waterStrokeRef.current = { layerId: waterLayer.id, value, x: pixelX, y: pixelY };
        state.bumpWaterPaintRevision();
        return;
      }

      // ── Global Select (V) — works across ALL layers ─────────────────────────
      if (activeTool === 'select' && e.button === 0) {
        if (!worldPos) return;

        // 1. Hit-test links (click on midpoint marker between trigger & anchor)
        const hitLink = inBounds ? hitTestLink(worldPos.x, worldPos.y) : undefined;
        if (hitLink) {
          const navLayer = currentMap.layers.find((l) => l.kind === 'navigation');
          if (navLayer) useEditorStore.getState().selectLayer(navLayer.id);
          useEditorStore.getState().selectLink(hitLink.id);
          useEditorStore.getState().selectEntity(null);
          selectAnchor(null);
          selectTrigger(null);
          return;
        }

        // 2. Hit-test triggers (includes handles/vertices for selected trigger)
        const hitTriggerResult = inBounds ? hitTestTrigger(worldPos.x, worldPos.y) : undefined;
        if (hitTriggerResult) {
          const navLayer = currentMap.layers.find((l) => l.kind === 'navigation');
          if (navLayer) useEditorStore.getState().selectLayer(navLayer.id);
          selectTrigger(hitTriggerResult.trigger.id);
          selectEntity(null);
          useEditorStore.getState().selectLink(null);
          selectAnchor(null);
          startHistoryBatch();
          if (hitTriggerResult.handle.startsWith('vertex-')) {
            draggingVertexIndexRef.current = parseInt(
              hitTriggerResult.handle.replace('vertex-', ''),
              10,
            );
            draggingTriggerRef.current = hitTriggerResult.trigger.id;
          } else if (hitTriggerResult.handle !== 'body') {
            const [tx, ty] = hitTriggerResult.trigger.position;
            const [tw, th] = hitTriggerResult.trigger.size ?? [projectTileSize, projectTileSize];
            draggingTriggerHandleRef.current = hitTriggerResult.handle;
            dragTriggerInitialRef.current = { x: tx, y: ty, w: tw, h: th };
          } else {
            const [tx, ty] = hitTriggerResult.trigger.position;
            draggingTriggerRef.current = hitTriggerResult.trigger.id;
            dragTriggerOffsetRef.current = {
              x: worldPos.x - tx,
              y: worldPos.y - ty,
            };
          }
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
          selectTrigger(null);
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
          selectAnchor(null);
          selectTrigger(null);
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
        useEditorStore.getState().setActiveTool('select');
        return;
      }

      // ── Link tool — click a highlighted trigger to start a link ─────────────
      if (activeTool === 'linkPlace' && e.button === 0 && inBounds && worldPos) {
        const hit = hitTestTrigger(worldPos.x, worldPos.y);
        if (!hit) return;
        useEditorStore.getState().openConnectionWizard(hit.trigger.id);
        useEditorStore.getState().setActiveTool('select');
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
            useEditorStore.getState().setActiveTool('select');
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

      // ── Collision tools ─────────────────────────────────────────────────────
      if (activeTool === 'collisionRect' && e.button === 0 && inBounds && worldPos) {
        const [sx, sy] = snapWorldPosition(worldPos.x, worldPos.y);
        collisionPlaceStartRef.current = { x: sx, y: sy };
        startHistoryBatch();
        return;
      }

      if (activeTool === 'collisionPolygon' && e.button === 0 && inBounds && worldPos) {
        const [sx, sy] = snapWorldPosition(worldPos.x, worldPos.y);
        const pts = collisionPolygonPointsRef.current ?? [];
        const CLOSE_DIST = projectTileSize * 0.75;
        if (pts.length >= 3) {
          const [fx, fy] = pts[0];
          const dx = sx - fx;
          const dy = sy - fy;
          if (Math.sqrt(dx * dx + dy * dy) <= CLOSE_DIST) {
            const minX = Math.min(...pts.map(([x]) => x));
            const minY = Math.min(...pts.map(([, y]) => y));
            addCollision({
              id: `collision-${Date.now()}`,
              shape: 'polygon',
              position: [minX, minY],
              points: pts,
              tags: [],
            });
            collisionPolygonPointsRef.current = null;
            setPolygonPreviewPoints(null);
            useEditorStore.getState().setActiveTool('collisionSelect');
            return;
          }
        }
        const newPts: [number, number][] = [...pts, [sx, sy]];
        collisionPolygonPointsRef.current = newPts;
        setPolygonPreviewPoints(newPts);
        return;
      }

      if (
        activeTool === 'collisionPolygon' &&
        e.button === 2 &&
        collisionPolygonPointsRef.current
      ) {
        const pts = collisionPolygonPointsRef.current;
        if (pts.length <= 1) {
          collisionPolygonPointsRef.current = null;
          setPolygonPreviewPoints(null);
        } else {
          const newPts: [number, number][] = pts.slice(0, -1);
          collisionPolygonPointsRef.current = newPts;
          setPolygonPreviewPoints(newPts);
        }
        e.preventDefault();
        return;
      }

      if (activeTool === 'collisionCircle' && e.button === 0 && inBounds && worldPos) {
        const [sx, sy] = snapWorldPosition(worldPos.x, worldPos.y);
        collisionCircleStartRef.current = { x: sx, y: sy };
        startHistoryBatch();
        return;
      }

      if (activeTool === 'collisionSelect' && e.button === 0) {
        if (!worldPos) return;
        const hit = inBounds ? hitTestCollision(worldPos.x, worldPos.y) : undefined;
        if (hit) {
          selectCollision(hit.collision.id);
          startHistoryBatch();
          if (hit.handle.startsWith('vertex-')) {
            draggingCollisionVertexRef.current = parseInt(hit.handle.replace('vertex-', ''), 10);
            draggingCollisionRef.current = hit.collision.id;
          } else if (hit.handle === 'radius') {
            draggingCollisionHandleRef.current = 'radius';
            dragCollisionInitialRef.current = {
              x: hit.collision.position[0],
              y: hit.collision.position[1],
              r: hit.collision.radius,
            };
          } else if (hit.handle !== 'body') {
            const [cx, cy] = hit.collision.position;
            const [cw, ch] = hit.collision.size ?? [projectTileSize, projectTileSize];
            draggingCollisionHandleRef.current = hit.handle;
            dragCollisionInitialRef.current = { x: cx, y: cy, w: cw, h: ch };
          } else {
            draggingCollisionRef.current = hit.collision.id;
            dragCollisionOffsetRef.current = {
              x: worldPos.x - hit.collision.position[0],
              y: worldPos.y - hit.collision.position[1],
            };
          }
          return;
        }
        selectCollision(null);
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

      const selectedLayer = currentMap.layers.find((layer) => layer.id === selectedLayerId);
      const isBaseObjectLayer = selectedLayer?.kind === 'object' && activeVariationId === null;

      if (isBaseObjectLayer && (activeTool === 'objectSelect' || activeTool === 'objectDelete')) {
        const worldPos = screenToWorldUtil(viewport, e.clientX, e.clientY);
        if (!worldPos || !selectedLayerId || !selectedLayer) return;
        const hit = getObjectInstanceAtWorldPosition(
          selectedLayer,
          worldPos.x,
          worldPos.y,
          objectIndex,
          projectTileSize,
        );

        if (activeTool === 'objectDelete') {
          if (hit) {
            removeObjectInstance(selectedLayerId, hit.id);
          }
        } else {
          selectObjectInstance(hit?.id ?? null);
          if (hit) {
            startHistoryBatch();
            draggingObjectInstanceRef.current = hit.id;
            dragObjectOffsetRef.current = {
              x: worldPos.x - hit.x,
              y: worldPos.y - hit.y,
            };
          } else {
            draggingObjectInstanceRef.current = null;
            dragObjectOffsetRef.current = null;
          }
        }
      } else if (activeTool === 'entitySelect' || activeTool === 'entityDelete') {
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
        selectObjectInstance(null);
      } else if (
        activeTool === 'stamp' ||
        activeTool === 'random' ||
        activeTool === 'erase' ||
        activeTool === 'fill' ||
        activeTool === 'objectPlace'
      ) {
        const objectId = selectedObjectId;
        const canPlaceObjectInstances =
          isBaseObjectLayer && activeTool === 'objectPlace' && !!objectId;

        if (selectedLayerId && drawMode === 'point' && canPlaceObjectInstances) {
          startHistoryBatch();
          if (objectId) {
            const origin =
              entitySnapMode === 'pixel' && worldPos
                ? getCenteredObjectPlacementPixelOrigin(
                    objectIndex,
                    objectId,
                    worldPos.x,
                    worldPos.y,
                    projectTileSize,
                  )
                : (() => {
                    const tileOrigin = getCenteredObjectPlacementOrigin(
                      objectIndex,
                      objectId,
                      tx,
                      ty,
                    );
                    return {
                      x: tileOrigin.x * projectTileSize,
                      y: tileOrigin.y * projectTileSize,
                    };
                  })();
            if (
              objectPlacementIntersectsMap(
                objectIndex,
                objectId,
                origin.x,
                origin.y,
                projectTileSize,
                currentMap.width,
                currentMap.height,
              )
            ) {
              placeObjectInstance(selectedLayerId, origin.x, origin.y, objectId);
            }
          }
          return;
        }

        if (selectedLayerId && drawMode !== 'point' && canPlaceObjectInstances) {
          drawStartRef.current = { x: tx, y: ty };
          isDrawingRef.current = true;
          setDrawPreview({
            isDrawing: true,
            start: { x: tx, y: ty },
            end: { x: tx, y: ty },
            mode: 'draw',
          });
          return;
        }

        // Object layers hold only placed objects; the tile tools do nothing there.
        if (selectedLayer?.kind === 'object') return;

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
                tilesetId: activeTilesetId ?? undefined,
                tileIndex: selectedTileIndex ?? undefined,
                tileIndices:
                  selectedTileIndices && selectedTileIndices.length > 0
                    ? selectedTileIndices
                    : undefined,
              });
            } else if (
              (activeTool === 'stamp' || activeTool === 'fill') &&
              (activeTilesetId || patternData)
            ) {
              // Stamp/fill flood fill - supports stencil patterns
              bucketFillAdvanced(selectedLayerId, tx, ty, {
                mode: 'stamp',
                tilesetId: activeTilesetId ?? undefined,
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
        terrainGridInitializedRef.current = false;
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
      selectedObjectId,
      selectedEntityTypeId,
      activeVariationId,
      selectedTerrainId,
      entitySnapMode,
      projectTileSize,
      screenToTile,
      applyShape,
      applyTerrainShape,
      placeObjectInstance,
      removeObjectInstance,
      moveObjectInstance,
      selectObjectInstance,
      selectEntity,
      removeEntity,
      bucketFillAdvanced,
      getPattern,
      placeEntity,
      snapWorldPosition,
      setDrawPreview,
      setPolygonPreviewPoints,
      hitTestEntity,
      hitTestLink,
      hitTestTrigger,
      startHistoryBatch,
      selectTrigger,
      addTrigger,
      hitTestCollision,
      selectCollision,
      addCollision,
      objectIndex,
    ],
  );

  // Handle pointer move
  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!viewport || !currentMap) return;
      const worldPos = screenToWorldUtil(viewport, e.clientX, e.clientY);
      // Water cursor: the exact pixel the next dab (or the stroke's centre) would land on.
      if (isWaterTool(activeTool)) {
        const insideMap =
          !!worldPos &&
          worldPos.x >= 0 &&
          worldPos.y >= 0 &&
          worldPos.x < currentMap.width * projectTileSize &&
          worldPos.y < currentMap.height * projectTileSize;
        useEditorStore
          .getState()
          .setWaterCursor(
            insideMap ? { x: Math.floor(worldPos.x), y: Math.floor(worldPos.y) } : null,
          );
      }
      if (worldPos) {
        setHoveredWorldPosition({ x: Math.round(worldPos.x), y: Math.round(worldPos.y) });
      } else {
        setHoveredWorldPosition(null);
      }

      const tile = screenToTile(e.clientX, e.clientY);
      if (tile) {
        setHoveredTile({ x: tile.x, y: tile.y });
      } else {
        setHoveredTile(null);
      }

      // Water paint stroke: connect the previous pixel to this one so fast moves leave no gaps.
      const waterStroke = waterStrokeRef.current;
      if (waterStroke && e.buttons === 1 && worldPos) {
        const waterLayer = useEditorStore
          .getState()
          .currentMap?.layers.find((layer) => layer.id === waterStroke.layerId);
        if (waterLayer?.waterMask) {
          const { width, height } = waterLayer.waterMask;
          const pixelX = Math.min(width - 1, Math.max(0, Math.floor(worldPos.x)));
          const pixelY = Math.min(height - 1, Math.max(0, Math.floor(worldPos.y)));
          const state = useEditorStore.getState();
          paintStroke(
            getWaterBitmap(waterLayer.id, waterLayer.waterMask),
            width,
            height,
            waterStroke.x,
            waterStroke.y,
            pixelX,
            pixelY,
            state.waterBrushRadius,
            waterStroke.value,
          );
          waterStroke.x = pixelX;
          waterStroke.y = pixelY;
          state.bumpWaterPaintRevision();
        }
        return;
      }

      // Water flow stroke: extend the line being dragged out, kept inside the map.
      const waterFlow = waterFlowRef.current;
      if (waterFlow && e.buttons === 1 && worldPos) {
        const point: [number, number] = [
          roundTenth(Math.min(currentMap.width * projectTileSize, Math.max(0, worldPos.x))),
          roundTenth(Math.min(currentMap.height * projectTileSize, Math.max(0, worldPos.y))),
        ];
        const points = appendStrokePoint(waterFlow.points, point, FLOW_POINT_SPACING);
        if (points !== waterFlow.points) {
          waterFlow.points = points;
          useEditorStore.getState().setWaterStrokePreview(points);
        }
        return;
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
      if (e.buttons === 1 && activeTool === 'objectSelect' && draggingObjectInstanceRef.current) {
        const worldPos = screenToWorldUtil(viewport, e.clientX, e.clientY);
        if (worldPos && selectedLayerId) {
          const offset = dragObjectOffsetRef.current ?? { x: 0, y: 0 };
          const [x, y] = snapWorldPosition(worldPos.x - offset.x, worldPos.y - offset.y);
          moveObjectInstance(selectedLayerId, draggingObjectInstanceRef.current, x, y);
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

      if (e.buttons === 1 && activeTool === 'select' && draggingAnchorRef.current && worldPos) {
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
        activeTool === 'select' &&
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
        activeTool === 'select' &&
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
        activeTool === 'select' &&
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

      // collisionRect drag — live rect preview
      if (
        e.buttons === 1 &&
        activeTool === 'collisionRect' &&
        collisionPlaceStartRef.current &&
        worldPos
      ) {
        const start = collisionPlaceStartRef.current;
        const [ex, ey] = snapWorldPosition(worldPos.x, worldPos.y);
        setDrawPreview({
          isDrawing: true,
          start: { x: start.x / projectTileSize, y: start.y / projectTileSize },
          end: { x: ex / projectTileSize, y: ey / projectTileSize },
          mode: 'draw',
        });
      }

      // collisionCircle drag — live circle preview
      if (
        e.buttons === 1 &&
        activeTool === 'collisionCircle' &&
        collisionCircleStartRef.current &&
        worldPos
      ) {
        const start = collisionCircleStartRef.current;
        setDrawPreview({
          isDrawing: true,
          start: { x: start.x / projectTileSize, y: start.y / projectTileSize },
          end: { x: worldPos.x / projectTileSize, y: worldPos.y / projectTileSize },
          mode: 'draw',
        });
      }

      // collisionSelect — drag polygon vertex
      if (
        e.buttons === 1 &&
        activeTool === 'collisionSelect' &&
        draggingCollisionRef.current &&
        draggingCollisionVertexRef.current !== null &&
        worldPos
      ) {
        const colId = draggingCollisionRef.current;
        const vertIdx = draggingCollisionVertexRef.current;
        const col = currentMap?.spatialPrimitives?.collisions?.find((c) => c.id === colId);
        if (col?.shape === 'polygon' && col.points) {
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
          const newPoints: [number, number][] = col.points.map((p, i) =>
            i === vertIdx ? [nx, ny] : p,
          );
          updateCollision(colId, { points: newPoints }, true);
        }
      }

      // collisionSelect — drag body
      if (
        e.buttons === 1 &&
        activeTool === 'collisionSelect' &&
        draggingCollisionRef.current &&
        draggingCollisionVertexRef.current === null &&
        !draggingCollisionHandleRef.current &&
        worldPos
      ) {
        const colId = draggingCollisionRef.current;
        const col = currentMap?.spatialPrimitives?.collisions?.find((c) => c.id === colId);
        if (!col) return;
        const { entitySnapMode: snapMode } = useEditorStore.getState();
        const offset = dragCollisionOffsetRef.current ?? { x: 0, y: 0 };
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
        if (col.shape === 'polygon' && col.points) {
          const [origX, origY] = col.position;
          const dx = snappedX - origX;
          const dy = snappedY - origY;
          if (dx !== 0 || dy !== 0) {
            const newPoints: [number, number][] = col.points.map(([px, py]) => [px + dx, py + dy]);
            updateCollision(colId, { position: [snappedX, snappedY], points: newPoints }, true);
          }
        } else {
          updateCollision(colId, { position: [snappedX, snappedY] }, true);
        }
      }

      // collisionSelect — drag radius handle (circle)
      if (
        e.buttons === 1 &&
        activeTool === 'collisionSelect' &&
        draggingCollisionHandleRef.current === 'radius' &&
        dragCollisionInitialRef.current &&
        worldPos
      ) {
        const init = dragCollisionInitialRef.current;
        const newRadius = Math.max(
          1,
          Math.round(Math.hypot(worldPos.x - init.x, worldPos.y - init.y)),
        );
        const selectedId = useEditorStore.getState().selectedCollisionId;
        if (selectedId) updateCollision(selectedId, { radius: newRadius }, true);
      }

      // collisionSelect — resize rectangle handle
      if (
        e.buttons === 1 &&
        activeTool === 'collisionSelect' &&
        draggingCollisionHandleRef.current &&
        draggingCollisionHandleRef.current !== 'radius' &&
        dragCollisionInitialRef.current &&
        worldPos
      ) {
        const selectedId = useEditorStore.getState().selectedCollisionId;
        if (!selectedId) return;
        const init = dragCollisionInitialRef.current;
        const handle = draggingCollisionHandleRef.current;
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
        let nx = init.x ?? 0,
          ny = init.y ?? 0,
          nw = init.w ?? projectTileSize,
          nh = init.h ?? projectTileSize;
        switch (handle) {
          case 'nw':
            nx = px;
            ny = py;
            nw = (init.x ?? 0) + (init.w ?? 0) - px;
            nh = (init.y ?? 0) + (init.h ?? 0) - py;
            break;
          case 'ne':
            ny = py;
            nw = px - (init.x ?? 0);
            nh = (init.y ?? 0) + (init.h ?? 0) - py;
            break;
          case 'sw':
            nx = px;
            nw = (init.x ?? 0) + (init.w ?? 0) - px;
            nh = py - (init.y ?? 0);
            break;
          case 'se':
            nw = px - (init.x ?? 0);
            nh = py - (init.y ?? 0);
            break;
          case 'left':
            nx = px;
            nw = (init.x ?? 0) + (init.w ?? 0) - px;
            break;
          case 'right':
            nw = px - (init.x ?? 0);
            break;
          case 'top':
            ny = py;
            nh = (init.y ?? 0) + (init.h ?? 0) - py;
            break;
          case 'bottom':
            nh = py - (init.y ?? 0);
            break;
        }
        if (nw < MIN) nw = MIN;
        if (nh < MIN) nh = MIN;
        updateCollision(
          selectedId,
          { position: [Math.round(nx), Math.round(ny)], size: [Math.round(nw), Math.round(nh)] },
          true,
        );
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
        if (
          (activeTool === 'stamp' && (activeTilesetId || sampledPattern)) ||
          (activeTool === 'random' && activeTilesetId)
        ) {
          applyShape('point', { x: tx, y: ty }, { x: tx, y: ty }, 'paint');
        } else if (activeTool === 'erase') {
          applyShape('point', { x: tx, y: ty }, { x: tx, y: ty }, 'erase');
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
          applyTerrainShape('point', { x: tx, y: ty }, { x: tx, y: ty }, selectedTerrainId);
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
      setHoveredWorldPosition,
      setDrawPreview,
      applyShape,
      applyTerrainShape,
      moveEntity,
      updateTrigger,
      updateCollision,
      snapWorldPosition,
    ],
  );

  // Handle pointer up
  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      // Finish a water stroke: one history entry holding the re-encoded mask.
      if (waterStrokeRef.current) {
        const { layerId } = waterStrokeRef.current;
        waterStrokeRef.current = null;
        const state = useEditorStore.getState();
        const waterLayer = state.currentMap?.layers.find((layer) => layer.id === layerId);
        if (waterLayer?.waterMask) {
          state.updateLayer(layerId, {
            waterMask: commitWaterBitmap(layerId, waterLayer.waterMask),
          });
        }
        return;
      }

      // Finish a flow stroke: simplified, and dropped if it was only a click.
      if (waterFlowRef.current) {
        const { layerId, bodyId, points } = waterFlowRef.current;
        waterFlowRef.current = null;
        const state = useEditorStore.getState();
        state.setWaterStrokePreview(null);
        const simplified = simplifyStroke(points, FLOW_SIMPLIFY_TOLERANCE);
        if (strokeLength(simplified) >= MIN_FLOW_STROKE_LENGTH) {
          state.addFlowStroke(layerId, bodyId, {
            id: `flow-${Date.now()}`,
            points: simplified,
            width: state.waterFlowStrokeWidth,
            speed: state.waterFlowSpeed,
          });
        }
        return;
      }

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
            const selectedLayer = currentMap.layers.find((layer) => layer.id === selectedLayerId);
            if (selectedLayer?.kind === 'object') {
              // On an object layer, sampling picks the placed object to place more of it.
              const worldPos = screenToWorldUtil(viewport, e.clientX, e.clientY);
              const objectInstance = worldPos
                ? getObjectInstanceAtWorldPosition(
                    selectedLayer,
                    worldPos.x,
                    worldPos.y,
                    objectIndex,
                    projectTileSize,
                  )
                : getObjectInstanceAtTile(
                    selectedLayer,
                    tile.x,
                    tile.y,
                    objectIndex,
                    projectTileSize,
                  );
              if (objectInstance) setSelectedObject(objectInstance.objectId);
              isSamplingRef.current = false;
              sampleStartRef.current = null;
              setDrawPreview({ isDrawing: false, start: null, end: null });
              finishHistoryBatch();
              return;
            }

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
                  setSelectedObject(null);
                  setSelectedTile(tileIndex);
                }
              }
            } else {
              // Right-clicked an empty tile — sample an "empty" pattern (null)
              // Keep the active tool the same; stamping this pattern will erase
              setSelectedTile(null);
              setSelectedTiles([]);
              setSelectedObject(null);
              const pattern = [[null]] as (number | null)[][];
              setSampledPattern({
                tilesetId: activeTilesetId ?? '',
                pattern,
                width: 1,
                height: 1,
              });
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
            setSelectedObject(null);

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

            // Store the sampled pattern for stamping after any tileset selection updates,
            // because selection changes clear sampledPattern.
            setSampledPattern({
              tilesetId: firstTilesetId,
              pattern,
              width,
              height,
            });
          } else {
            // Sampled region contained no tiles — store an all-null sampled pattern
            setSelectedTile(null);
            setSelectedTiles([]);
            setSelectedObject(null);
            setSampledPattern({
              tilesetId: activeTilesetId ?? '',
              pattern,
              width,
              height,
            });
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
        selectedLayerId &&
        activeTool === 'objectPlace' &&
        drawMode !== 'point'
      ) {
        const selectedLayer = currentMap.layers.find((layer) => layer.id === selectedLayerId);
        const isBaseObjectLayer = selectedLayer?.kind === 'object' && activeVariationId === null;
        if (isBaseObjectLayer) {
          const tile = screenToTile(e.clientX, e.clientY);
          setDrawPreview({ isDrawing: false, start: null, end: null });
          if (tile) {
            startHistoryBatch();
            const origins = collectObjectPlacementOrigins(
              drawMode as 'rect' | 'circle' | 'line',
              drawStartRef.current,
              tile,
              useEditorStore.getState().brushSize,
              objectIndex,
              selectedObjectId ?? '',
            );

            if (selectedObjectId) {
              for (const origin of origins) {
                const centeredOrigin = getCenteredObjectPlacementOrigin(
                  objectIndex,
                  selectedObjectId,
                  origin.x,
                  origin.y,
                );
                const x = centeredOrigin.x * projectTileSize;
                const y = centeredOrigin.y * projectTileSize;
                if (
                  objectPlacementIntersectsMap(
                    objectIndex,
                    selectedObjectId,
                    x,
                    y,
                    projectTileSize,
                    currentMap.width,
                    currentMap.height,
                  )
                ) {
                  placeObjectInstance(selectedLayerId, x, y, selectedObjectId);
                }
              }
            }
          }
          isDrawingRef.current = false;
          drawStartRef.current = null;
          lastTerrainPaintRef.current = null;
          draggingObjectInstanceRef.current = null;
          dragObjectOffsetRef.current = null;
          draggingEntityRef.current = null;
          dragOffsetRef.current = null;
          finishHistoryBatch();
          return;
        }
      }

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
      draggingObjectInstanceRef.current = null;
      dragObjectOffsetRef.current = null;
      draggingEntityRef.current = null;
      dragOffsetRef.current = null;
      if (draggingAnchorRef.current) {
        const { currentMap: map } = useEditorStore.getState();
        if (map) saveMapDebounced(map);
      }
      draggingAnchorRef.current = null;
      dragAnchorOffsetRef.current = null;

      // Finalize collisionRect drag → create the rectangle collision
      if (activeTool === 'collisionRect' && collisionPlaceStartRef.current) {
        const wPos = screenToWorldUtil(viewport, e.clientX, e.clientY);
        const start = collisionPlaceStartRef.current;
        const [ex, ey] = wPos ? snapWorldPosition(wPos.x, wPos.y) : [start.x, start.y];
        const x = Math.min(start.x, ex);
        const y = Math.min(start.y, ey);
        const w = Math.max(projectTileSize, Math.abs(ex - start.x));
        const h = Math.max(projectTileSize, Math.abs(ey - start.y));
        addCollision({
          id: `collision-${Date.now()}`,
          shape: 'rectangle',
          position: [x, y],
          size: [w, h],
          tags: [],
        });
        useEditorStore.getState().setActiveTool('collisionSelect');
        collisionPlaceStartRef.current = null;
        setDrawPreview({ isDrawing: false, start: null, end: null });
        finishHistoryBatch();
        return;
      }
      collisionPlaceStartRef.current = null;

      // Finalize collisionCircle drag → create the circle collision
      if (activeTool === 'collisionCircle' && collisionCircleStartRef.current) {
        const wPos = screenToWorldUtil(viewport, e.clientX, e.clientY);
        const center = collisionCircleStartRef.current;
        const radius = wPos
          ? Math.max(1, Math.round(Math.hypot(wPos.x - center.x, wPos.y - center.y)))
          : projectTileSize;
        addCollision({
          id: `collision-${Date.now()}`,
          shape: 'circle',
          position: [center.x, center.y],
          radius,
          tags: [],
        });
        useEditorStore.getState().setActiveTool('collisionSelect');
        collisionCircleStartRef.current = null;
        setDrawPreview({ isDrawing: false, start: null, end: null });
        finishHistoryBatch();
        return;
      }
      collisionCircleStartRef.current = null;

      // Flush collision drag/resize save
      if (draggingCollisionRef.current || draggingCollisionHandleRef.current) {
        const { currentMap: map } = useEditorStore.getState();
        if (map) saveMapDebounced(map);
      }
      draggingCollisionRef.current = null;
      dragCollisionOffsetRef.current = null;
      draggingCollisionHandleRef.current = null;
      dragCollisionInitialRef.current = null;
      draggingCollisionVertexRef.current = null;

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
        useEditorStore.getState().setActiveTool('select');
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
      objectIndex,
      selectedObjectId,
      placeObjectInstance,
      screenToTile,
      applyShape,
      applyTerrainShape,
      setDrawPreview,
      setPolygonPreviewPoints,
      setActiveTileset,
      setSelectedTile,
      setSelectedTiles,
      setSelectedObject,
      setSampledPattern,
      finishHistoryBatch,
      addTrigger,
      addCollision,
      snapWorldPosition,
      projectTileSize,
      viewport,
    ],
  );

  // Double-click a connected trigger → jump to the linked target anchor
  const handleDoubleClick = useCallback(
    (e: MouseEvent) => {
      if (!viewport) return;
      const worldPos = screenToWorldUtil(viewport, e.clientX, e.clientY);
      if (!worldPos) return;
      const hit = hitTestTrigger(worldPos.x, worldPos.y);
      if (!hit) return;

      const { currentMap: cm, maps: allMaps } = useEditorStore.getState();
      const link = cm?.locationLinks?.find((l) => l.triggerId === hit.trigger.id);
      if (!link) return;
      const targetMap = allMaps.find((m) => m.id === link.targetMapId);
      if (!targetMap) return;

      const applySelection = () => {
        const store = useEditorStore.getState();
        const latestMap = store.maps.find((m) => m.id === link.targetMapId);
        const navLayer = latestMap?.layers.find((layer) => layer.kind === 'navigation');
        if (navLayer) store.selectLayer(navLayer.id);
        store.selectAnchor(link.targetAnchorId);
      };

      if (link.targetMapId !== cm?.id) {
        Promise.resolve(useEditorStore.getState().loadMap(link.targetMapId)).then(applySelection);
      } else {
        applySelection();
      }
      e.preventDefault();
    },
    [viewport, hitTestTrigger],
  );

  // Keep latest handler refs so stable wrapper closures always call the current version
  const handlePointerDownRef = useRef(handlePointerDown);
  const handlePointerMoveRef = useRef(handlePointerMove);
  const handlePointerUpRef = useRef(handlePointerUp);
  const handleDoubleClickRef = useRef(handleDoubleClick);
  handlePointerDownRef.current = handlePointerDown;
  handlePointerMoveRef.current = handlePointerMove;
  handlePointerUpRef.current = handlePointerUp;
  handleDoubleClickRef.current = handleDoubleClick;

  // Set up event listeners — only re-fires when viewport changes, not on every state update
  useEffect(() => {
    if (!viewport) return;

    const view = viewport.options.events?.domElement;
    if (!view) return;

    const onDown = (e: PointerEvent) => handlePointerDownRef.current(e);
    const onMove = (e: PointerEvent) => handlePointerMoveRef.current(e);
    const onUp = (e: PointerEvent) => handlePointerUpRef.current(e);
    const onDblClick = (e: MouseEvent) => handleDoubleClickRef.current(e);
    const preventContextMenu = (e: Event) => {
      e.preventDefault();
    };

    view.addEventListener('pointerdown', onDown);
    view.addEventListener('pointermove', onMove);
    view.addEventListener('pointerup', onUp);
    view.addEventListener('dblclick', onDblClick);
    view.addEventListener('contextmenu', preventContextMenu);

    return () => {
      view.removeEventListener('pointerdown', onDown);
      view.removeEventListener('pointermove', onMove);
      view.removeEventListener('pointerup', onUp);
      view.removeEventListener('dblclick', onDblClick);
      view.removeEventListener('contextmenu', preventContextMenu);
    };
  }, [viewport]);

  // Reset drawing state when tool/mode changes
  useEffect(() => {
    isDrawingRef.current = false;
    drawStartRef.current = null;
    lineAnchorRef.current = null;
    collisionPolygonPointsRef.current = null;
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
