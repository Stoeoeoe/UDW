import { useEffect, useRef, useCallback } from 'react';
import { Container, Graphics, Sprite, Texture, Rectangle } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useEditorStore } from '../../../store/useEditorStore';
import { resolveTileAt, resolveEntities } from '../../../lib/mapUtils';
import { DEFAULT_TILE_SIZE } from '../../../config/constants';
import { buildPatternFromSelection, TilePattern } from '../../../lib/tileUtils';
import { sampleSeededTile } from '../../../lib/randomUtils';
import { bresenhamLine, circularBrush } from '../../../lib/algorithms';

interface UseMapRendererProps {
  viewport: Viewport | null;
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
  const hoverGraphicsRef = useRef<Graphics | null>(null);
  const selectionGraphicsRef = useRef<Graphics | null>(null);
  const previewContainerRef = useRef<Container | null>(null);

  // Create texture cache for tiles
  const textureCache = useRef<Map<string, Texture>>(new Map());

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

  // Get or create texture for a tile
  const getTileTexture = useCallback(
    (
      spriteSheet: string,
      tileIndex: number,
      tileWidth: number,
      tileHeight: number,
      columns: number,
    ): Texture | null => {
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

      const sx = (tileIndex % columns) * tileWidth;
      const sy = Math.floor(tileIndex / columns) * tileHeight;

      // Create a sub-texture using the frame
      const texture = new Texture({
        source: baseTexture.source,
        frame: new Rectangle(sx, sy, tileWidth, tileHeight),
      });

      textureCache.current.set(cacheKey, texture);
      return texture;
    },
    [],
  );

  // Render tiles
  const renderTiles = useCallback(() => {
    const tileContainer = tileContainerRef.current;
    const { currentMap, activeVariationId, tilesets } =
      useEditorStore.getState();
    if (!tileContainer || !currentMap) return;

    tileContainer.removeChildren();

    [...currentMap.layers]
      .sort((a, b) => a.zOrder - b.zOrder)
      .forEach((layer) => {
        if (!layer.visible || layer.kind !== 'visual') return;

        for (let y = 0; y < currentMap.height; y++) {
          for (let x = 0; x < currentMap.width; x++) {
            const tileRef = resolveTileAt(
              currentMap,
              layer.id,
              x,
              y,
              activeVariationId,
            );
            if (!tileRef) continue;

            const [tsId, indexStr] = tileRef.split(':');
            const index = parseInt(indexStr);
            const tileset = tilesets.get(tsId);

            if (tileset) {
              let effectiveTileset = tileset;
              const variation = currentMap.variations?.find(
                (v) => v.id === activeVariationId,
              );
              if (variation?.tilesetSuffix) {
                const suffixed = tilesets.get(
                  `${tsId}${variation.tilesetSuffix}`,
                );
                if (suffixed) effectiveTileset = suffixed;
              }

              const texture = getTileTexture(
                effectiveTileset.spriteSheet,
                index,
                effectiveTileset.tileWidth,
                effectiveTileset.tileHeight,
                effectiveTileset.columns,
              );

              if (texture) {
                const sprite = new Sprite(texture);
                sprite.x = x * DEFAULT_TILE_SIZE;
                sprite.y = y * DEFAULT_TILE_SIZE;
                sprite.width = DEFAULT_TILE_SIZE;
                sprite.height = DEFAULT_TILE_SIZE;
                tileContainer.addChild(sprite);
              }
            }
          }
        }
      });
  }, [getTileTexture]);

  // Render entities
  const renderEntities = useCallback(() => {
    const entityContainer = entityContainerRef.current;
    const { currentMap, activeVariationId, selectedEntityId, entityTypes } =
      useEditorStore.getState();
    if (!entityContainer || !currentMap) return;

    entityContainer.removeChildren();

    const resolvedEntities = resolveEntities(currentMap, activeVariationId);
    resolvedEntities.forEach((entity) => {
      const type = entityTypes.find((t) => t.id === entity.typeId);
      const colorHex = type?.placeholderColor || '#ffff00';
      const color = parseInt(colorHex.replace('#', ''), 16);

      const g = new Graphics();

      // Selection outline
      if (entity.id === selectedEntityId) {
        g.rect(-1, -1, DEFAULT_TILE_SIZE + 2, DEFAULT_TILE_SIZE + 2);
        g.stroke({ width: 2, color: 0xffffff });
      }

      // Entity fill
      g.rect(0, 0, DEFAULT_TILE_SIZE, DEFAULT_TILE_SIZE);
      g.fill({ color: color, alpha: 0.6 });

      g.x = entity.position[0] * DEFAULT_TILE_SIZE;
      g.y = entity.position[1] * DEFAULT_TILE_SIZE;
      entityContainer.addChild(g);
    });
  }, []);

