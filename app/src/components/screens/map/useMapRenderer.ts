import { splitTileRef } from '../../../lib/tileRef';
import { useEffect, useRef, useCallback } from 'react';
import { Container, Graphics, Sprite, BitmapText, Texture, Rectangle } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useEditorStore } from '../../../store/useEditorStore';
import { resolveTileAt, resolveEntities, resolveMapContext } from '../../../lib/mapUtils';
import { DEFAULT_TILE_SIZE } from '../../../config/constants';
import { buildPatternFromSelection, TilePattern } from '../../../lib/tileUtils';
import { sampleSeededTile } from '../../../lib/randomUtils';
import { bresenhamLine, circularBrush } from '../../../lib/algorithms';
import { shapeToNormalizedPolygon } from '../../../lib/collisionUtils';
import { getIconTexture } from '../../../lib/iconRaster';
import { getWaterBitmap } from '../../../lib/waterMaskCache';
import {
  isWaterPaintTool,
  isWaterTool,
  waterBodyColor,
  waterBodyValue,
} from '../../../lib/waterBodies';
import { resolveLinkTarget, getTriggerCenter } from '../../../lib/locationLinkUtils';
import {
  collectObjectPlacementOrigins,
  computeObjectInstanceSortDepth,
  expandObjectInstanceSpriteTiles,
  getCenteredObjectPlacementOrigin,
  getCenteredObjectPlacementPixelOrigin,
  getObjectInstanceBounds,
} from '../../../lib/mapObjects';
import type { Map as GameMap, Tileset } from '../../../types/schema';
import type { ToolType } from '../../../types/editor';

interface UseMapRendererProps {
  viewport: Viewport | null;
}

type OverlayPoint = { x: number; y: number };
type OverlaySegment = { a: OverlayPoint; b: OverlayPoint };

const OUT_OF_BOUNDS_OBJECT_ALPHA = 0.25;

function isTileSpriteOutsideMap(
  x: number,
  y: number,
  tileSize: number,
  mapWidth: number,
  mapHeight: number,
): boolean {
  return (
    x < 0 || y < 0 || x + tileSize > mapWidth * tileSize || y + tileSize > mapHeight * tileSize
  );
}

export function quantizeOverlayPoint(x: number, y: number): OverlayPoint {
  return { x: Math.round(x), y: Math.round(y) };
}

export function makeSegmentKey(a: OverlayPoint, b: OverlayPoint): string {
  const aBeforeB = a.x < b.x || (a.x === b.x && a.y <= b.y);
  const p1 = aBeforeB ? a : b;
  const p2 = aBeforeB ? b : a;
  return `${p1.x},${p1.y}|${p2.x},${p2.y}`;
}

export function toggleSegment(
  segmentMap: Map<string, OverlaySegment>,
  a: OverlayPoint,
  b: OverlayPoint,
): void {
  if (a.x === b.x && a.y === b.y) return;
  const key = makeSegmentKey(a, b);
  if (segmentMap.has(key)) {
    segmentMap.delete(key);
  } else {
    segmentMap.set(key, { a, b });
  }
}

export function addPolygonSegments(
  segmentMap: Map<string, OverlaySegment>,
  points: OverlayPoint[],
): void {
  if (points.length < 2) return;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    toggleSegment(segmentMap, current, next);
  }
}

// Computes fill polygons and merged segments for collision overlay given map state
export function computeCollisionOverlay(
  currentMap: GameMap | null,
  activeVariationId: string | null,
  tilesets: Map<string, Tileset>,
  tileSize: number = DEFAULT_TILE_SIZE,
): {
  fillPolygons: OverlayPoint[][];
  mergedSegments: Map<string, OverlaySegment>;
} {
  const fillPolygons: OverlayPoint[][] = [];
  const mergedSegments = new Map<string, OverlaySegment>();

  if (!currentMap) return { fillPolygons, mergedSegments };

  const effectiveMap = resolveMapContext(currentMap, activeVariationId);

  [...currentMap.layers]
    .sort((a, b) => a.zOrder - b.zOrder)
    .forEach((layer) => {
      if (!layer.visible || (layer.kind !== 'visual' && layer.kind !== 'object')) return;

      for (let y = 0; y < currentMap.height; y++) {
        for (let x = 0; x < currentMap.width; x++) {
          const tileRef = resolveTileAt(currentMap, layer.id, x, y, activeVariationId, tilesets);
          if (!tileRef) continue;

          const [tsId, indexStr] = splitTileRef(tileRef);
          const index = parseInt(indexStr, 10);
          const tileset = tilesets.get(tsId);
          if (!tileset) continue;

          const resolvedBaseTilesetId =
            tsId === currentMap.baseTilesetId ? effectiveMap.baseTilesetId : tsId;

          let effectiveTileset = tilesets.get(resolvedBaseTilesetId) || tileset;
          const variation = currentMap.variations?.find((v) => v.id === activeVariationId);
          if (variation?.tilesetSuffix) {
            const suffixed = tilesets.get(`${resolvedBaseTilesetId}${variation.tilesetSuffix}`);
            if (suffixed) effectiveTileset = suffixed;
          }

          const collision = effectiveTileset.tiles[index]?.collision;
          if (!collision || collision.type === 'none') continue;

          const tileX = x * tileSize;
          const tileY = y * tileSize;

          if (collision.type === 'full') {
            const polygon = [
              quantizeOverlayPoint(tileX, tileY),
              quantizeOverlayPoint(tileX + tileSize, tileY),
              quantizeOverlayPoint(tileX + tileSize, tileY + tileSize),
              quantizeOverlayPoint(tileX, tileY + tileSize),
            ];
            fillPolygons.push(polygon);
            addPolygonSegments(mergedSegments, polygon);
            continue;
          }

          for (const shape of collision.shapes || []) {
            const points = shapeToNormalizedPolygon(shape, tileSize);
            if (points.length < 3) continue;

            const polygon = points.map(([px, py]) =>
              quantizeOverlayPoint(tileX + px * tileSize, tileY + py * tileSize),
            );

            fillPolygons.push(polygon);
            addPolygonSegments(mergedSegments, polygon);
          }
        }
      }
    });

  return { fillPolygons, mergedSegments };
}

export function renderCollisionGraphics(
  collisionGraphics: Graphics | null,
  fillPolygons: OverlayPoint[][],
  mergedSegments: Map<string, OverlaySegment>,
) {
  if (!collisionGraphics) return;

  for (const polygon of fillPolygons) {
    if (polygon.length < 3) continue;
    collisionGraphics.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) {
      collisionGraphics.lineTo(polygon[i].x, polygon[i].y);
    }
    collisionGraphics.closePath?.();
    collisionGraphics.fill({ color: 0xff7f50, alpha: 0.3 });
  }

  collisionGraphics.setStrokeStyle?.({
    width: 1,
    color: 0xffb48a,
    alpha: 0.9,
  });
  for (const segment of mergedSegments.values()) {
    collisionGraphics.moveTo(segment.a.x, segment.a.y);
    collisionGraphics.lineTo(segment.b.x, segment.b.y);
  }
  collisionGraphics.stroke?.();
}

/**
 * Hook that manages rendering of map tiles, entities, and grid onto a Pixi viewport.
 * Returns functions to update the rendering when state changes.
 */
