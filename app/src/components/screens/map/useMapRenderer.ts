import { useEffect, useRef, useCallback } from 'react';
import { Container, Graphics, Sprite, Texture, Rectangle } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { useEditorStore } from '../../../store/useEditorStore';
import { resolveTileAt, resolveEntities } from '../../../lib/mapUtils';
import { DEFAULT_ENTITY_TYPES } from '../../../lib/defaultEntities';
import { DEFAULT_TILE_SIZE } from '../../../config/constants';

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
    const getTileTexture = useCallback((spriteSheet: string, tileIndex: number, tileWidth: number, tileHeight: number, columns: number): Texture | null => {
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
            frame: new Rectangle(sx, sy, tileWidth, tileHeight)
        });

        textureCache.current.set(cacheKey, texture);
        return texture;
    }, []);

    // Render tiles
    const renderTiles = useCallback(() => {
        const tileContainer = tileContainerRef.current;
        const { currentMap, activeVariationId, tilesets } = useEditorStore.getState();
        if (!tileContainer || !currentMap) return;

        tileContainer.removeChildren();

        [...currentMap.layers].sort((a, b) => a.zOrder - b.zOrder).forEach(layer => {
            if (!layer.visible || layer.kind !== 'visual') return;

            for (let y = 0; y < currentMap.height; y++) {
                for (let x = 0; x < currentMap.width; x++) {
                    const tileRef = resolveTileAt(currentMap, layer.id, x, y, activeVariationId);
                    if (!tileRef) continue;

                    const [tsId, indexStr] = tileRef.split(':');
                    const index = parseInt(indexStr);
                    const tileset = tilesets.get(tsId);

                    if (tileset) {
                        let effectiveTileset = tileset;
                        const variation = currentMap.variations?.find(v => v.id === activeVariationId);
                        if (variation?.tilesetSuffix) {
                            const suffixed = tilesets.get(`${tsId}${variation.tilesetSuffix}`);
                            if (suffixed) effectiveTileset = suffixed;
                        }

                        const texture = getTileTexture(
                            effectiveTileset.spriteSheet,
                            index,
                            effectiveTileset.tileWidth,
                            effectiveTileset.tileHeight,
                            effectiveTileset.columns
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
        const { currentMap, activeVariationId, selectedEntityId } = useEditorStore.getState();
        if (!entityContainer || !currentMap) return;

        entityContainer.removeChildren();

        const resolvedEntities = resolveEntities(currentMap, activeVariationId);
        resolvedEntities.forEach(entity => {
            const type = DEFAULT_ENTITY_TYPES.find(t => t.id === entity.typeId);
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
        gridGraphics.setStrokeStyle({ width: gridLineWidth, color: 0x2d3748, alpha: 0.5 });
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
                DEFAULT_TILE_SIZE
            );
            hoverGraphics.fill({ color: 0xffffff, alpha: 0.15 });
        }
    }, []);

    // Render tile preview
    const renderPreview = useCallback(() => {
        const previewContainer = previewContainerRef.current;
        const { activeTool, activeTilesetId, hoveredTile, tilesets, currentMap, activeVariationId, selectedTileIndices, selectedTileIndex, drawPreview, drawMode } = useEditorStore.getState();
        if (!previewContainer) return;

        previewContainer.removeChildren();

        if ((activeTool !== 'tilePaint' && activeTool !== 'randomTile') || !activeTilesetId) return;

        const ts = tilesets.get(activeTilesetId);
        if (!ts) return;

        let effectiveTileset = ts;
        const variation = currentMap?.variations?.find(v => v.id === activeVariationId);
        if (variation?.tilesetSuffix) {
            const suffixed = tilesets.get(`${activeTilesetId}${variation.tilesetSuffix}`);
            if (suffixed) effectiveTileset = suffixed;
        }

        // If the user is actively drawing a shape, render the shape preview
        // For point mode with shift held, we show a line preview
        const isShiftLinePreview = drawMode === 'point' && drawPreview?.isDrawing;
        const showShapePreview = drawPreview && drawPreview.isDrawing && drawPreview.start && drawPreview.end && 
            (drawMode !== 'point' || isShiftLinePreview);
        
        if (showShapePreview && drawPreview.start && drawPreview.end) {
            // Determine effective draw mode for preview (point mode with shift shows as line)
            const effectiveDrawMode = drawMode === 'point' ? 'line' : drawMode;
            // For randomTile, skip pattern - sample randomly per tile position
            const patternData = activeTool === 'randomTile' ? null : (() => {
                if (!selectedTileIndices || selectedTileIndices.length === 0) return null;
                const cols = effectiveTileset.columns;
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
                return { pattern, patternW, patternH, minC, minR };
            })();

            // Seeded random for stable preview per position (changes when cursor moves)
            const seededRandom = (x: number, y: number, seed: number) => {
                const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 43758.5453) * 43758.5453;
                return n - Math.floor(n);
            };

            // Sample a random tile from selection using probability weights
            const sampleRandomTile = (x: number, y: number, seed: number): number | null => {
                if (!selectedTileIndices || selectedTileIndices.length === 0) {
                    return selectedTileIndex;
                }
                const indices = selectedTileIndices;
                const weights = indices.map(i => {
                    const def = effectiveTileset.tiles?.[i];
                    return def && typeof def.probability === 'number' && def.probability > 0 ? def.probability : 1;
                });
                const total = weights.reduce((a, b) => a + b, 0);
                if (total <= 0) return indices[0];
                
                const r = seededRandom(x, y, seed) * total;
                let acc = 0;
                for (let k = 0; k < indices.length; k++) {
                    acc += weights[k];
                    if (r < acc) return indices[k];
                }
                return indices[indices.length - 1];
            };

            // Use cursor end position as seed so preview changes when cursor moves
            const cursorSeed = (drawPreview.end.x * 1000 + drawPreview.end.y);

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
                        if (activeTool === 'randomTile') {
                            // For randomTile, sample a random tile for each position
                            tileIdx = sampleRandomTile(x, y, cursorSeed);
                        } else if (patternData) {
                            const dx = x - sx;
                            const dy = y - sy;
                            const px = ((dx % patternData.patternW) + patternData.patternW) % patternData.patternW;
                            const py = ((dy % patternData.patternH) + patternData.patternH) % patternData.patternH;
                            tileIdx = patternData.pattern[py][px];
                        } else if (selectedTileIndex !== null) {
                            tileIdx = selectedTileIndex;
                        }

                        if (tileIdx !== null && tileIdx !== undefined) {
                            const texture = getTileTexture(effectiveTileset.spriteSheet, tileIdx, effectiveTileset.tileWidth, effectiveTileset.tileHeight, effectiveTileset.columns);
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
                            if (activeTool === 'randomTile') {
                                // For randomTile, sample a random tile for each position
                                tileIdx = sampleRandomTile(x, y, cursorSeed);
                            } else if (patternData) {
                                const dx = x - sx;
                                const dy = y - sy;
                                const px = ((dx % patternData.patternW) + patternData.patternW) % patternData.patternW;
                                const py = ((dy % patternData.patternH) + patternData.patternH) % patternData.patternH;
                                tileIdx = patternData.pattern[py][px];
                            } else if (selectedTileIndex !== null) {
                                tileIdx = selectedTileIndex;
                            }

                            if (tileIdx !== null && tileIdx !== undefined) {
                                const texture = getTileTexture(effectiveTileset.spriteSheet, tileIdx, effectiveTileset.tileWidth, effectiveTileset.tileHeight, effectiveTileset.columns);
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
                // Bresenham's line algorithm for preview
                let x0 = sx, y0 = sy;
                const x1 = ex, y1 = ey;
                const dx = Math.abs(x1 - x0);
                const dy = Math.abs(y1 - y0);
                const stepX = x0 < x1 ? 1 : -1;
                const stepY = y0 < y1 ? 1 : -1;
                let err = dx - dy;

                while (true) {
                    let tileIdx: number | null = null;
                    if (activeTool === 'randomTile') {
                        tileIdx = sampleRandomTile(x0, y0, cursorSeed);
                    } else if (patternData) {
                        const pdx = x0 - sx;
                        const pdy = y0 - sy;
                        const px = ((pdx % patternData.patternW) + patternData.patternW) % patternData.patternW;
                        const py = ((pdy % patternData.patternH) + patternData.patternH) % patternData.patternH;
                        tileIdx = patternData.pattern[py][px];
                    } else if (selectedTileIndex !== null) {
                        tileIdx = selectedTileIndex;
                    }

                    if (tileIdx !== null && tileIdx !== undefined) {
                        const texture = getTileTexture(effectiveTileset.spriteSheet, tileIdx, effectiveTileset.tileWidth, effectiveTileset.tileHeight, effectiveTileset.columns);
                        if (texture) {
                            const sprite = new Sprite(texture);
                            sprite.x = x0 * DEFAULT_TILE_SIZE;
                            sprite.y = y0 * DEFAULT_TILE_SIZE;
                            sprite.width = DEFAULT_TILE_SIZE;
                            sprite.height = DEFAULT_TILE_SIZE;
                            previewContainer.addChild(sprite);
                        }
                    }

                    if (x0 === x1 && y0 === y1) break;
                    const e2 = 2 * err;
                    if (e2 > -dy) { err -= dy; x0 += stepX; }
                    if (e2 < dx) { err += dx; y0 += stepY; }
                }
            }

            return;
        }

        // Default hover preview (single tile or multi-tile stencil)
        if (!hoveredTile) return;

        // For randomTile, sample a random tile for the hover preview
        if (activeTool === 'randomTile') {
            if (!selectedTileIndices || selectedTileIndices.length === 0) {
                if (selectedTileIndex !== null && selectedTileIndex !== undefined) {
                    const texture = getTileTexture(
                        effectiveTileset.spriteSheet,
                        selectedTileIndex,
                        effectiveTileset.tileWidth,
                        effectiveTileset.tileHeight,
                        effectiveTileset.columns
                    );
                    if (texture) {
                        const sprite = new Sprite(texture);
                        sprite.x = hoveredTile.x * DEFAULT_TILE_SIZE;
                        sprite.y = hoveredTile.y * DEFAULT_TILE_SIZE;
                        sprite.width = DEFAULT_TILE_SIZE;
                        sprite.height = DEFAULT_TILE_SIZE;
                        previewContainer.addChild(sprite);
                    }
                }
                return;
            }

            // Seeded random for stable preview per position
            const seededRandom = (x: number, y: number) => {
                const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
                return n - Math.floor(n);
            };

            // Sample a random tile using probability weights
            const indices = selectedTileIndices;
            const weights = indices.map(i => {
                const def = effectiveTileset.tiles?.[i];
                return def && typeof def.probability === 'number' && def.probability > 0 ? def.probability : 1;
            });
            const total = weights.reduce((a, b) => a + b, 0);
            
            let previewIdx = indices[0];
            if (total > 0) {
                const r = seededRandom(hoveredTile.x, hoveredTile.y) * total;
                let acc = 0;
                for (let k = 0; k < indices.length; k++) {
                    acc += weights[k];
                    if (r < acc) {
                        previewIdx = indices[k];
                        break;
                    }
                }
            }
            
            const texture = getTileTexture(
                effectiveTileset.spriteSheet,
                previewIdx,
                effectiveTileset.tileWidth,
                effectiveTileset.tileHeight,
                effectiveTileset.columns
            );

            if (texture) {
                const sprite = new Sprite(texture);
                sprite.x = hoveredTile.x * DEFAULT_TILE_SIZE;
                sprite.y = hoveredTile.y * DEFAULT_TILE_SIZE;
                sprite.width = DEFAULT_TILE_SIZE;
                sprite.height = DEFAULT_TILE_SIZE;
                previewContainer.addChild(sprite);
            }
            return;
        }

        if (selectedTileIndices && selectedTileIndices.length > 0) {
            // Multi-tile preview
            const cols = effectiveTileset.columns;
            let minC = Infinity, minR = Infinity;
            for (const idx of selectedTileIndices) {
                const c = idx % cols;
                const r = Math.floor(idx / cols);
                if (c < minC) minC = c;
                if (r < minR) minR = r;
            }

            for (const idx of selectedTileIndices) {
                const c = idx % cols;
                const r = Math.floor(idx / cols);
                const texture = getTileTexture(
                    effectiveTileset.spriteSheet,
                    idx,
                    effectiveTileset.tileWidth,
                    effectiveTileset.tileHeight,
                    effectiveTileset.columns
                );

                if (texture) {
                    const sprite = new Sprite(texture);
                    sprite.x = (hoveredTile.x + (c - minC)) * DEFAULT_TILE_SIZE;
                    sprite.y = (hoveredTile.y + (r - minR)) * DEFAULT_TILE_SIZE;
                    sprite.width = DEFAULT_TILE_SIZE;
                    sprite.height = DEFAULT_TILE_SIZE;
                    previewContainer.addChild(sprite);
                }
            }
        } else if (selectedTileIndex !== null) {
            // Single tile preview
            const texture = getTileTexture(
                effectiveTileset.spriteSheet,
                selectedTileIndex,
                effectiveTileset.tileWidth,
                effectiveTileset.tileHeight,
                effectiveTileset.columns
            );

            if (texture) {
                const sprite = new Sprite(texture);
                sprite.x = hoveredTile.x * DEFAULT_TILE_SIZE;
                sprite.y = hoveredTile.y * DEFAULT_TILE_SIZE;
                sprite.width = DEFAULT_TILE_SIZE;
                sprite.height = DEFAULT_TILE_SIZE;
                previewContainer.addChild(sprite);
            }
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
        renderPreview
    };
}