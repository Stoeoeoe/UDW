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
        gridGraphics.setStrokeStyle({ width: 1, color: 0x2d3748, alpha: 0.5 });
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
        gridGraphics.setStrokeStyle({ width: 2, color: 0x4a5568 });
        gridGraphics.rect(0, 0, pixelWidth, pixelHeight);
        gridGraphics.stroke();
    }, []);

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
        const { activeTool, activeTilesetId, hoveredTile, tilesets, currentMap, activeVariationId, selectedTileIndices, selectedTileIndex } = useEditorStore.getState();
        if (!previewContainer) return;

        previewContainer.removeChildren();

        if (activeTool !== 'tilePaint' || !activeTilesetId || !hoveredTile) return;

        const ts = tilesets.get(activeTilesetId);
        if (!ts) return;

        let effectiveTileset = ts;
        const variation = currentMap?.variations?.find(v => v.id === activeVariationId);
        if (variation?.tilesetSuffix) {
            const suffixed = tilesets.get(`${activeTilesetId}${variation.tilesetSuffix}`);
            if (suffixed) effectiveTileset = suffixed;
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