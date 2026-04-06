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
import type { Map as GameMap, Tileset } from '../../../types/schema';

interface UseMapRendererProps {
  viewport: Viewport | null;
}

type OverlayPoint = { x: number; y: number };
type OverlaySegment = { a: OverlayPoint; b: OverlayPoint };

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
      if (!layer.visible || layer.kind !== 'visual') return;

      for (let y = 0; y < currentMap.height; y++) {
        for (let x = 0; x < currentMap.width; x++) {
          const tileRef = resolveTileAt(currentMap, layer.id, x, y, activeVariationId);
          if (!tileRef) continue;

          const [tsId, indexStr] = tileRef.split(':');
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
  const locationLinksGraphicsRef = useRef<Graphics | null>(null);
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

    // Capture ref value for cleanup
    const cache = textureCache.current;

    return () => {
      viewport.removeChild(container);
      container.destroy({ children: true });
      cache.clear();
    };
  }, [viewport]);

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
        if (!layer.visible || (layer.kind !== 'visual' && layer.kind !== 'terrain')) return;

        for (let y = 0; y < currentMap.height; y++) {
          for (let x = 0; x < currentMap.width; x++) {
            const tileRef = resolveTileAt(currentMap, layer.id, x, y, activeVariationId);
            if (!tileRef) continue;

            const [tsId, indexStr] = tileRef.split(':');
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
    const { currentMap, activeVariationId, tilesets } = useEditorStore.getState();
    const tileSize = projectTileSize;
    if (!tileContainer || !currentMap) return;

    const effectiveMap = resolveMapContext(currentMap, activeVariationId);

    tileContainer.removeChildren();

    [...currentMap.layers]
      .sort((a, b) => a.zOrder - b.zOrder)
      .forEach((layer) => {
        if (!layer.visible || (layer.kind !== 'visual' && layer.kind !== 'terrain')) return;

        for (let y = 0; y < currentMap.height; y++) {
          for (let x = 0; x < currentMap.width; x++) {
            const tileRef = resolveTileAt(currentMap, layer.id, x, y, activeVariationId);
            if (!tileRef) continue;

            const [tsId, indexStr] = tileRef.split(':');
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

    const resolvedEntities = resolveEntities(currentMap, activeVariationId);
    resolvedEntities.forEach((entity) => {
      const type = entityTypes.find((t) => t.id === entity.typeId);
      const [ew, eh] = type?.defaultSize ?? [tileSize, tileSize];
      const colorHex = type?.placeholderColor || '#ffff00';
      const color = parseInt(colorHex.replace('#', ''), 16);

      const ex = entity.position[0];
      const ey = entity.position[1];

      // Render body: sprite if loaded, else colored rect
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
        const g = new Graphics();
        g.rect(ex, ey, ew, eh);
        g.fill({ color, alpha: 0.6 });
        entityContainer.addChild(g);
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
    const { currentMap } = useEditorStore.getState();
    const tileSize = projectTileSize;
    if (!gridGraphics || !currentMap) return;

    gridGraphics.clear();

    const pixelWidth = currentMap.width * tileSize;
    const pixelHeight = currentMap.height * tileSize;
    // Grid lines - draw each line individually with stroke
    // Make stroke thinner when zoomed in by adjusting width inversely to viewport scale
    const vp = viewport;
    const zoomScale = vp?.scale?.x ?? 1;
    const gridLineWidth = Math.max(0.25, 1 / zoomScale);
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

    // Border - thicker line
    const borderLineWidth = Math.max(0.5, 2 / zoomScale);
    gridGraphics.setStrokeStyle({ width: borderLineWidth, color: 0x4a5568 });
    gridGraphics.rect(0, 0, pixelWidth, pixelHeight);
    gridGraphics.stroke();
  }, [viewport, projectTileSize]);

  // Render location links overlay
  const renderLocationLinks = useCallback(() => {
    const g = locationLinksGraphicsRef.current;
    const { currentMap, selectedLinkId, hoveredTile, maps } = useEditorStore.getState();
    const tileSize = projectTileSize;
    if (!g || !currentMap) return;

    g.clear();

    const links = currentMap.locationLinks ?? [];
    if (links.length === 0) return;

    for (const link of links) {
      const [sx, sy] = link.sourcePosition;
      const [tw, th] = link.triggerSize;
      const isSameMap = !link.targetMapId || link.targetMapId === currentMap.id;
      const isSelected = link.id === selectedLinkId;

      // Hovered: cursor is within this link's trigger area
      const isHovered =
        hoveredTile !== null &&
        hoveredTile.x >= sx &&
        hoveredTile.x < sx + tw &&
        hoveredTile.y >= sy &&
        hoveredTile.y < sy + th;

      // Color: red = same-map, cyan = cross-map
      const color = isSameMap ? 0xff4444 : 0x4fd1c5;
      const darkColor = isSameMap ? 0x3a1010 : 0x1a4a44;
      const selectColor = 0xffffff;

      const px = sx * tileSize;
      const py = sy * tileSize;
      const pw = tw * tileSize;
      const ph = th * tileSize;

      // Trigger area fill
      g.rect(px, py, pw, ph);
      g.fill({ color: isSelected ? 0x2a1a3a : darkColor, alpha: isSelected ? 0.55 : 0.35 });

      // Trigger area border — white when selected, colored otherwise
      g.rect(px, py, pw, ph);
      g.stroke({
        width: isSelected ? 2 : isHovered ? 1.5 : 1,
        color: isSelected ? selectColor : color,
        alpha: isSelected ? 1 : isHovered ? 0.95 : 0.75,
      });

      const cx = px + pw / 2;
      const cy = py + ph / 2;

      // Same-map: draw arrow all the way to target tile + target indicator
      if (isSameMap) {
        const [ttx, tty] = link.targetPosition;
        const targetCx = ttx * tileSize + tileSize / 2;
        const targetCy = tty * tileSize + tileSize / 2;
        const dx = targetCx - cx;
        const dy = targetCy - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > tileSize * 0.5) {
          const arrowAlpha = isSelected ? 0.7 : 0.35;
          const arrowColor = isSelected ? selectColor : color;
          const arrowWidth = isSelected ? 1.5 : 1;

          // Shorten slightly so the line ends at the border of target tile, not center
          const nx = dx / dist;
          const ny = dy / dist;
          const endX = targetCx - nx * (tileSize * 0.5);
          const endY = targetCy - ny * (tileSize * 0.5);

          g.moveTo(cx, cy);
          g.lineTo(endX, endY);
          g.stroke({ width: arrowWidth, color: arrowColor, alpha: arrowAlpha });

          // Arrowhead at end
          const headLen = tileSize * 0.35;
          const headAngle = Math.PI / 5;
          const angle = Math.atan2(dy, dx);
          g.moveTo(endX, endY);
          g.lineTo(
            endX - headLen * Math.cos(angle - headAngle),
            endY - headLen * Math.sin(angle - headAngle),
          );
          g.moveTo(endX, endY);
          g.lineTo(
            endX - headLen * Math.cos(angle + headAngle),
            endY - headLen * Math.sin(angle + headAngle),
          );
          g.stroke({ width: arrowWidth, color: arrowColor, alpha: arrowAlpha });
        }

        // Target tile box
        const tpx = ttx * tileSize;
        const tpy = tty * tileSize;
        g.rect(tpx + 1, tpy + 1, tileSize - 2, tileSize - 2);
        g.stroke({ width: 1, color, alpha: isSelected ? 0.6 : 0.3 });
      }
      // Cross-map: no arrow — just a small exit icon (diagonal arrow at corner of trigger box)
      else {
        const iconSize = Math.min(pw, ph, tileSize) * 0.4;
        const iconX = px + pw - iconSize * 0.3;
        const iconY = py + iconSize * 0.3;
        const alpha = isSelected ? 0.9 : 0.5;
        // Small ↗ arrow in top-right corner of trigger
        g.moveTo(iconX - iconSize, iconY + iconSize);
        g.lineTo(iconX, iconY);
        g.stroke({ width: isSelected ? 1.5 : 1, color, alpha });
        g.moveTo(iconX, iconY);
        g.lineTo(iconX - iconSize * 0.55, iconY);
        g.moveTo(iconX, iconY);
        g.lineTo(iconX, iconY + iconSize * 0.55);
        g.stroke({ width: isSelected ? 1.5 : 1, color, alpha });
      }

      // Bidirectional dot at center
      if (link.direction === 'bidirectional') {
        g.circle(cx, cy, 3);
        g.fill({ color: isSelected ? selectColor : color, alpha: isSelected ? 0.9 : 0.5 });
      }
    }

    // ── Incoming link targets ─────────────────────────────────────────────
    // Draw a dashed arrival indicator for every link on another map that targets this map.
    const incomingColor = 0x4fd1c5; // cyan — always external
    for (const otherMap of maps) {
      if (otherMap.id === currentMap.id) continue;
      for (const inLink of otherMap.locationLinks ?? []) {
        if (inLink.targetMapId !== currentMap.id) continue;

        const [tx, ty] = inLink.targetPosition;
        const ipx = tx * tileSize;
        const ipy = ty * tileSize;

        // Dashed border (simulate with 8 short segments around the tile)
        const dash = tileSize / 6;
        const gap = dash;
        const corners = [
          [ipx, ipy, ipx + tileSize, ipy], // top
          [ipx + tileSize, ipy, ipx + tileSize, ipy + tileSize], // right
          [ipx + tileSize, ipy + tileSize, ipx, ipy + tileSize], // bottom
          [ipx, ipy + tileSize, ipx, ipy], // left
        ];
        for (const [x1, y1, x2, y2] of corners) {
          const len = Math.hypot(x2 - x1, y2 - y1);
          const nx = (x2 - x1) / len;
          const ny = (y2 - y1) / len;
          let d = 0;
          let drawing = true;
          while (d < len) {
            const segEnd = Math.min(d + (drawing ? dash : gap), len);
            if (drawing) {
              g.moveTo(x1 + nx * d, y1 + ny * d);
              g.lineTo(x1 + nx * segEnd, y1 + ny * segEnd);
              g.stroke({ width: 1, color: incomingColor, alpha: 0.6 });
            }
            d = segEnd;
            drawing = !drawing;
          }
        }

        // Arrival arrow (↓ pointing into the tile from above)
        const acx = ipx + tileSize / 2;
        const acy = ipy + tileSize * 0.25;
        const arrowH = tileSize * 0.35;
        g.moveTo(acx, ipy);
        g.lineTo(acx, acy);
        g.stroke({ width: 1, color: incomingColor, alpha: 0.5 });
        const headW = tileSize * 0.2;
        g.moveTo(acx, acy);
        g.lineTo(acx - headW, acy - arrowH * 0.5);
        g.moveTo(acx, acy);
        g.lineTo(acx + headW, acy - arrowH * 0.5);
        g.stroke({ width: 1, color: incomingColor, alpha: 0.5 });

        // Source map label (tiny, top-left of tile)
        // We can't render BitmapText here easily, so just a dot to keep it light
        g.circle(ipx + 3, ipy + 3, 2);
        g.fill({ color: incomingColor, alpha: 0.8 });
      }
    }
  }, [projectTileSize]);

  // Render hover highlight
  const renderHover = useCallback(() => {
    const hoverGraphics = hoverGraphicsRef.current;
    const { hoveredTile, activeTool } = useEditorStore.getState();
    const tileSize = projectTileSize;
    if (!hoverGraphics) return;

    hoverGraphics.clear();

    // No tile hover for tools that operate on objects rather than tiles
    const noTileHoverTools = [
      'entitySelect',
      'entityPlace',
      'entityDelete',
      'linkPlace',
      'linkSelect',
      'linkDelete',
      'select',
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
    } = useEditorStore.getState();
    const tileSize = projectTileSize;
    if (!previewContainer) return;

    previewContainer.removeChildren();

    if (
      activeTool === 'entityPlace' ||
      activeTool === 'entitySelect' ||
      activeTool === 'entityDelete'
    ) {
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

  // Main render function
  const render = useCallback(() => {
    renderTiles();
    renderEntities();
    renderGrid();
    renderCollisionOverlay();
    renderTerrainOverlay();
    renderLocationLinks();
    renderHover();
    renderPreview();
  }, [
    renderTiles,
    renderEntities,
    renderGrid,
    renderCollisionOverlay,
    renderTerrainOverlay,
    renderLocationLinks,
    renderHover,
    renderPreview,
  ]);

  return {
    render,
    renderTiles,
    renderEntities,
    renderGrid,
    renderCollisionOverlay,
    renderTerrainOverlay,
    renderLocationLinks,
    renderHover,
    renderPreview,
  };
}
