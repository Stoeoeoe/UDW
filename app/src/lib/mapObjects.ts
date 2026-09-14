import { Layer, Map as GameMap, Tileset, TilesetObjectDefinition } from '../types/schema';
import { createTileRef } from './tileUtils';
import { getObjectGroupAt, getObjectGroupTileRef } from './objectGroups';
import { bresenhamLine, circularBrush } from './algorithms';

export interface MapObjectInstanceTile {
  x: number;
  y: number;
  tilesetId: string;
  tileIndex: number;
}

export interface MapObjectSpriteTile {
  x: number;
  y: number;
  tilesetId: string;
  tileIndex: number;
}

export function createMapObjectInstanceId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `inst_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  return `inst_${Math.random().toString(36).slice(2, 14)}`;
}

export function getObjectDefinition(
  tilesets: Map<string, Tileset>,
  tilesetId: string,
  objectDefinitionId: string,
): TilesetObjectDefinition | null {
  const tileset = tilesets.get(tilesetId);
  return (
    tileset?.objects?.find((objectDefinition) => objectDefinition.id === objectDefinitionId) ?? null
  );
}

export function getObjectDefinitionDimensions(
  tilesets: Map<string, Tileset>,
  tilesetId: string,
  objectDefinitionId: string,
): { width: number; height: number } | null {
  const objectDefinition = getObjectDefinition(tilesets, tilesetId, objectDefinitionId);
  if (!objectDefinition || objectDefinition.tiles.length === 0) return null;

  const width = Math.max(...objectDefinition.tiles.map((tile) => tile.x)) + 1;
  const height = Math.max(...objectDefinition.tiles.map((tile) => tile.y)) + 1;
  return { width, height };
}

export function getObjectDefinitionPixelSize(
  tilesets: Map<string, Tileset>,
  tilesetId: string,
  objectDefinitionId: string,
  tileSize: number,
): { width: number; height: number } | null {
  const dimensions = getObjectDefinitionDimensions(tilesets, tilesetId, objectDefinitionId);
  if (!dimensions) return null;
  return {
    width: dimensions.width * tileSize,
    height: dimensions.height * tileSize,
  };
}

export function getCenteredObjectPlacementOrigin(
  tilesets: Map<string, Tileset>,
  tilesetId: string,
  objectDefinitionId: string,
  cursorX: number,
  cursorY: number,
  mapWidth?: number,
  mapHeight?: number,
): { x: number; y: number } {
  const dimensions = getObjectDefinitionDimensions(tilesets, tilesetId, objectDefinitionId);
  if (!dimensions) {
    return { x: cursorX, y: cursorY };
  }

  let x = cursorX - Math.floor(dimensions.width / 2);
  let y = cursorY - Math.floor(dimensions.height / 2);

  if (typeof mapWidth === 'number') {
    x = Math.max(0, Math.min(x, Math.max(0, mapWidth - dimensions.width)));
  }
  if (typeof mapHeight === 'number') {
    y = Math.max(0, Math.min(y, Math.max(0, mapHeight - dimensions.height)));
  }

  return { x, y };
}

export function getCenteredObjectPlacementPixelOrigin(
  tilesets: Map<string, Tileset>,
  tilesetId: string,
  objectDefinitionId: string,
  cursorX: number,
  cursorY: number,
  tileSize: number,
  mapPixelWidth?: number,
  mapPixelHeight?: number,
): { x: number; y: number } {
  const pixelSize = getObjectDefinitionPixelSize(tilesets, tilesetId, objectDefinitionId, tileSize);
  if (!pixelSize) {
    return { x: Math.round(cursorX), y: Math.round(cursorY) };
  }

  let x = Math.round(cursorX - pixelSize.width / 2);
  let y = Math.round(cursorY - pixelSize.height / 2);

  if (typeof mapPixelWidth === 'number') {
    x = Math.max(0, Math.min(x, Math.max(0, mapPixelWidth - pixelSize.width)));
  }
  if (typeof mapPixelHeight === 'number') {
    y = Math.max(0, Math.min(y, Math.max(0, mapPixelHeight - pixelSize.height)));
  }

  return { x, y };
}

export function collectObjectPlacementOrigins(
  mode: 'point' | 'rect' | 'circle' | 'line',
  start: { x: number; y: number },
  end: { x: number; y: number },
  brushSize: number,
  tilesets: Map<string, Tileset>,
  tilesetId: string,
  objectDefinitionId: string,
  mapWidth?: number,
  mapHeight?: number,
): Array<{ x: number; y: number }> {
  const dimensions = getObjectDefinitionDimensions(tilesets, tilesetId, objectDefinitionId) ?? {
    width: 1,
    height: 1,
  };

  const baseOrigin = getCenteredObjectPlacementOrigin(
    tilesets,
    tilesetId,
    objectDefinitionId,
    start.x,
    start.y,
    mapWidth,
    mapHeight,
  );
  const positions = new Map<string, { x: number; y: number }>();
  const effectiveBrushSize = mode === 'point' || mode === 'line' ? brushSize : 1;

  const add = (cursorX: number, cursorY: number) => {
    const centeredOrigin = getCenteredObjectPlacementOrigin(
      tilesets,
      tilesetId,
      objectDefinitionId,
      cursorX,
      cursorY,
      mapWidth,
      mapHeight,
    );

    const snappedX =
      baseOrigin.x +
      Math.floor((centeredOrigin.x - baseOrigin.x) / Math.max(1, dimensions.width)) *
        Math.max(1, dimensions.width);
    const snappedY =
      baseOrigin.y +
      Math.floor((centeredOrigin.y - baseOrigin.y) / Math.max(1, dimensions.height)) *
        Math.max(1, dimensions.height);

    const clampedOrigin = getCenteredObjectPlacementOrigin(
      tilesets,
      tilesetId,
      objectDefinitionId,
      snappedX + Math.floor(dimensions.width / 2),
      snappedY + Math.floor(dimensions.height / 2),
      mapWidth,
      mapHeight,
    );

    positions.set(`${clampedOrigin.x},${clampedOrigin.y}`, clampedOrigin);
  };

  const addBrush = (cx: number, cy: number) => {
    if (effectiveBrushSize <= 1) {
      add(cx, cy);
      return;
    }
    for (const point of circularBrush(cx, cy, effectiveBrushSize)) {
      add(point.x, point.y);
    }
  };

  if (mode === 'point') {
    addBrush(end.x, end.y);
  } else if (mode === 'rect') {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        add(x, y);
      }
    }
  } else if (mode === 'circle') {
    const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
    const minX = Math.floor(start.x - radius);
    const maxX = Math.ceil(start.x + radius);
    const minY = Math.floor(start.y - radius);
    const maxY = Math.ceil(start.y + radius);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dist = Math.sqrt(Math.pow(x - start.x, 2) + Math.pow(y - start.y, 2));
        if (dist <= radius) {
          add(x, y);
        }
      }
    }
  } else if (mode === 'line') {
    for (const point of bresenhamLine(start.x, start.y, end.x, end.y)) {
      addBrush(point.x, point.y);
    }
  }

  return Array.from(positions.values());
}

export function expandObjectInstanceTiles(
  tilesets: Map<string, Tileset>,
  tilesetId: string,
  objectDefinitionId: string,
  x: number,
  y: number,
  tileSize: number,
): MapObjectInstanceTile[] {
  const objectDefinition = getObjectDefinition(tilesets, tilesetId, objectDefinitionId);
  if (!objectDefinition) return [];

  return objectDefinition.tiles.map((tile) => ({
    x: Math.floor(x / tileSize) + tile.x,
    y: Math.floor(y / tileSize) + tile.y,
    tilesetId,
    tileIndex: tile.tileIndex,
  }));
}

export function expandObjectInstanceSpriteTiles(
  tilesets: Map<string, Tileset>,
  tilesetId: string,
  objectDefinitionId: string,
  x: number,
  y: number,
  tileSize: number,
): MapObjectSpriteTile[] {
  const objectDefinition = getObjectDefinition(tilesets, tilesetId, objectDefinitionId);
  if (!objectDefinition) return [];

  return objectDefinition.tiles.map((tile) => ({
    x: x + tile.x * tileSize,
    y: y + tile.y * tileSize,
    tilesetId,
    tileIndex: tile.tileIndex,
  }));
}

export function getObjectInstanceBounds(
  tilesets: Map<string, Tileset>,
  objectInstance: { tilesetId: string; objectDefinitionId: string; x: number; y: number },
  tileSize: number,
): { x: number; y: number; width: number; height: number } | null {
  const pixelSize = getObjectDefinitionPixelSize(
    tilesets,
    objectInstance.tilesetId,
    objectInstance.objectDefinitionId,
    tileSize,
  );
  if (!pixelSize) return null;
  return {
    x: objectInstance.x,
    y: objectInstance.y,
    width: pixelSize.width,
    height: pixelSize.height,
  };
}

export function objectPlacementIntersectsMap(
  tilesets: Map<string, Tileset>,
  tilesetId: string,
  objectDefinitionId: string,
  x: number,
  y: number,
  tileSize: number,
  mapWidth: number,
  mapHeight: number,
): boolean {
  const pixelSize = getObjectDefinitionPixelSize(tilesets, tilesetId, objectDefinitionId, tileSize);
  if (!pixelSize) return false;

  const mapPixelWidth = mapWidth * tileSize;
  const mapPixelHeight = mapHeight * tileSize;

  return (
    x < mapPixelWidth && x + pixelSize.width > 0 && y < mapPixelHeight && y + pixelSize.height > 0
  );
}

export function resolveObjectInstanceTileAt(
  layer: Layer,
  x: number,
  y: number,
  tilesets: Map<string, Tileset>,
  tileSize = 16,
): string | null {
  for (const objectInstance of layer.objectInstances ?? []) {
    const tiles = expandObjectInstanceTiles(
      tilesets,
      objectInstance.tilesetId,
      objectInstance.objectDefinitionId,
      objectInstance.x,
      objectInstance.y,
      tileSize,
    );
    const matchingTile = tiles.find((tile) => tile.x === x && tile.y === y);
    if (matchingTile) {
      return createTileRef(matchingTile.tilesetId, matchingTile.tileIndex);
    }
  }

  return getObjectGroupTileRef(layer, x, y);
}

export function getObjectInstanceAtTile(
  layer: Layer,
  x: number,
  y: number,
  tilesets: Map<string, Tileset>,
  tileSize = 16,
) {
  const objectInstances = layer.objectInstances ?? [];
  for (let instanceIndex = objectInstances.length - 1; instanceIndex >= 0; instanceIndex -= 1) {
    const objectInstance = objectInstances[instanceIndex];
    const tiles = expandObjectInstanceTiles(
      tilesets,
      objectInstance.tilesetId,
      objectInstance.objectDefinitionId,
      objectInstance.x,
      objectInstance.y,
      tileSize,
    );
    if (tiles.some((tile) => tile.x === x && tile.y === y)) {
      return objectInstance;
    }
  }

  return null;
}

export function getObjectInstanceAtWorldPosition(
  layer: Layer,
  worldX: number,
  worldY: number,
  tilesets: Map<string, Tileset>,
  tileSize: number,
) {
  const objectInstances = layer.objectInstances ?? [];
  for (let instanceIndex = objectInstances.length - 1; instanceIndex >= 0; instanceIndex -= 1) {
    const objectInstance = objectInstances[instanceIndex];
    const tiles = expandObjectInstanceSpriteTiles(
      tilesets,
      objectInstance.tilesetId,
      objectInstance.objectDefinitionId,
      objectInstance.x,
      objectInstance.y,
      tileSize,
    );
    if (
      tiles.some(
        (tile) =>
          worldX >= tile.x &&
          worldX < tile.x + tileSize &&
          worldY >= tile.y &&
          worldY < tile.y + tileSize,
      )
    ) {
      return objectInstance;
    }
  }

  return null;
}

export function removeObjectInstanceAtTile(
  layer: Layer,
  x: number,
  y: number,
  tilesets: Map<string, Tileset>,
  tileSize = 16,
) {
  const hit = getObjectInstanceAtTile(layer, x, y, tilesets, tileSize);
  if (!hit) return null;
  layer.objectInstances = (layer.objectInstances ?? []).filter(
    (instance) => instance.id !== hit.id,
  );
  return hit;
}

export function computeObjectInstanceSortDepth(
  tilesets: Map<string, Tileset>,
  layer: Layer,
  objectInstance: { tilesetId: string; objectDefinitionId: string; x: number; y: number },
  tileSize: number,
): number {
  const tiles = expandObjectInstanceSpriteTiles(
    tilesets,
    objectInstance.tilesetId,
    objectInstance.objectDefinitionId,
    objectInstance.x,
    objectInstance.y,
    tileSize,
  );
  if (!tiles.length) {
    return objectInstance.y;
  }

  let maxDepth = -Infinity;
  const tileset = tilesets.get(objectInstance.tilesetId);
  for (const tile of tiles) {
    const pivotY = tileset?.tiles[tile.tileIndex]?.pivotY ?? 1;
    maxDepth = Math.max(maxDepth, tile.y + pivotY * tileSize);
  }

  if (Number.isFinite(maxDepth)) return maxDepth + layer.zOrder;
  return objectInstance.y + layer.zOrder;
}

export function iterateRenderableObjectTiles(
  map: GameMap,
  layer: Layer,
  tilesets: Map<string, Tileset>,
  tileSize = 16,
): MapObjectInstanceTile[] {
  const tiles: MapObjectInstanceTile[] = [];

  for (const objectInstance of layer.objectInstances ?? []) {
    tiles.push(
      ...expandObjectInstanceTiles(
        tilesets,
        objectInstance.tilesetId,
        objectInstance.objectDefinitionId,
        objectInstance.x,
        objectInstance.y,
        tileSize,
      ),
    );
  }

  if (tiles.length > 0) {
    return tiles;
  }

  if (layer.objectGroups?.length) {
    return layer.objectGroups.flatMap((group) => group.tiles);
  }

  const fallbackTiles: MapObjectInstanceTile[] = [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const tileRef = getObjectGroupTileRef(layer, x, y);
      if (!tileRef) continue;
      const colon = tileRef.lastIndexOf(':');
      if (colon <= 0) continue;
      fallbackTiles.push({
        x,
        y,
        tilesetId: tileRef.slice(0, colon),
        tileIndex: Number.parseInt(tileRef.slice(colon + 1), 10),
      });
    }
  }
  return fallbackTiles;
}

export function getLegacyObjectGroupAt(layer: Layer, x: number, y: number) {
  return getObjectGroupAt(layer, x, y);
}