  // Render grid
  const renderGrid = useCallback(() => {
    const gridGraphics = gridGraphicsRef.current;
    const { currentMap } = useEditorStore.getState();
    if (!gridGraphics || !currentMap) return;

    gridGraphics.clear();

    const pixelWidth = currentMap.width * DEFAULT_TILE_SIZE;
    const pixelHeight = currentMap.height * DEFAULT_TILE_SIZE;
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
    for (let x = 0; x <= pixelWidth; x += DEFAULT_TILE_SIZE) {
      gridGraphics.moveTo(x, 0);
      gridGraphics.lineTo(x, pixelHeight);
    }
    for (let y = 0; y <= pixelHeight; y += DEFAULT_TILE_SIZE) {
      gridGraphics.moveTo(0, y);
      gridGraphics.lineTo(pixelWidth, y);
    }
    gridGraphics.stroke();

    // Border - thicker line
    const borderLineWidth = Math.max(0.5, 2 / zoomScale);
    gridGraphics.setStrokeStyle({ width: borderLineWidth, color: 0x4a5568 });
    gridGraphics.rect(0, 0, pixelWidth, pixelHeight);
    gridGraphics.stroke();
  }, [viewport]);

  // Render hover highlight
  const renderHover = useCallback(() => {
    const hoverGraphics = hoverGraphicsRef.current;
    const { hoveredTile } = useEditorStore.getState();
    if (!hoverGraphics) return;

    hoverGraphics.clear();

    if (hoveredTile) {
      hoverGraphics.rect(
        hoveredTile.x * DEFAULT_TILE_SIZE,
        hoveredTile.y * DEFAULT_TILE_SIZE,
        DEFAULT_TILE_SIZE,
        DEFAULT_TILE_SIZE,
      );
      hoverGraphics.fill({ color: 0xffffff, alpha: 0.15 });
    }
  }, []);

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
    if (!previewContainer) return;

    previewContainer.removeChildren();