export function useMapRenderer({ viewport }: UseMapRendererProps) {
  const containerRef = useRef<Container | null>(null);
  const tileContainerRef = useRef<Container | null>(null);
  const entityContainerRef = useRef<Container | null>(null);
  const gridGraphicsRef = useRef<Graphics | null>(null);
  const collisionGraphicsRef = useRef<Graphics | null>(null);
  const terrainOverlayGraphicsRef = useRef<Graphics | null>(null);
  const waterContainerRef = useRef<Container | null>(null);
  const waterFlowGraphicsRef = useRef<Graphics | null>(null);
  // One canvas-backed sprite per water layer, updated in place while painting.
  const waterOverlaysRef = useRef<
    Map<string, { canvas: HTMLCanvasElement; image: ImageData; sprite: Sprite; texture: Texture }>
  >(new Map());
  const locationLinksGraphicsRef = useRef<Graphics | null>(null);
  const triggerGraphicsRef = useRef<Graphics | null>(null);
  const collisionShapesGraphicsRef = useRef<Graphics | null>(null);
  const hoverGraphicsRef = useRef<Graphics | null>(null);
  const selectionGraphicsRef = useRef<Graphics | null>(null);
  const previewContainerRef = useRef<Container | null>(null);

  // Create texture cache for tiles
  const textureCache = useRef<Map<string, Texture>>(new Map());
  const projectTileSize = useEditorStore((state) => state.project?.tileSize ?? DEFAULT_TILE_SIZE);

  // Initialize containers
  useEffect(() => {
    if (!viewport) return;

    const container = new Container();
    container.sortableChildren = true;
    containerRef.current = container;

    // Tile layer (z: 0)
    const tileContainer = new Container();
    tileContainer.zIndex = 0;
    tileContainerRef.current = tileContainer;
    container.addChild(tileContainer);

    // Drawn water (z: 0.5 — above tiles, below entities)
    const waterContainer = new Container();
    waterContainer.zIndex = 0.5;
    waterContainerRef.current = waterContainer;
    container.addChild(waterContainer);

    // Flow strokes (z: 0.6 — just above the water mask)
    const waterFlowGraphics = new Graphics();
    waterFlowGraphics.zIndex = 0.6;
    waterFlowGraphicsRef.current = waterFlowGraphics;
    container.addChild(waterFlowGraphics);

    // Entity layer (z: 1)
    const entityContainer = new Container();
    entityContainer.zIndex = 1;
    entityContainerRef.current = entityContainer;
    container.addChild(entityContainer);

    // Grid overlay (z: 2)
    const gridGraphics = new Graphics();
    gridGraphics.zIndex = 2;
    gridGraphicsRef.current = gridGraphics;
    container.addChild(gridGraphics);

    // Collision overlay (z: 2.5)
    const collisionGraphics = new Graphics();
    collisionGraphics.zIndex = 2.5;
    collisionGraphicsRef.current = collisionGraphics;
    container.addChild(collisionGraphics);

    // Terrain overlay (z: 2.7)
    const terrainOverlayGraphics = new Graphics();
    terrainOverlayGraphics.zIndex = 2.7;
    terrainOverlayGraphicsRef.current = terrainOverlayGraphics;
    container.addChild(terrainOverlayGraphics);

    // Location links overlay (z: 2.9)
    const locationLinksGraphics = new Graphics();
    locationLinksGraphics.zIndex = 2.9;
    locationLinksGraphicsRef.current = locationLinksGraphics;
    container.addChild(locationLinksGraphics);

    // Collision shapes overlay (z: 2.83 — below triggers)
    const collisionShapesGraphics = new Graphics();
    collisionShapesGraphics.zIndex = 2.83;
    collisionShapesGraphicsRef.current = collisionShapesGraphics;
    container.addChild(collisionShapesGraphics);

    // Trigger zones overlay (z: 2.85 — below links, above terrain)
    const triggerGraphics = new Graphics();
    triggerGraphics.zIndex = 2.85;
    triggerGraphicsRef.current = triggerGraphics;
    container.addChild(triggerGraphics);

    // Hover highlight (z: 3)
    const hoverGraphics = new Graphics();
    hoverGraphics.zIndex = 3;
    hoverGraphicsRef.current = hoverGraphics;
    container.addChild(hoverGraphics);

    // Selection highlight (z: 4)
    const selectionGraphics = new Graphics();
    selectionGraphics.zIndex = 4;
    selectionGraphicsRef.current = selectionGraphics;
    container.addChild(selectionGraphics);

    // Preview container (z: 5)
    const previewContainer = new Container();
    previewContainer.zIndex = 5;
    previewContainer.alpha = 0.5;
    previewContainerRef.current = previewContainer;
    container.addChild(previewContainer);

    viewport.addChild(container);

    const waterOverlays = waterOverlaysRef.current;
    return () => {
      waterOverlays.clear();
      waterContainerRef.current = null;
      waterFlowGraphicsRef.current = null;
      viewport.removeChild(container);
      container.destroy({ children: true });
      // Texture cache is intentionally NOT cleared here — textures are reusable
      // across map switches as long as the underlying sprite sheets haven't changed.
    };
  }, [viewport]);

  // Invalidate texture cache when sprite sheets are reloaded (tileset edits, project load).
  // This is a separate concern from viewport lifecycle — loadedSprites changes rarely.
  useEffect(() => {
    return useEditorStore.subscribe(
      (state) => state.loadedSprites,
      () => {
        textureCache.current.clear();
      },
    );
  }, []);

  // Render collision overlay from visual layers
  const renderCollisionOverlay = useCallback(() => {
    const collisionGraphics = collisionGraphicsRef.current;
    const { currentMap, activeVariationId, tilesets, showCollisionOverlay } =
      useEditorStore.getState();
    const tileSize = projectTileSize;
    if (!collisionGraphics || !currentMap) return;

    collisionGraphics.clear();
    if (!showCollisionOverlay) return;

    const effectiveMap = resolveMapContext(currentMap, activeVariationId);
    const fillPolygons: OverlayPoint[][] = [];
    const mergedSegments = new Map<string, OverlaySegment>();

    [...currentMap.layers]
      .sort((a, b) => a.zOrder - b.zOrder)
      .forEach((layer) => {
        if (
          !layer.visible ||
          (layer.kind !== 'visual' && layer.kind !== 'terrain' && layer.kind !== 'object')
        )
          return;

        if (layer.kind === 'object' && (layer.objectInstances?.length ?? 0) > 0) {
          for (const objectInstance of layer.objectInstances ?? []) {
            const spriteTiles = expandObjectInstanceSpriteTiles(
              tilesets,
              objectInstance.tilesetId,
              objectInstance.objectDefinitionId,
              objectInstance.x,
              objectInstance.y,
              tileSize,
            );
            const baseTileset = tilesets.get(objectInstance.tilesetId);
            if (!baseTileset) continue;

            let effectiveTileset = baseTileset;
            const variation = currentMap.variations?.find((v) => v.id === activeVariationId);
            if (variation?.tilesetSuffix) {
              const suffixed = tilesets.get(
                `${objectInstance.tilesetId}${variation.tilesetSuffix}`,
              );
              if (suffixed) effectiveTileset = suffixed;
            }

            for (const tile of spriteTiles) {
              const collision = effectiveTileset.tiles[tile.tileIndex]?.collision;
              if (!collision || collision.type === 'none') continue;

              if (collision.type === 'full') {
                const polygon = [
                  quantizeOverlayPoint(tile.x, tile.y),
                  quantizeOverlayPoint(tile.x + tileSize, tile.y),
                  quantizeOverlayPoint(tile.x + tileSize, tile.y + tileSize),
                  quantizeOverlayPoint(tile.x, tile.y + tileSize),
                ];
                fillPolygons.push(polygon);
                addPolygonSegments(mergedSegments, polygon);
                continue;
              }

              for (const shape of collision.shapes || []) {
                const points = shapeToNormalizedPolygon(shape, tileSize);
                if (points.length < 3) continue;

                const polygon = points.map(([px, py]) =>
                  quantizeOverlayPoint(tile.x + px * tileSize, tile.y + py * tileSize),
                );

                fillPolygons.push(polygon);
                addPolygonSegments(mergedSegments, polygon);
              }
            }
          }
          return;
        }

        for (let y = 0; y < currentMap.height; y++) {
          for (let x = 0; x < currentMap.width; x++) {
            const tileRef = resolveTileAt(currentMap, layer.id, x, y, activeVariationId, tilesets);
            if (!tileRef) continue;

            const [tsId, indexStr] = splitTileRef(tileRef);
            const index = parseInt(indexStr, 10);
            const tileset = tilesets.get(tsId);
            if (!tileset) continue;

            const resolvedBaseTilesetId =
              tsId === currentMap.baseTilesetId ? effectiveMap.baseTilesetId : tsId;

            let effectiveTileset = tilesets.get(resolvedBaseTilesetId) || tileset;
            const variation = currentMap.variations?.find((v) => v.id === activeVariationId);
            if (variation?.tilesetSuffix) {
              const suffixed = tilesets.get(`${resolvedBaseTilesetId}${variation.tilesetSuffix}`);
              if (suffixed) effectiveTileset = suffixed;
            }

            const collision = effectiveTileset.tiles[index]?.collision;
            if (!collision || collision.type === 'none') continue;

            const tileX = x * tileSize;
            const tileY = y * tileSize;

            if (collision.type === 'full') {
              const polygon = [
                quantizeOverlayPoint(tileX, tileY),
                quantizeOverlayPoint(tileX + tileSize, tileY),
                quantizeOverlayPoint(tileX + tileSize, tileY + tileSize),
                quantizeOverlayPoint(tileX, tileY + tileSize),
              ];
              fillPolygons.push(polygon);
              addPolygonSegments(mergedSegments, polygon);
              continue;
            }

            for (const shape of collision.shapes || []) {
              const points = shapeToNormalizedPolygon(shape, tileSize);
              if (points.length < 3) continue;

              const polygon = points.map(([px, py]) =>
                quantizeOverlayPoint(tileX + px * tileSize, tileY + py * tileSize),
              );

              fillPolygons.push(polygon);
              addPolygonSegments(mergedSegments, polygon);
            }
          }
        }
      });

    renderCollisionGraphics(collisionGraphics, fillPolygons, mergedSegments);
  }, [projectTileSize]);

  // Render drawn water layers as a translucent blue mask, one texel per map pixel.
  const renderWater = useCallback(() => {
    const container = waterContainerRef.current;
    const { currentMap } = useEditorStore.getState();
    if (!container || !currentMap) return;
    const overlays = waterOverlaysRef.current;
    const visibleIds = new Set<string>();

    for (const layer of currentMap.layers) {
      if (layer.kind !== 'water' || !layer.visible || !layer.waterMask) continue;
      visibleIds.add(layer.id);
      const { width, height } = layer.waterMask;
      let overlay = overlays.get(layer.id);
      if (!overlay || overlay.canvas.width !== width || overlay.canvas.height !== height) {
        if (overlay) {
          container.removeChild(overlay.sprite);
          overlay.sprite.destroy({ texture: true });
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D is unavailable for the water overlay.');
        const texture = Texture.from(canvas);
        const sprite = new Sprite(texture);
        container.addChild(sprite);
        overlay = { canvas, image: context.createImageData(width, height), sprite, texture };
        overlays.set(layer.id, overlay);
      }

      const bitmap = getWaterBitmap(layer.id, layer.waterMask);
      const pixels = overlay.image.data;
      // One RGB per body value (value 0 is empty); a value past the list can only be stale data.
      const palette = [0, ...(layer.waterBodies ?? []).map((_, index) => waterBodyColor(index))];
      for (let i = 0; i < bitmap.length; i++) {
        const offset = i * 4;
        const color = palette[bitmap[i]];
        pixels[offset] = (color >> 16) & 0xff;
        pixels[offset + 1] = (color >> 8) & 0xff;
        pixels[offset + 2] = color & 0xff;
        pixels[offset + 3] = bitmap[i] ? 150 : 0;
      }
      overlay.canvas.getContext('2d')?.putImageData(overlay.image, 0, 0);
      overlay.texture.source.update();
      overlay.sprite.alpha = layer.opacity;
    }

    for (const [layerId, overlay] of overlays) {
      if (visibleIds.has(layerId)) continue;
      container.removeChild(overlay.sprite);
      overlay.sprite.destroy({ texture: true });
      overlays.delete(layerId);
    }
  }, []);

  // Render freehand currents: a faint band for each stroke's reach, its line, and arrowheads.
  const renderWaterFlow = useCallback(() => {
    const g = waterFlowGraphicsRef.current;
    const {
      currentMap,
      selectedLayerId,
      selectedWaterBodyId,
      waterStrokePreview,
      waterFlowStrokeWidth,
    } = useEditorStore.getState();
    if (!g || !currentMap) return;
    g.clear();

    const zoom = viewport?.scale?.x ?? 1;
    const lineWidth = Math.max(0.75, 1.5 / zoom);
    const arrowSize = Math.max(3, 8 / zoom);

    const drawLine = (points: [number, number][], color: number, alpha: number) => {
      g.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
      g.stroke({ width: lineWidth, color, alpha });
    };

    // Arrowheads along the line, one roughly every ten line widths of spacing, always one at the end.
    const drawArrows = (points: [number, number][], color: number, alpha: number) => {
      const spacing = arrowSize * 8;
      let carried = spacing / 2;
      for (let i = 1; i < points.length; i++) {
        const [x0, y0] = points[i - 1];
        const [x1, y1] = points[i];
        const length = Math.hypot(x1 - x0, y1 - y0);
        if (length === 0) continue;
        const ux = (x1 - x0) / length;
        const uy = (y1 - y0) / length;
        let at = carried;
        const isLast = i === points.length - 1;
        const stops: number[] = [];
        for (; at < length; at += spacing) stops.push(at);
        if (isLast) stops.push(length);
        carried = at - length;
        for (const distance of stops) {
          const tipX = x0 + ux * distance;
          const tipY = y0 + uy * distance;
          g.moveTo(
            tipX - ux * arrowSize + uy * arrowSize * 0.6,
            tipY - uy * arrowSize - ux * arrowSize * 0.6,
          );
          g.lineTo(tipX, tipY);
          g.lineTo(
            tipX - ux * arrowSize - uy * arrowSize * 0.6,
            tipY - uy * arrowSize + ux * arrowSize * 0.6,
          );
          g.stroke({ width: lineWidth, color, alpha });
        }
      }
    };

    for (const layer of currentMap.layers) {
      if (layer.kind !== 'water' || !layer.visible) continue;
      (layer.waterBodies ?? []).forEach((body, index) => {
        const isSelected = layer.id === selectedLayerId && body.id === selectedWaterBodyId;
        const color = waterBodyColor(index);
        for (const stroke of body.flow) {
          if (stroke.points.length < 2) continue;
          // The band shows how far the stroke's direction reaches into the water.
          g.moveTo(stroke.points[0][0], stroke.points[0][1]);
          for (let i = 1; i < stroke.points.length; i++)
            g.lineTo(stroke.points[i][0], stroke.points[i][1]);
          g.stroke({
            width: stroke.width * 2,
            color,
            alpha: isSelected ? 0.18 : 0.08,
            cap: 'round',
            join: 'round',
          });
          drawLine(stroke.points, 0xffffff, isSelected ? 0.95 : 0.55);
          drawArrows(stroke.points, 0xffffff, isSelected ? 0.95 : 0.55);
        }
      });
    }

    if (waterStrokePreview && waterStrokePreview.length > 1) {
      g.moveTo(waterStrokePreview[0][0], waterStrokePreview[0][1]);
      for (let i = 1; i < waterStrokePreview.length; i++) {
        g.lineTo(waterStrokePreview[i][0], waterStrokePreview[i][1]);
      }
      g.stroke({
        width: waterFlowStrokeWidth * 2,
        color: 0xffd54f,
        alpha: 0.12,
        cap: 'round',
        join: 'round',
      });
      drawLine(waterStrokePreview, 0xffd54f, 1);
      drawArrows(waterStrokePreview, 0xffd54f, 1);
    }
  }, [viewport]);

  // Render terrain overlay — colored fill per cell based on terrainData + terrainTypes
  const renderTerrainOverlay = useCallback(() => {
    const g = terrainOverlayGraphicsRef.current;
    const { currentMap, terrainTypes, showTerrainOverlay } = useEditorStore.getState();
    const tileSize = projectTileSize;
    if (!g || !currentMap) return;

    g.clear();
    if (!showTerrainOverlay) return;

    const colorCache = new Map<string, number>();
    const getColor = (terrainId: string): number => {
      if (colorCache.has(terrainId)) return colorCache.get(terrainId)!;
      const t = terrainTypes.find((tt) => tt.id === terrainId);
      const hex = t ? parseInt(t.color.replace('#', ''), 16) : 0x888888;
      colorCache.set(terrainId, hex);
      return hex;
    };

    for (const layer of currentMap.layers) {
      if (!layer.visible || layer.kind !== 'terrain' || !layer.terrainData) continue;
      for (let y = 0; y < currentMap.height; y++) {
        for (let x = 0; x < currentMap.width; x++) {
          const terrainId = layer.terrainData[y]?.[x];
          if (!terrainId) continue;
          const color = getColor(terrainId);
          g.rect(x * tileSize, y * tileSize, tileSize, tileSize);
          g.fill({ color, alpha: 0.45 });
        }
      }
    }
  }, [projectTileSize]);

  // Get or create texture for a tile
  const getTileTexture = useCallback(
    (spriteSheet: string, tileIndex: number, columns: number): Texture | null => {
      const cacheKey = `${spriteSheet}:${tileIndex}`;
      if (textureCache.current.has(cacheKey)) {
        return textureCache.current.get(cacheKey)!;
      }

      const { loadedSprites } = useEditorStore.getState();
      const img = loadedSprites.get(spriteSheet);
      if (!img) return null;

      // Create base texture from the image if not cached
      const baseKey = `base:${spriteSheet}`;
      let baseTexture: Texture;
      if (textureCache.current.has(baseKey)) {
        baseTexture = textureCache.current.get(baseKey)!;
      } else {
        baseTexture = Texture.from(img);
        baseTexture.source.scaleMode = 'nearest';
        textureCache.current.set(baseKey, baseTexture);
      }

      const sx = (tileIndex % columns) * projectTileSize;
      const sy = Math.floor(tileIndex / columns) * projectTileSize;

      // Create a sub-texture using the frame
      const texture = new Texture({
        source: baseTexture.source,
        frame: new Rectangle(sx, sy, projectTileSize, projectTileSize),
      });

      textureCache.current.set(cacheKey, texture);
      return texture;
    },
    [projectTileSize],
  );

  // Render tiles
  const renderTiles = useCallback(() => {
    const tileContainer = tileContainerRef.current;
    const { currentMap, activeVariationId, tilesets, selectedObjectInstanceId } =
      useEditorStore.getState();
    const tileSize = projectTileSize;
    if (!tileContainer || !currentMap) return;

    const effectiveMap = resolveMapContext(currentMap, activeVariationId);

    tileContainer.removeChildren();

    [...currentMap.layers]
      .sort((a, b) => a.zOrder - b.zOrder)
      .forEach((layer) => {
        if (
          !layer.visible ||
          (layer.kind !== 'visual' && layer.kind !== 'terrain' && layer.kind !== 'object')
        )
          return;

        if (layer.kind === 'object' && (layer.objectInstances?.length ?? 0) > 0) {
          const objectInstances = layer.objectInstances ?? [];

          objectInstances
            .map((objectInstance, index) => ({
              objectInstance,
              index,
              depth: computeObjectInstanceSortDepth(tilesets, layer, objectInstance, tileSize),
            }))
            .sort((left, right) => {
              if (left.depth !== right.depth) return left.depth - right.depth;
              return left.index - right.index;
            })
            .forEach(({ objectInstance }) => {
              const objectContainer = new Container();
              const bounds = getObjectInstanceBounds(tilesets, objectInstance, tileSize);
              if (bounds) {
                objectContainer.x = bounds.x;
                objectContainer.y = bounds.y;
              }

              const spriteTiles = expandObjectInstanceSpriteTiles(
                tilesets,
                objectInstance.tilesetId,
                objectInstance.objectDefinitionId,
                objectInstance.x,
                objectInstance.y,
                tileSize,
              );

              spriteTiles.forEach((tile) => {
                const tileset = tilesets.get(tile.tilesetId);
                if (!tileset) return;

                let effectiveTileset = tileset;
                const variation = currentMap.variations?.find((v) => v.id === activeVariationId);
                if (variation?.tilesetSuffix) {
                  const suffixed = tilesets.get(`${tile.tilesetId}${variation.tilesetSuffix}`);
                  if (suffixed) effectiveTileset = suffixed;
                }

                const texture = getTileTexture(
                  effectiveTileset.spriteSheet,
                  tile.tileIndex,
                  effectiveTileset.columns,
                );

                if (!texture) return;

                const sprite = new Sprite(texture);
                sprite.x = tile.x - objectInstance.x;
                sprite.y = tile.y - objectInstance.y;
                sprite.width = tileSize;
                sprite.height = tileSize;
                sprite.alpha = isTileSpriteOutsideMap(
                  tile.x,
                  tile.y,
                  tileSize,
                  currentMap.width,
                  currentMap.height,
                )
                  ? OUT_OF_BOUNDS_OBJECT_ALPHA
                  : 1;
                objectContainer.addChild(sprite);
              });

              if (bounds && objectInstance.id === selectedObjectInstanceId) {
                const outline = new Graphics();
                outline.rect(0, 0, bounds.width, bounds.height);
                outline.stroke({ width: 2, color: 0xffffff, alpha: 0.95 });
                objectContainer.addChild(outline);
              }

              tileContainer.addChild(objectContainer);
            });

          return;
        }

        for (let y = 0; y < currentMap.height; y++) {
          for (let x = 0; x < currentMap.width; x++) {
            const tileRef = resolveTileAt(currentMap, layer.id, x, y, activeVariationId, tilesets);
            if (!tileRef) continue;

            const [tsId, indexStr] = splitTileRef(tileRef);
            const index = parseInt(indexStr);
            const tileset = tilesets.get(tsId);

            if (tileset) {
              const resolvedBaseTilesetId =
                tsId === currentMap.baseTilesetId ? effectiveMap.baseTilesetId : tsId;

              let effectiveTileset = tilesets.get(resolvedBaseTilesetId) || tileset;

              const variation = currentMap.variations?.find((v) => v.id === activeVariationId);

              if (variation?.tilesetSuffix) {
                const suffixed = tilesets.get(`${resolvedBaseTilesetId}${variation.tilesetSuffix}`);
                if (suffixed) effectiveTileset = suffixed;
              }

              const texture = getTileTexture(
                effectiveTileset.spriteSheet,
                index,
                effectiveTileset.columns,
              );

              if (texture) {
                const sprite = new Sprite(texture);
                sprite.x = x * tileSize;
                sprite.y = y * tileSize;
                sprite.width = tileSize;
                sprite.height = tileSize;
                tileContainer.addChild(sprite);
              }
            }
          }
        }
      });
  }, [getTileTexture, projectTileSize]);

  // Render entities
  const renderEntities = useCallback(() => {
    const entityContainer = entityContainerRef.current;
    const { currentMap, activeVariationId, selectedEntityId, entityTypes, loadedSprites } =
      useEditorStore.getState();
    const tileSize = projectTileSize;
    if (!entityContainer || !currentMap) return;

    entityContainer.removeChildren();

    const entityLayerVisible = currentMap.layers.some(
      (l) => l.kind === 'entity' && l.visible !== false,
    );
    if (!entityLayerVisible) return;

    const resolvedEntities = resolveEntities(currentMap, activeVariationId);
    resolvedEntities.forEach((entity) => {
      const type = entityTypes.find((t) => t.id === entity.typeId);
      const [ew, eh] = type?.defaultSize ?? [tileSize, tileSize];
      const colorHex = type?.placeholderColor || '#ffff00';
      const color = parseInt(colorHex.replace('#', ''), 16);

      const ex = entity.position[0];
      const ey = entity.position[1];

      // Render body: sprite if loaded, icon if set, else colored rect
      const spriteImg = type?.sprite?.path ? loadedSprites.get(type.sprite.path) : null;
      if (spriteImg) {
        const texture = Texture.from(spriteImg as unknown as HTMLImageElement);
        texture.source.scaleMode = 'nearest';
        const sprite = new Sprite(texture);
        sprite.x = ex;
        sprite.y = ey;
        sprite.width = ew;
        sprite.height = eh;
        sprite.alpha = 0.9;
        entityContainer.addChild(sprite);
      } else {
        // Background box
        const g = new Graphics();
        g.rect(ex, ey, ew, eh);
        g.fill({ color, alpha: 0.6 });
        entityContainer.addChild(g);

        // Render icon inside the box if the entity type has one
        if (type?.icon) {
          const iconSize = Math.min(ew, eh);
          const iconTex = getIconTexture(type.icon, '#ffffff', renderEntities);
          if (iconTex) {
            const iconSprite = new Sprite(iconTex);
            iconSprite.x = ex + (ew - iconSize) / 2;
            iconSprite.y = ey + (eh - iconSize) / 2;
            iconSprite.width = iconSize;
            iconSprite.height = iconSize;
            iconSprite.alpha = 0.9;
            entityContainer.addChild(iconSprite);
          }
        }
      }

      // Arrows: render one arrow per vector2 property on the instance
      if (type?.properties) {
        for (const propDef of type.properties) {
          if (propDef.type !== 'vector2') continue;
          const val = entity.properties?.[propDef.key];
          if (!Array.isArray(val) || val.length < 2) continue;
          const dx = val[0] as number;
          const dy = val[1] as number;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len === 0) continue;

          const cx = ex + ew / 2;
          const cy = ey + eh / 2;
          const arrowLen = Math.max(ew, eh) * 0.8;
          const nx = (dx / len) * arrowLen;
          const ny = (dy / len) * arrowLen;
          const tipX = cx + nx;
          const tipY = cy + ny;

          // Perpendicular for arrowhead wings
          const headLen = 6;
          const px = (-ny / arrowLen) * headLen;
          const py = (nx / arrowLen) * headLen;

          const arrow = new Graphics();
          arrow.moveTo(cx, cy);
          arrow.lineTo(tipX, tipY);
          arrow.stroke({ width: 2, color: 0xffffff });
          arrow.moveTo(tipX, tipY);
          arrow.lineTo(
            tipX - (nx / arrowLen) * headLen * 1.5 + px,
            tipY - (ny / arrowLen) * headLen * 1.5 + py,
          );
          arrow.moveTo(tipX, tipY);
          arrow.lineTo(
            tipX - (nx / arrowLen) * headLen * 1.5 - px,
            tipY - (ny / arrowLen) * headLen * 1.5 - py,
          );
          arrow.stroke({ width: 2, color: 0xffffff });
          entityContainer.addChild(arrow);
        }
      }

      // Selection outline
      if (entity.id === selectedEntityId) {
        const outline = new Graphics();
        outline.rect(ex - 1, ey - 1, ew + 2, eh + 2);
        outline.stroke({ width: 2, color: 0xffffff });
        entityContainer.addChild(outline);
      }

      // Label (BitmapText for crisp pixel rendering at any zoom)
      if (entity.label) {
        const label = new BitmapText({
          text: entity.label,
          style: { fontFamily: 'EntityLabel', fontSize: 10, fill: 0xffffff },
        });
        label.x = ex + ew / 2 - label.width / 2;
        label.y = ey - 14;
        entityContainer.addChild(label);
      }
    });
  }, [projectTileSize]);

  // Render grid
  const renderGrid = useCallback(() => {
    const gridGraphics = gridGraphicsRef.current;
    const { currentMap, activeTool } = useEditorStore.getState();
    const tileSize = projectTileSize;
    if (!gridGraphics || !currentMap) return;

    gridGraphics.clear();
    const drawingWater = isWaterTool(activeTool);

    const pixelWidth = currentMap.width * tileSize;
    const pixelHeight = currentMap.height * tileSize;
    // Grid lines - draw each line individually with stroke
    // Make stroke thinner when zoomed in by adjusting width inversely to viewport scale
    const vp = viewport;
    const zoomScale = vp?.scale?.x ?? 1;
    const gridLineWidth = Math.max(0.25, 1 / zoomScale);
    // Water is drawn per pixel, so tile lines would only get in the way.
    if (!drawingWater) {
      gridGraphics.setStrokeStyle({
        width: gridLineWidth,
        color: 0x2d3748,
        alpha: 0.5,
      });
      for (let x = 0; x <= pixelWidth; x += tileSize) {
        gridGraphics.moveTo(x, 0);
        gridGraphics.lineTo(x, pixelHeight);
      }
      for (let y = 0; y <= pixelHeight; y += tileSize) {
        gridGraphics.moveTo(0, y);
        gridGraphics.lineTo(pixelWidth, y);
      }
      gridGraphics.stroke();
    }

    // Border - thicker line
    const borderLineWidth = Math.max(0.5, 2 / zoomScale);
    gridGraphics.setStrokeStyle({ width: borderLineWidth, color: 0x4a5568 });
    gridGraphics.rect(0, 0, pixelWidth, pixelHeight);
    gridGraphics.stroke();
  }, [viewport, projectTileSize]);

  // Render location links overlay
  const renderLocationLinks = useCallback(() => {
    const g = locationLinksGraphicsRef.current;
    const { currentMap, selectedAnchorId, selectedLinkId, maps } = useEditorStore.getState();
    const tileSize = projectTileSize;
    if (!g || !currentMap) return;

    g.clear();

    const navLayerVisible = currentMap.layers.some(
      (l) => l.kind === 'navigation' && l.visible !== false,
    );

    const links = navLayerVisible ? (currentMap.locationLinks ?? []) : [];

    for (const link of links) {
      const isSelected = link.id === selectedLinkId;
      const trigger = currentMap.spatialPrimitives?.triggers?.find((t) => t.id === link.triggerId);
      if (!trigger) continue;
      const [cx, cy] = getTriggerCenter(trigger);

      const { targetMap, anchor } = resolveLinkTarget(link, maps);
      const isSameMap = link.targetMapId === currentMap.id;
      const color = isSameMap ? 0xff4444 : 0x4fd1c5;
      const selectColor = 0xffffff;
      const lineColor = isSelected ? selectColor : color;

      if (isSameMap && anchor) {
        const [ax, ay] = anchor.position;
        const dx = ax - cx;
        const dy = ay - cy;
        const dist = Math.hypot(dx, dy);
        if (dist > 2) {
          const nx = dx / dist;
          const ny = dy / dist;
          const endX = ax - nx * Math.max(6, tileSize * 0.3);
          const endY = ay - ny * Math.max(6, tileSize * 0.3);
          g.moveTo(cx, cy);
          g.lineTo(endX, endY);
          g.stroke({
            width: isSelected ? 2 : 1,
            color: lineColor,
            alpha: isSelected ? 0.9 : 0.55,
          });

          const headLen = Math.max(6, tileSize * 0.25);
          const angle = Math.atan2(dy, dx);
          g.moveTo(endX, endY);
          g.lineTo(
            endX - headLen * Math.cos(angle - Math.PI / 5),
            endY - headLen * Math.sin(angle - Math.PI / 5),
          );
          g.moveTo(endX, endY);
          g.lineTo(
            endX - headLen * Math.cos(angle + Math.PI / 5),
            endY - headLen * Math.sin(angle + Math.PI / 5),
          );
          g.stroke({
            width: isSelected ? 2 : 1,
            color: lineColor,
            alpha: isSelected ? 0.9 : 0.55,
          });
        }

        const mx = (cx + ax) / 2;
        const my = (cy + ay) / 2;
        g.circle(mx, my, Math.max(4, tileSize * 0.18));
        g.fill({ color: lineColor, alpha: isSelected ? 0.95 : 0.7 });
        g.stroke({ width: 1, color: 0x111111, alpha: 0.6 });
      } else if (!isSameMap && targetMap) {
        const iconSize = tileSize * 0.45;
        const iconX = cx + iconSize * 0.6;
        const iconY = cy - iconSize * 0.6;
        const alpha = isSelected ? 0.95 : 0.65;
        g.moveTo(cx, cy);
        g.lineTo(iconX, iconY);
        g.stroke({ width: isSelected ? 2 : 1, color: lineColor, alpha });
        const headLen = iconSize * 0.5;
        const angle = Math.atan2(iconY - cy, iconX - cx);
        g.moveTo(iconX, iconY);
        g.lineTo(
          iconX - headLen * Math.cos(angle - Math.PI / 5),
          iconY - headLen * Math.sin(angle - Math.PI / 5),
        );
        g.moveTo(iconX, iconY);
        g.lineTo(
          iconX - headLen * Math.cos(angle + Math.PI / 5),
          iconY - headLen * Math.sin(angle + Math.PI / 5),
        );
        g.stroke({ width: isSelected ? 2 : 1, color: lineColor, alpha });

        g.circle(cx, cy, Math.max(4, tileSize * 0.2));
        g.fill({ color: lineColor, alpha: isSelected ? 0.9 : 0.6 });
        g.stroke({ width: 1, color: 0x111111, alpha: 0.5 });
      } else {
        g.circle(cx, cy, Math.max(4, tileSize * 0.2));
        g.fill({ color: 0xff4444, alpha: 0.6 });
        g.stroke({ width: 1, color: 0x111111, alpha: 0.5 });
      }
    }

    const anchors = navLayerVisible ? (currentMap.spatialPrimitives?.anchors ?? []) : [];
    for (const anchor of anchors) {
      const isSelected = anchor.id === selectedAnchorId;
      const [ax, ay] = anchor.position;
      const [fx, fy] = anchor.facing ?? [0, 1];
      const baseColor = 0xf6ad55;
      const selectedColor = 0xffffff;
      const markerSize = Math.max(5, Math.floor(tileSize * 0.3));

      g.circle(ax, ay, markerSize);
      g.fill({ color: isSelected ? selectedColor : baseColor, alpha: isSelected ? 0.95 : 0.85 });
      g.stroke({ width: 1, color: 0x111111, alpha: 0.7 });

      g.moveTo(ax - markerSize - 2, ay);
      g.lineTo(ax + markerSize + 2, ay);
      g.moveTo(ax, ay - markerSize - 2);
      g.lineTo(ax, ay + markerSize + 2);
      g.stroke({
        width: isSelected ? 2 : 1,
        color: isSelected ? selectedColor : baseColor,
        alpha: 0.7,
      });

      const facingLength = Math.max(12, tileSize * 0.8);
      const endX = ax + fx * facingLength;
      const endY = ay + fy * facingLength;
      const angle = Math.atan2(fy, fx);
      const headLength = Math.max(5, tileSize * 0.22);
      g.moveTo(ax, ay);
      g.lineTo(endX, endY);
      g.stroke({
        width: isSelected ? 2 : 1,
        color: isSelected ? selectedColor : baseColor,
        alpha: 0.8,
      });
      g.moveTo(endX, endY);
      g.lineTo(
        endX - headLength * Math.cos(angle - Math.PI / 6),
        endY - headLength * Math.sin(angle - Math.PI / 6),
      );
      g.moveTo(endX, endY);
      g.lineTo(
        endX - headLength * Math.cos(angle + Math.PI / 6),
        endY - headLength * Math.sin(angle + Math.PI / 6),
      );
      g.stroke({
        width: isSelected ? 2 : 1,
        color: isSelected ? selectedColor : baseColor,
        alpha: 0.8,
      });
    }

    // Highlight anchors targeted by cross-map incoming links with a subtle cyan ring
    if (navLayerVisible) {
      const incomingColor = 0x4fd1c5;
      const incomingAnchorIds = new Set<string>();
      for (const otherMap of maps) {
        if (otherMap.id === currentMap.id) continue;
        for (const inLink of otherMap.locationLinks ?? []) {
          if (inLink.targetMapId === currentMap.id && inLink.targetAnchorId) {
            incomingAnchorIds.add(inLink.targetAnchorId);
          }
        }
      }
      for (const anchor of currentMap.spatialPrimitives?.anchors ?? []) {
        if (!incomingAnchorIds.has(anchor.id)) continue;
        const [ax, ay] = anchor.position;
        g.circle(ax, ay, Math.max(10, tileSize * 0.55));
        g.stroke({ width: 1, color: incomingColor, alpha: 0.5 });
      }
    }
  }, [projectTileSize]);

  // Render hover highlight
  const renderHover = useCallback(() => {
    const hoverGraphics = hoverGraphicsRef.current;
    const {
      hoveredTile,
      activeTool,
      currentMap,
      selectedLayerId,
      selectedWaterBodyId,
      waterCursor,
      waterBrushRadius,
      waterFlowStrokeWidth,
    } = useEditorStore.getState();
    const tileSize = projectTileSize;
    if (!hoverGraphics) return;

    hoverGraphics.clear();

    // Water tools: the brush shows exactly the pixels the next dab will change, tinted with the
    // selected body's colour; flow tools show the stroke's reach.
    if (isWaterTool(activeTool)) {
      if (!waterCursor) return;
      if (isWaterPaintTool(activeTool)) {
        const reach = waterBrushRadius * waterBrushRadius + waterBrushRadius;
        for (let dy = -waterBrushRadius; dy <= waterBrushRadius; dy++) {
          for (let dx = -waterBrushRadius; dx <= waterBrushRadius; dx++) {
            if (dx * dx + dy * dy > reach) continue;
            hoverGraphics.rect(waterCursor.x + dx, waterCursor.y + dy, 1, 1);
          }
        }
        const layer = currentMap?.layers.find((candidate) => candidate.id === selectedLayerId);
        const value = waterBodyValue(layer?.waterBodies, selectedWaterBodyId);
        const brushColor = value > 0 ? waterBodyColor(value - 1) : 0xffffff;
        hoverGraphics.fill({
          color: activeTool === 'waterBrush' ? brushColor : 0xff6b6b,
          alpha: 0.6,
        });
      } else {
        hoverGraphics.circle(waterCursor.x + 0.5, waterCursor.y + 0.5, waterFlowStrokeWidth);
        hoverGraphics.stroke({ width: 1, color: 0xffffff, alpha: 0.6 });
      }
      return;
    }

    const selectedLayer = currentMap?.layers.find((layer) => layer.id === selectedLayerId);
    const isObjectLayer = selectedLayer?.kind === 'object';
    if (isObjectLayer) return;

    // No tile hover for tools that operate on objects rather than tiles
    const noTileHoverTools: readonly ToolType[] = [
      'anchorPlace',
      'objectSelect',
      'objectPlace',
      'objectDelete',
      'entitySelect',
      'entityPlace',
      'entityDelete',
      'linkPlace',
      'triggerPlace',
      'triggerPolygon',
      'collisionSelect',
      'collisionRect',
      'collisionPolygon',
      'collisionCircle',
    ];
    if (noTileHoverTools.includes(activeTool)) return;

    if (hoveredTile) {
      hoverGraphics.rect(hoveredTile.x * tileSize, hoveredTile.y * tileSize, tileSize, tileSize);
      hoverGraphics.fill({ color: 0xffffff, alpha: 0.15 });
    }
  }, [projectTileSize]);

  // Render tile preview
  const renderPreview = useCallback(() => {
    const previewContainer = previewContainerRef.current;
    const {
      activeTool,
      activeTilesetId,
      hoveredTile,
      hoveredWorldPosition,
      tilesets,
      currentMap,
      activeVariationId,
      selectedTileIndices,
      selectedTileIndex,
      drawPreview,
      drawMode,
      brushSize,
      sampledPattern,
      selectedTerrainId,
      terrainTypes,
      selectedObjectDefinitionId,
      selectedLayerId,
      entitySnapMode,
    } = useEditorStore.getState();
    const tileSize = projectTileSize;
    if (!previewContainer) return;

    previewContainer.removeChildren();
    previewContainer.alpha = 0.5;
    if (isWaterTool(activeTool)) return;

    const selectedLayer = currentMap?.layers.find((layer) => layer.id === selectedLayerId);
    const isObjectLayer = selectedLayer?.kind === 'object';

    if (
      activeTool === 'anchorPlace' ||
      activeTool === 'entityPlace' ||
      activeTool === 'entitySelect' ||
      activeTool === 'entityDelete' ||
      activeTool === 'objectSelect' ||
      activeTool === 'objectDelete'
    ) {
      return;
    }

    if (isObjectLayer) {
      previewContainer.alpha = 1;

      if (activeTool !== 'objectPlace') {
        return;
      }

      if (!currentMap || !activeTilesetId || !selectedObjectDefinitionId) {
        return;
      }

      const previewOrigins =
        drawPreview &&
        drawPreview.isDrawing &&
        drawPreview.mode !== 'select' &&
        drawPreview.start &&
        drawPreview.end &&
        drawMode !== 'point'
          ? collectObjectPlacementOrigins(
              drawMode as 'rect' | 'circle' | 'line',
              drawPreview.start,
              drawPreview.end,
              brushSize || 1,
              tilesets,
              activeTilesetId,
              selectedObjectDefinitionId,
            )
          : entitySnapMode === 'pixel'
            ? hoveredWorldPosition
              ? [{ x: hoveredWorldPosition.x, y: hoveredWorldPosition.y }]
              : []
            : hoveredTile
              ? [{ x: hoveredTile.x, y: hoveredTile.y }]
              : [];

      if (previewOrigins.length === 0) {
        return;
      }

      const ts = tilesets.get(activeTilesetId);
      const objectDefinition = ts?.objects?.find(
        (objectDefinition) => objectDefinition.id === selectedObjectDefinitionId,
      );
      if (!ts || !objectDefinition) return;

      let effectiveTileset = ts;
      const variation = currentMap.variations?.find((v) => v.id === activeVariationId);
      if (variation?.tilesetSuffix) {
        const suffixed = tilesets.get(`${activeTilesetId}${variation.tilesetSuffix}`);
        if (suffixed) effectiveTileset = suffixed;
      }

      for (const origin of previewOrigins) {
        const isPixelPointPreview = entitySnapMode === 'pixel' && drawMode === 'point';
        const placementOrigin = isPixelPointPreview
          ? getCenteredObjectPlacementPixelOrigin(
              tilesets,
              activeTilesetId,
              selectedObjectDefinitionId,
              origin.x,
              origin.y,
              tileSize,
            )
          : (() => {
              const tileOrigin = getCenteredObjectPlacementOrigin(
                tilesets,
                activeTilesetId,
                selectedObjectDefinitionId,
                origin.x,
                origin.y,
              );
              return {
                x: tileOrigin.x * tileSize,
                y: tileOrigin.y * tileSize,
              };
            })();

        for (const tile of objectDefinition.tiles) {
          const texture = getTileTexture(
            effectiveTileset.spriteSheet,
            tile.tileIndex,
            effectiveTileset.columns,
          );
          if (!texture) continue;
          const sprite = new Sprite(texture);
          const spriteX = placementOrigin.x + tile.x * tileSize;
          const spriteY = placementOrigin.y + tile.y * tileSize;
          sprite.x = spriteX;
          sprite.y = spriteY;
          sprite.width = tileSize;
          sprite.height = tileSize;
          sprite.alpha = isTileSpriteOutsideMap(
            spriteX,
            spriteY,
            tileSize,
            currentMap.width,
            currentMap.height,
          )
            ? OUT_OF_BOUNDS_OBJECT_ALPHA
            : 1;
          previewContainer.addChild(sprite);
        }
      }

      return;
    }

    // Erase tool preview - draw background color to show tiles will be removed
    if (activeTool === 'erase') {
      if (!hoveredTile) return;

      // Use dark background color for erase preview
      const bgColorNum = 0x1a1a2e;

      const effectiveBrushSize = drawMode === 'point' ? brushSize || 1 : 1;

      // Helper to render erase indicator at a position (just background color)
      const renderEraseAt = (tx: number, ty: number) => {
        const g = new Graphics();
        g.rect(tx * tileSize, ty * tileSize, tileSize, tileSize);
        g.fill({ color: bgColorNum, alpha: 1 });
        previewContainer.addChild(g);
      };

      // Helper to render brush erase
      const renderBrushErase = (cx: number, cy: number) => {
        if (effectiveBrushSize <= 1) {
          renderEraseAt(cx, cy);
        } else {
          const r = effectiveBrushSize - 1;
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist <= r) {
                renderEraseAt(cx + dx, cy + dy);
              }
            }
          }
        }
      };

      // If the user is actively drawing a shape with erase tool, show shape erase preview
      const isShiftLinePreviewErase = drawMode === 'point' && drawPreview?.isDrawing;
      const showShapePreviewErase =
        drawPreview &&
        drawPreview.isDrawing &&
        drawPreview.start &&
        drawPreview.end &&
        (drawMode !== 'point' || isShiftLinePreviewErase);

      if (showShapePreviewErase && drawPreview.start && drawPreview.end) {
        const effectiveEraseDrawMode = drawMode === 'point' ? 'line' : drawMode;
        const sx = drawPreview.start.x;
        const sy = drawPreview.start.y;
        const ex = drawPreview.end.x;
        const ey = drawPreview.end.y;

        if (effectiveEraseDrawMode === 'rect') {
          const minX = Math.min(sx, ex);
          const maxX = Math.max(sx, ex);
          const minY = Math.min(sy, ey);
          const maxY = Math.max(sy, ey);
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              renderEraseAt(x, y);
            }
          }
        } else if (effectiveEraseDrawMode === 'circle') {
          const radius = Math.sqrt(Math.pow(ex - sx, 2) + Math.pow(ey - sy, 2));
          const minX = Math.floor(sx - radius);
          const maxX = Math.ceil(sx + radius);
          const minY = Math.floor(sy - radius);
          const maxY = Math.ceil(sy + radius);
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              const dist = Math.sqrt(Math.pow(x - sx, 2) + Math.pow(y - sy, 2));
              if (dist <= radius) {
                renderEraseAt(x, y);
              }
            }
          }
        } else if (effectiveEraseDrawMode === 'line') {
          // Use shared Bresenham algorithm for erase with brush size
          for (const { x, y } of bresenhamLine(sx, sy, ex, ey)) {
            renderBrushErase(x, y);
          }
        }
      } else {
        // Hover preview with brush
        renderBrushErase(hoveredTile.x, hoveredTile.y);
      }
      return;
    }

    // Terrain tool preview - show colored brush area
    if (activeTool === 'terrain') {
      if (!hoveredTile) return;

      // Get terrain color from terrainTypes
      const terrain = terrainTypes.find((t) => t.id === selectedTerrainId);
      const terrainColor = terrain ? parseInt(terrain.color.replace('#', '0x'), 16) : 0x00ff00;

      const effectiveBrushSize = drawMode === 'point' || drawMode === 'line' ? brushSize || 1 : 1;

      // Helper to render terrain indicator at a position
      const renderTerrainAt = (tx: number, ty: number) => {
        const g = new Graphics();
        g.rect(tx * tileSize, ty * tileSize, tileSize, tileSize);
        g.fill({ color: terrainColor, alpha: 0.4 });
        g.stroke({ width: 1, color: terrainColor, alpha: 0.8 });
        previewContainer.addChild(g);
      };

      // Helper to render brush
      const renderBrushTerrain = (cx: number, cy: number) => {
        if (effectiveBrushSize <= 1) {
          renderTerrainAt(cx, cy);
        } else {
          const r = effectiveBrushSize - 1;
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist <= r) {
                renderTerrainAt(cx + dx, cy + dy);
              }
            }
          }
        }
      };

      // Check if drawing a shape
      const isShiftLinePreviewTerrain = drawMode === 'point' && drawPreview?.isDrawing;
      const showShapePreviewTerrain =
        drawPreview &&
        drawPreview.isDrawing &&
        drawPreview.start &&
        drawPreview.end &&
        (drawMode !== 'point' || isShiftLinePreviewTerrain);

      if (showShapePreviewTerrain && drawPreview.start && drawPreview.end) {
        const effectiveTerrainDrawMode = drawMode === 'point' ? 'line' : drawMode;
        const sx = drawPreview.start.x;
        const sy = drawPreview.start.y;
        const ex = drawPreview.end.x;
        const ey = drawPreview.end.y;

        if (effectiveTerrainDrawMode === 'rect') {
          const minX = Math.min(sx, ex);
          const maxX = Math.max(sx, ex);
          const minY = Math.min(sy, ey);
          const maxY = Math.max(sy, ey);
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              renderTerrainAt(x, y);
            }
          }
        } else if (effectiveTerrainDrawMode === 'circle') {
          const radius = Math.sqrt(Math.pow(ex - sx, 2) + Math.pow(ey - sy, 2));
          const minX = Math.floor(sx - radius);
          const maxX = Math.ceil(sx + radius);
          const minY = Math.floor(sy - radius);
          const maxY = Math.ceil(sy + radius);
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              const dist = Math.sqrt(Math.pow(x - sx, 2) + Math.pow(y - sy, 2));
              if (dist <= radius) {
                renderTerrainAt(x, y);
              }
            }
          }
        } else if (effectiveTerrainDrawMode === 'line') {
          // Use shared Bresenham algorithm with brush size
          for (const { x, y } of bresenhamLine(sx, sy, ex, ey)) {
            renderBrushTerrain(x, y);
          }
        }
      } else {
        // Hover preview with brush
        renderBrushTerrain(hoveredTile.x, hoveredTile.y);
      }
      return;
    }

    if ((activeTool !== 'stamp' && activeTool !== 'random') || !activeTilesetId) return;

    const ts = tilesets.get(activeTilesetId);
    if (!ts) return;

    let effectiveTileset = ts;
    const variation = currentMap?.variations?.find((v) => v.id === activeVariationId);
    if (variation?.tilesetSuffix) {
      const suffixed = tilesets.get(`${activeTilesetId}${variation.tilesetSuffix}`);
      if (suffixed) effectiveTileset = suffixed;
    }

    // If the user is right-click dragging to select tiles, show selection rectangle
    if (
      drawPreview &&
      drawPreview.isDrawing &&
      drawPreview.mode === 'select' &&
      drawPreview.start &&
      drawPreview.end
    ) {
      const sx = drawPreview.start.x;
      const sy = drawPreview.start.y;
      const ex = drawPreview.end.x;
      const ey = drawPreview.end.y;
      const minX = Math.min(sx, ex);
      const maxX = Math.max(sx, ex);
      const minY = Math.min(sy, ey);
      const maxY = Math.max(sy, ey);

      // Draw selection rectangle outline
      const g = new Graphics();
      g.rect(
        minX * tileSize,
        minY * tileSize,
        (maxX - minX + 1) * tileSize,
        (maxY - minY + 1) * tileSize,
      );
      g.fill({ color: 0x4488ff, alpha: 0.2 });
      g.stroke({ width: 2, color: 0x4488ff, alpha: 0.8 });
      previewContainer.addChild(g);
      return; // Don't show stamp preview when selecting
    }

    // If the user is actively drawing a shape, render the shape preview
    // For point mode with shift held, we show a line preview
    const isShiftLinePreview =
      drawMode === 'point' && drawPreview?.isDrawing && drawPreview?.mode !== 'select';
    const showShapePreview =
      drawPreview &&
      drawPreview.isDrawing &&
      drawPreview.mode !== 'select' &&
      drawPreview.start &&
      drawPreview.end &&
      (drawMode !== 'point' || isShiftLinePreview);

    if (showShapePreview && drawPreview.start && drawPreview.end) {
      // Determine effective draw mode for preview (point mode with shift shows as line)
      const effectiveDrawMode = drawMode === 'point' ? 'line' : drawMode;
      // For random tool, skip pattern - sample randomly per tile position
      const patternData: TilePattern | null =
        activeTool === 'random'
          ? null
          : selectedTileIndices && selectedTileIndices.length > 0
            ? buildPatternFromSelection(selectedTileIndices, effectiveTileset)
            : null;

      // Use cursor end position as seed so preview changes when cursor moves
      const cursorSeed = drawPreview.end.x * 1000 + drawPreview.end.y;

      // Sample a random tile from selection using probability weights
      const sampleTileForPreview = (x: number, y: number): number | null => {
        if (!selectedTileIndices || selectedTileIndices.length === 0) {
          return selectedTileIndex;
        }
        return sampleSeededTile(x, y, selectedTileIndices, effectiveTileset, cursorSeed);
      };

      const sx = drawPreview.start.x;
      const sy = drawPreview.start.y;
      const ex = drawPreview.end.x;
      const ey = drawPreview.end.y;

      if (effectiveDrawMode === 'rect') {
        const minX = Math.min(sx, ex);
        const maxX = Math.max(sx, ex);
        const minY = Math.min(sy, ey);
        const maxY = Math.max(sy, ey);

        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            let tileIdx: number | null = null;
            if (activeTool === 'random') {
              // For random tool, sample a random tile for each position
              tileIdx = sampleTileForPreview(x, y);
            } else if (patternData) {
              const dx = x - sx;
              const dy = y - sy;
              const px =
                ((dx % patternData.patternW) + patternData.patternW) % patternData.patternW;
              const py =
                ((dy % patternData.patternH) + patternData.patternH) % patternData.patternH;
              tileIdx = patternData.pattern[py][px];
            } else if (selectedTileIndex !== null) {
              tileIdx = selectedTileIndex;
            }

            if (tileIdx !== null && tileIdx !== undefined) {
              const texture = getTileTexture(
                effectiveTileset.spriteSheet,
                tileIdx,
                effectiveTileset.columns,
              );
              if (texture) {
                const sprite = new Sprite(texture);
                sprite.x = x * tileSize;
                sprite.y = y * tileSize;
                sprite.width = tileSize;
                sprite.height = tileSize;
                previewContainer.addChild(sprite);
              }
            }
          }
        }
      } else if (effectiveDrawMode === 'circle') {
        const radius = Math.sqrt(Math.pow(ex - sx, 2) + Math.pow(ey - sy, 2));
        const minX = Math.floor(sx - radius);
        const maxX = Math.ceil(sx + radius);
        const minY = Math.floor(sy - radius);
        const maxY = Math.ceil(sy + radius);

        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const dist = Math.sqrt(Math.pow(x - sx, 2) + Math.pow(y - sy, 2));
            if (dist <= radius) {
              let tileIdx: number | null = null;
              if (activeTool === 'random') {
                // For random tool, sample a random tile for each position
                tileIdx = sampleTileForPreview(x, y);
              } else if (patternData) {
                const dx = x - sx;
                const dy = y - sy;
                const px =
                  ((dx % patternData.patternW) + patternData.patternW) % patternData.patternW;
                const py =
                  ((dy % patternData.patternH) + patternData.patternH) % patternData.patternH;
                tileIdx = patternData.pattern[py][px];
              } else if (selectedTileIndex !== null) {
                tileIdx = selectedTileIndex;
              }

              if (tileIdx !== null && tileIdx !== undefined) {
                const texture = getTileTexture(
                  effectiveTileset.spriteSheet,
                  tileIdx,
                  effectiveTileset.columns,
                );
                if (texture) {
                  const sprite = new Sprite(texture);
                  sprite.x = x * tileSize;
                  sprite.y = y * tileSize;
                  sprite.width = tileSize;
                  sprite.height = tileSize;
                  previewContainer.addChild(sprite);
                }
              }
            }
          }
        }
      } else if (effectiveDrawMode === 'line') {
        // Get effective brush size for line preview
        // NOTE: brush size only applies when NOT using a multi-tile pattern (to match drawing behavior)
        const hasPattern = patternData && patternData.patternW > 0 && patternData.patternH > 0;
        const effectiveBrushSize = hasPattern ? 1 : brushSize || 1;

        // Helper to render tiles at a line position (either brush circle or stencil pattern)
        const renderAtLinePos = (cx: number, cy: number) => {
          if (hasPattern && patternData) {
            // For stencil pattern: place pattern once at position (no brush)
            for (let py = 0; py < patternData.patternH; py++) {
              for (let px = 0; px < patternData.patternW; px++) {
                const tileIdx = patternData.pattern[py][px];
                if (tileIdx !== null) {
                  const tx = cx + px,
                    ty = cy + py;
                  const texture = getTileTexture(
                    effectiveTileset.spriteSheet,
                    tileIdx,
                    effectiveTileset.columns,
                  );
                  if (texture) {
                    const sprite = new Sprite(texture);
                    sprite.x = tx * tileSize;
                    sprite.y = ty * tileSize;
                    sprite.width = tileSize;
                    sprite.height = tileSize;
                    previewContainer.addChild(sprite);
                  }
                }
              }
            }
          } else if (effectiveBrushSize <= 1) {
            // Single tile (no brush)
            let tileIdx: number | null = null;
            if (activeTool === 'random') {
              tileIdx = sampleTileForPreview(cx, cy);
            } else if (selectedTileIndex !== null) {
              tileIdx = selectedTileIndex;
            }

            if (tileIdx !== null && tileIdx !== undefined) {
              const texture = getTileTexture(
                effectiveTileset.spriteSheet,
                tileIdx,
                effectiveTileset.columns,
              );
              if (texture) {
                const sprite = new Sprite(texture);
                sprite.x = cx * tileSize;
                sprite.y = cy * tileSize;
                sprite.width = tileSize;
                sprite.height = tileSize;
                previewContainer.addChild(sprite);
              }
            }
          } else {
            // Circular brush of single/random tiles using shared utility
            for (const { x: bx, y: by } of circularBrush(cx, cy, effectiveBrushSize)) {
              let tileIdx: number | null = null;
              if (activeTool === 'random') {
                tileIdx = sampleTileForPreview(bx, by);
              } else if (selectedTileIndex !== null) {
                tileIdx = selectedTileIndex;
              }

              if (tileIdx !== null && tileIdx !== undefined) {
                const texture = getTileTexture(
                  effectiveTileset.spriteSheet,
                  tileIdx,
                  effectiveTileset.columns,
                );
                if (texture) {
                  const sprite = new Sprite(texture);
                  sprite.x = bx * tileSize;
                  sprite.y = by * tileSize;
                  sprite.width = tileSize;
                  sprite.height = tileSize;
                  previewContainer.addChild(sprite);
                }
              }
            }
          }
        };

        // Use shared Bresenham algorithm for preview
        for (const { x, y } of bresenhamLine(sx, sy, ex, ey)) {
          renderAtLinePos(x, y);
        }
      }

      return;
    }

    // Default hover preview (single tile or multi-tile stencil)
    if (!hoveredTile) return;

    // Brush size only applies to point mode
    const effectiveBrushSize = drawMode === 'point' ? brushSize || 1 : 1;

    // Helper to render a tile at a position
    const renderTileAt = (tx: number, ty: number, tileIdx: number) => {
      const texture = getTileTexture(
        effectiveTileset.spriteSheet,
        tileIdx,
        effectiveTileset.columns,
      );
      if (texture) {
        const sprite = new Sprite(texture);
        sprite.x = tx * tileSize;
        sprite.y = ty * tileSize;
        sprite.width = tileSize;
        sprite.height = tileSize;
        previewContainer.addChild(sprite);
      }
    };

    // Helper to render brush at hover position using shared utility
    const renderBrushPreview = (getTileIdxForPos: (x: number, y: number) => number | null) => {
      for (const { x: bx, y: by } of circularBrush(
        hoveredTile.x,
        hoveredTile.y,
        effectiveBrushSize,
      )) {
        const idx = getTileIdxForPos(bx, by);
        if (idx !== null) renderTileAt(bx, by, idx);
      }
    };

    // For random tool, sample a random tile for the hover preview
    if (activeTool === 'random') {
      if (!selectedTileIndices || selectedTileIndices.length === 0) {
        if (selectedTileIndex !== null && selectedTileIndex !== undefined) {
          renderBrushPreview(() => selectedTileIndex);
        }
        return;
      }

      // Use shared seeded random for stable preview per position
      const sampleTileForPos = (x: number, y: number): number | null => {
        return sampleSeededTile(x, y, selectedTileIndices, effectiveTileset, 0);
      };

      renderBrushPreview(sampleTileForPos);
      return;
    }

    // Priority 1: Use sampled pattern (from right-click copy)
    if (sampledPattern && sampledPattern.tilesetId === activeTilesetId) {
      for (let py = 0; py < sampledPattern.height; py++) {
        for (let px = 0; px < sampledPattern.width; px++) {
          const tileIdx = sampledPattern.pattern[py][px];
          if (tileIdx !== null) {
            renderTileAt(hoveredTile.x + px, hoveredTile.y + py, tileIdx);
          }
        }
      }
      return;
    }

    // Priority 2: Multi-tile stencil from tileset selection (2+ tiles)
    if (selectedTileIndices && selectedTileIndices.length > 1) {
      // Multi-tile stencil preview (no brush size for multi-tile)
      const patternData = buildPatternFromSelection(selectedTileIndices, effectiveTileset);
      if (patternData) {
        for (let py = 0; py < patternData.patternH; py++) {
          for (let px = 0; px < patternData.patternW; px++) {
            const tileIdx = patternData.pattern[py][px];
            if (tileIdx !== null) {
              renderTileAt(hoveredTile.x + px, hoveredTile.y + py, tileIdx);
            }
          }
        }
      }
    } else if (selectedTileIndex !== null) {
      // Single tile preview with brush size
      renderBrushPreview(() => selectedTileIndex);
    }
  }, [getTileTexture, projectTileSize]);

  // Render collision shape primitives overlay
  const renderCollisionShapes = useCallback(() => {
    const g = collisionShapesGraphicsRef.current;
    const {
      currentMap,
      selectedCollisionId,
      activeTool,
      drawPreview,
      polygonPreviewPoints,
      showCollisionOverlay,
    } = useEditorStore.getState();
    if (!g) return;
    g.clear();
    if (!currentMap) return;

    const collisionLayer = currentMap.layers.find((l) => l.kind === 'collision');
    if (!collisionLayer?.visible && !showCollisionOverlay) return;

    const tileSize = projectTileSize;
    const SHAPE_COLOR = 0xff6600;
    const HANDLE_SIZE = 6;

    // ── Placement previews ─────────────────────────────────────────────────
    if (
      activeTool === 'collisionRect' &&
      drawPreview?.isDrawing &&
      drawPreview.start &&
      drawPreview.end
    ) {
      const sx = drawPreview.start.x * tileSize;
      const sy = drawPreview.start.y * tileSize;
      const ex = drawPreview.end.x * tileSize;
      const ey = drawPreview.end.y * tileSize;
      const px = Math.min(sx, ex);
      const py = Math.min(sy, ey);
      const pw = Math.abs(ex - sx);
      const ph = Math.abs(ey - sy);
      g.rect(px, py, pw, ph);
      g.fill({ color: SHAPE_COLOR, alpha: 0.2 });
      g.rect(px, py, pw, ph);
      g.stroke({ width: 2, color: SHAPE_COLOR, alpha: 0.8 });
    }

    if (
      activeTool === 'collisionCircle' &&
      drawPreview?.isDrawing &&
      drawPreview.start &&
      drawPreview.end
    ) {
      const cx = drawPreview.start.x * tileSize;
      const cy = drawPreview.start.y * tileSize;
      const ex = drawPreview.end.x * tileSize;
      const ey = drawPreview.end.y * tileSize;
      const radius = Math.hypot(ex - cx, ey - cy);
      if (radius > 0) {
        g.circle(cx, cy, radius);
        g.fill({ color: SHAPE_COLOR, alpha: 0.2 });
        g.circle(cx, cy, radius);
        g.stroke({ width: 2, color: SHAPE_COLOR, alpha: 0.8 });
      }
      g.circle(cx, cy, 3);
      g.fill({ color: SHAPE_COLOR, alpha: 0.9 });
      g.moveTo(cx, cy);
      g.lineTo(ex, ey);
      g.stroke({ width: 1, color: SHAPE_COLOR, alpha: 0.5 });
    }

    if (
      activeTool === 'collisionPolygon' &&
      polygonPreviewPoints &&
      polygonPreviewPoints.length >= 1
    ) {
      const pts = polygonPreviewPoints;
      const CLOSE_DIST = tileSize * 0.75;
      if (pts.length >= 2) {
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.stroke({ width: 2, color: SHAPE_COLOR, alpha: 0.7 });
      }
      for (let i = 0; i < pts.length; i++) {
        const isFirst = i === 0;
        g.circle(pts[i][0], pts[i][1], isFirst && pts.length >= 3 ? 5 : 3);
        g.fill({ color: isFirst ? 0xffd700 : SHAPE_COLOR, alpha: 0.9 });
        if (isFirst && pts.length >= 3) {
          g.circle(pts[0][0], pts[0][1], CLOSE_DIST);
          g.stroke({ width: 1, color: 0xffd700, alpha: 0.3 });
        }
      }
    }

    // ── Committed shapes ───────────────────────────────────────────────────
    const collisions = currentMap.spatialPrimitives?.collisions ?? [];
    for (const col of collisions) {
      const isSelected = col.id === selectedCollisionId;
      const alpha = isSelected ? 0.25 : 0.12;
      const strokeAlpha = isSelected ? 0.9 : 0.5;
      const strokeWidth = isSelected ? 2 : 1;

      if (col.shape === 'rectangle' && col.size) {
        const [rx, ry] = col.position;
        const [rw, rh] = col.size;
        g.rect(rx, ry, rw, rh);
        g.fill({ color: SHAPE_COLOR, alpha });
        g.rect(rx, ry, rw, rh);
        g.stroke({ width: strokeWidth, color: SHAPE_COLOR, alpha: strokeAlpha });
        g.circle(rx + rw / 2, ry + rh / 2, 3);
        g.fill({ color: SHAPE_COLOR, alpha: 0.8 });
        if (isSelected) {
          const handlePositions = [
            [rx - HANDLE_SIZE, ry - HANDLE_SIZE],
            [rx + rw, ry - HANDLE_SIZE],
            [rx - HANDLE_SIZE, ry + rh],
            [rx + rw, ry + rh],
            [rx - HANDLE_SIZE, ry + rh / 2 - HANDLE_SIZE / 2],
            [rx + rw, ry + rh / 2 - HANDLE_SIZE / 2],
            [rx + rw / 2 - HANDLE_SIZE / 2, ry - HANDLE_SIZE],
            [rx + rw / 2 - HANDLE_SIZE / 2, ry + rh],
          ];
          for (const [hx, hy] of handlePositions) {
            g.rect(hx, hy, HANDLE_SIZE, HANDLE_SIZE);
            g.fill({ color: 0xffffff, alpha: 0.9 });
            g.stroke({ width: 1, color: 0x000000, alpha: 0.4 });
          }
        }
      } else if (col.shape === 'circle' && col.radius !== undefined) {
        const [cx, cy] = col.position;
        const r = col.radius;
        g.circle(cx, cy, r);
        g.fill({ color: SHAPE_COLOR, alpha });
        g.circle(cx, cy, r);
        g.stroke({ width: strokeWidth, color: SHAPE_COLOR, alpha: strokeAlpha });
        g.moveTo(cx - 3, cy);
        g.lineTo(cx + 3, cy);
        g.moveTo(cx, cy - 3);
        g.lineTo(cx, cy + 3);
        g.stroke({ width: 1, color: SHAPE_COLOR, alpha: 0.7 });
        if (isSelected) {
          g.rect(cx + r, cy - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
          g.fill({ color: 0xffffff, alpha: 0.9 });
          g.stroke({ width: 1, color: 0x000000, alpha: 0.4 });
          g.moveTo(cx, cy);
          g.lineTo(cx + r, cy);
          g.stroke({ width: 1, color: SHAPE_COLOR, alpha: 0.4 });
        }
      } else if (col.shape === 'polygon' && col.points && col.points.length >= 3) {
        const pts = col.points;
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.closePath();
        g.fill({ color: SHAPE_COLOR, alpha });
        g.stroke({ width: strokeWidth, color: SHAPE_COLOR, alpha: strokeAlpha });
        if (isSelected) {
          for (const [px, py] of pts) {
            g.circle(px, py, HANDLE_SIZE / 2 + 1);
            g.fill({ color: 0xffffff, alpha: 0.9 });
            g.stroke({ width: 1, color: 0x000000, alpha: 0.4 });
          }
        }
      }
    }
  }, [projectTileSize]);

  // Render trigger zones overlay
  const renderTriggers = useCallback(() => {
    const g = triggerGraphicsRef.current;
    const { currentMap, selectedTriggerId, activeTool, drawPreview, polygonPreviewPoints } =
      useEditorStore.getState();
    if (!g) return;
    g.clear();
    if (!currentMap) return;

    const navLayer = currentMap.layers.find((l) => l.kind === 'navigation');
    if (!navLayer?.visible) return;

    const tileSize = projectTileSize;

    // Draw placement preview while dragging to place a new rectangle trigger
    if (
      activeTool === 'triggerPlace' &&
      drawPreview?.isDrawing &&
      drawPreview.start &&
      drawPreview.end
    ) {
      const sx = drawPreview.start.x * tileSize;
      const sy = drawPreview.start.y * tileSize;
      const ex = (drawPreview.end.x + 1) * tileSize;
      const ey = (drawPreview.end.y + 1) * tileSize;
      const px = Math.min(sx, ex);
      const py = Math.min(sy, ey);
      const pw = Math.abs(ex - sx);
      const ph = Math.abs(ey - sy);
      g.rect(px, py, pw, ph);
      g.fill({ color: 0xa855f7, alpha: 0.2 });
      g.rect(px, py, pw, ph);
      g.stroke({ width: 2, color: 0xa855f7, alpha: 0.8 });
    }

    // Draw WIP polygon while in pen mode
    if (
      activeTool === 'triggerPolygon' &&
      polygonPreviewPoints &&
      polygonPreviewPoints.length >= 1
    ) {
      const pts = polygonPreviewPoints;
      const CLOSE_DIST = tileSize * 0.75;

      // Draw edges so far
      if (pts.length >= 2) {
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.stroke({ width: 2, color: 0xa855f7, alpha: 0.7 });
      }

      // Draw vertex dots
      for (let i = 0; i < pts.length; i++) {
        const isFirst = i === 0;
        g.circle(pts[i][0], pts[i][1], isFirst && pts.length >= 3 ? 5 : 3);
        g.fill({ color: isFirst ? 0x22d3ee : 0xa855f7, alpha: 0.9 });
        if (isFirst && pts.length >= 3) {
          // Show close-zone ring
          g.circle(pts[0][0], pts[0][1], CLOSE_DIST);
          g.stroke({ width: 1, color: 0x22d3ee, alpha: 0.3 });
        }
      }
    }

    const triggers = currentMap.spatialPrimitives?.triggers ?? [];
    const HANDLE_SIZE = 6;

    const linkMode = activeTool === 'linkPlace';
    for (const trigger of triggers) {
      const isSelected = trigger.id === selectedTriggerId;
      const color = linkMode ? 0x22d3ee : 0xa855f7; // cyan when picking link source, purple otherwise
      const alpha = linkMode ? 0.28 : isSelected ? 0.25 : 0.12;
      const strokeAlpha = linkMode ? 1.0 : isSelected ? 0.9 : 0.5;
      const strokeWidth = linkMode ? 3 : isSelected ? 2 : 1;

      if (trigger.shape === 'rectangle' && trigger.size) {
        const [tx, ty] = trigger.position;
        const [tw, th] = trigger.size;

        // Fill
        g.rect(tx, ty, tw, th);
        g.fill({ color, alpha });

        // Stroke
        g.rect(tx, ty, tw, th);
        g.stroke({ width: strokeWidth, color, alpha: strokeAlpha });

        // Label
        const cx = tx + tw / 2;
        const cy = ty + th / 2;

        // Center dot
        g.circle(cx, cy, 3);
        g.fill({ color, alpha: 0.8 });

        // Resize handles (selected only)
        if (isSelected) {
          const handlePositions = [
            [tx - HANDLE_SIZE, ty - HANDLE_SIZE],
            [tx + tw, ty - HANDLE_SIZE],
            [tx - HANDLE_SIZE, ty + th],
            [tx + tw, ty + th],
            [tx - HANDLE_SIZE, ty + th / 2 - HANDLE_SIZE / 2],
            [tx + tw, ty + th / 2 - HANDLE_SIZE / 2],
            [tx + tw / 2 - HANDLE_SIZE / 2, ty - HANDLE_SIZE],
            [tx + tw / 2 - HANDLE_SIZE / 2, ty + th],
          ];
          for (const [hx, hy] of handlePositions) {
            g.rect(hx, hy, HANDLE_SIZE, HANDLE_SIZE);
            g.fill({ color: 0xffffff, alpha: 0.9 });
            g.stroke({ width: 1, color: 0x000000, alpha: 0.4 });
          }
        }
      } else if (trigger.shape === 'polygon' && trigger.points && trigger.points.length >= 3) {
        const pts = trigger.points;
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.closePath();
        g.fill({ color, alpha });
        g.stroke({ width: strokeWidth, color, alpha: strokeAlpha });

        // Vertex handles (selected only)
        if (isSelected) {
          for (const [px, py] of pts) {
            g.circle(px, py, HANDLE_SIZE / 2 + 1);
            g.fill({ color: 0xffffff, alpha: 0.9 });
            g.stroke({ width: 1, color: 0x000000, alpha: 0.4 });
          }
        }
      }
    }
  }, [projectTileSize]);

  // Main render function
  const render = useCallback(() => {
    renderWater();
    renderWaterFlow();
    renderTiles();
    renderEntities();
    renderGrid();
    renderCollisionOverlay();
    renderTerrainOverlay();
    renderCollisionShapes();
    renderTriggers();
    renderLocationLinks();
    renderHover();
    renderPreview();
  }, [
    renderWater,
    renderWaterFlow,
    renderTiles,
    renderEntities,
    renderGrid,
    renderCollisionOverlay,
    renderTerrainOverlay,
    renderCollisionShapes,
    renderTriggers,
    renderLocationLinks,
    renderHover,
    renderPreview,
  ]);

  return {
    render,
    renderWater,
    renderWaterFlow,
    renderTiles,
    renderEntities,
    renderGrid,
    renderCollisionOverlay,
    renderTerrainOverlay,
    renderCollisionShapes,
    renderTriggers,
    renderLocationLinks,
    renderHover,
    renderPreview,
  };
}