    // Erase tool preview - draw background color to show tiles will be removed
    if (activeTool === 'erase') {
      if (!hoveredTile) return;

      // Use dark background color for erase preview
      const bgColorNum = 0x1a1a2e;

      const effectiveBrushSize = drawMode === 'point' ? brushSize || 1 : 1;

      // Helper to render erase indicator at a position (just background color)
      const renderEraseAt = (tx: number, ty: number) => {
        const g = new Graphics();
        g.rect(
          tx * DEFAULT_TILE_SIZE,
          ty * DEFAULT_TILE_SIZE,
          DEFAULT_TILE_SIZE,
          DEFAULT_TILE_SIZE,
        );
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
      const isShiftLinePreviewErase =
        drawMode === 'point' && drawPreview?.isDrawing;
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
      const terrainColor = terrain
        ? parseInt(terrain.color.replace('#', '0x'), 16)
        : 0x00ff00;

      const effectiveBrushSize =
        drawMode === 'point' || drawMode === 'line' ? brushSize || 1 : 1;

      // Helper to render terrain indicator at a position
      const renderTerrainAt = (tx: number, ty: number) => {
        const g = new Graphics();
        g.rect(
          tx * DEFAULT_TILE_SIZE,
          ty * DEFAULT_TILE_SIZE,
          DEFAULT_TILE_SIZE,
          DEFAULT_TILE_SIZE,
        );
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
      const isShiftLinePreviewTerrain =
        drawMode === 'point' && drawPreview?.isDrawing;
      const showShapePreviewTerrain =
        drawPreview &&
        drawPreview.isDrawing &&
        drawPreview.start &&
        drawPreview.end &&
        (drawMode !== 'point' || isShiftLinePreviewTerrain);

      if (showShapePreviewTerrain && drawPreview.start && drawPreview.end) {
        const effectiveTerrainDrawMode =
          drawMode === 'point' ? 'line' : drawMode;
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

    if ((activeTool !== 'stamp' && activeTool !== 'random') || !activeTilesetId)
      return;

    const ts = tilesets.get(activeTilesetId);
    if (!ts) return;

    let effectiveTileset = ts;
    const variation = currentMap?.variations?.find(
      (v) => v.id === activeVariationId,
    );
    if (variation?.tilesetSuffix) {
      const suffixed = tilesets.get(
        `${activeTilesetId}${variation.tilesetSuffix}`,
      );
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
        minX * DEFAULT_TILE_SIZE,
        minY * DEFAULT_TILE_SIZE,
        (maxX - minX + 1) * DEFAULT_TILE_SIZE,
        (maxY - minY + 1) * DEFAULT_TILE_SIZE,
      );
      g.fill({ color: 0x4488ff, alpha: 0.2 });
      g.stroke({ width: 2, color: 0x4488ff, alpha: 0.8 });
      previewContainer.addChild(g);
      return; // Don't show stamp preview when selecting
    }

    // If the user is actively drawing a shape, render the shape preview
    // For point mode with shift held, we show a line preview
    const isShiftLinePreview =
      drawMode === 'point' &&
      drawPreview?.isDrawing &&
      drawPreview?.mode !== 'select';
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
        return sampleSeededTile(
          x,
          y,
          selectedTileIndices,
          effectiveTileset,
          cursorSeed,
        );
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
                ((dx % patternData.patternW) + patternData.patternW) %
                patternData.patternW;
              const py =
                ((dy % patternData.patternH) + patternData.patternH) %
                patternData.patternH;
              tileIdx = patternData.pattern[py][px];
            } else if (selectedTileIndex !== null) {
              tileIdx = selectedTileIndex;
            }

            if (tileIdx !== null && tileIdx !== undefined) {
              const texture = getTileTexture(
                effectiveTileset.spriteSheet,
                tileIdx,
                effectiveTileset.tileWidth,
                effectiveTileset.tileHeight,
                effectiveTileset.columns,
              );
              if (texture) {
                const sprite = new Sprite(texture);
                sprite.x = x * DEFAULT_TILE_SIZE;
                sprite.y = y * DEFAULT_TILE_SIZE;
                sprite.width = DEFAULT_TILE_SIZE;
                sprite.height = DEFAULT_TILE_SIZE;
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
                  ((dx % patternData.patternW) + patternData.patternW) %
                  patternData.patternW;
                const py =
                  ((dy % patternData.patternH) + patternData.patternH) %
                  patternData.patternH;
                tileIdx = patternData.pattern[py][px];
              } else if (selectedTileIndex !== null) {
                tileIdx = selectedTileIndex;
              }

              if (tileIdx !== null && tileIdx !== undefined) {
                const texture = getTileTexture(
                  effectiveTileset.spriteSheet,
                  tileIdx,
                  effectiveTileset.tileWidth,
                  effectiveTileset.tileHeight,
                  effectiveTileset.columns,
                );
                if (texture) {
                  const sprite = new Sprite(texture);
                  sprite.x = x * DEFAULT_TILE_SIZE;
                  sprite.y = y * DEFAULT_TILE_SIZE;
                  sprite.width = DEFAULT_TILE_SIZE;
                  sprite.height = DEFAULT_TILE_SIZE;
                  previewContainer.addChild(sprite);
                }
              }
            }
          }
        }
      } else if (effectiveDrawMode === 'line') {
        // Get effective brush size for line preview
        // NOTE: brush size only applies when NOT using a multi-tile pattern (to match drawing behavior)
        const hasPattern =
          patternData && patternData.patternW > 0 && patternData.patternH > 0;
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
                    effectiveTileset.tileWidth,
                    effectiveTileset.tileHeight,
                    effectiveTileset.columns,
                  );
                  if (texture) {
                    const sprite = new Sprite(texture);
                    sprite.x = tx * DEFAULT_TILE_SIZE;
                    sprite.y = ty * DEFAULT_TILE_SIZE;
                    sprite.width = DEFAULT_TILE_SIZE;
                    sprite.height = DEFAULT_TILE_SIZE;
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
                effectiveTileset.tileWidth,
                effectiveTileset.tileHeight,
                effectiveTileset.columns,
              );
              if (texture) {
                const sprite = new Sprite(texture);
                sprite.x = cx * DEFAULT_TILE_SIZE;
                sprite.y = cy * DEFAULT_TILE_SIZE;
                sprite.width = DEFAULT_TILE_SIZE;
                sprite.height = DEFAULT_TILE_SIZE;
                previewContainer.addChild(sprite);
              }
            }
          } else {
            // Circular brush of single/random tiles using shared utility
            for (const { x: bx, y: by } of circularBrush(
              cx,
              cy,
              effectiveBrushSize,
            )) {
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
                  effectiveTileset.tileWidth,
                  effectiveTileset.tileHeight,
                  effectiveTileset.columns,
                );
                if (texture) {
                  const sprite = new Sprite(texture);
                  sprite.x = bx * DEFAULT_TILE_SIZE;
                  sprite.y = by * DEFAULT_TILE_SIZE;
                  sprite.width = DEFAULT_TILE_SIZE;
                  sprite.height = DEFAULT_TILE_SIZE;
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
        effectiveTileset.tileWidth,
        effectiveTileset.tileHeight,
        effectiveTileset.columns,
      );
      if (texture) {
        const sprite = new Sprite(texture);
        sprite.x = tx * DEFAULT_TILE_SIZE;
        sprite.y = ty * DEFAULT_TILE_SIZE;
        sprite.width = DEFAULT_TILE_SIZE;
        sprite.height = DEFAULT_TILE_SIZE;
        previewContainer.addChild(sprite);
      }
    };

    // Helper to render brush at hover position using shared utility
    const renderBrushPreview = (
      getTileIdxForPos: (x: number, y: number) => number | null,
    ) => {
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
      const patternData = buildPatternFromSelection(
        selectedTileIndices,
        effectiveTileset,
      );
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
  }, [getTileTexture]);

  // Main render function
  const render = useCallback(() => {
    renderTiles();
    renderEntities();
    renderGrid();
    renderHover();
    renderPreview();
  }, [renderTiles, renderEntities, renderGrid, renderHover, renderPreview]);

  return {
    render,
    renderTiles,
    renderEntities,
    renderGrid,
    renderHover,
    renderPreview,
  };
}
