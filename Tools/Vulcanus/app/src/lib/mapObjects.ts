import type { Layer, Tileset } from '../types/schema';
import type { ObjectDefinition } from '../types/object';
import { createTileRef } from './tileUtils';
import { bresenhamLine, circularBrush } from './algorithms';

/** The project's objects by ID. */
export type ObjectIndex = ReadonlyMap<string, ObjectDefinition>;

/** A placed object: which object, and its top-left corner in map pixels. */
interface PlacedObject {
  objectId: string;
  x: number;
  y: number;
}

export interface MapObjectInstanceTile {
  x: number;
  y: number;
  tilesetId: string;
  tileIndex: number;
}

const indexCache = new WeakMap<readonly ObjectDefinition[], ObjectIndex>();

/** The objects by ID, built once per version of the store's list. */
export function indexObjects(objects: readonly ObjectDefinition[]): ObjectIndex {
  let index = indexCache.get(objects);
  if (!index) {
    index = new Map(objects.map((object) => [object.id, object]));
    indexCache.set(objects, index);
  }
  return index;
}

export function createMapObjectInstanceId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `inst_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  return `inst_${Math.random().toString(36).slice(2, 14)}`;
}

/** An object's size in tiles, or null when it is unknown or has no tiles. */
export function getObjectDimensions(
  objects: ObjectIndex,
  objectId: string,
): { width: number; height: number } | null {
  const object = objects.get(objectId);
  if (!object || object.tiles.length === 0) return null;
  return {
    width: Math.max(...object.tiles.map((tile) => tile.x)) + 1,
    height: Math.max(...object.tiles.map((tile) => tile.y)) + 1,
  };
}

function getObjectPixelSize(
  objects: ObjectIndex,
  objectId: string,
  tileSize: number,
): { width: number; height: number } | null {
  const dimensions = getObjectDimensions(objects, objectId);
  return dimensions && { width: dimensions.width * tileSize, height: dimensions.height * tileSize };
}

export function getCenteredObjectPlacementOrigin(
  objects: ObjectIndex,
  objectId: string,
  cursorX: number,
  cursorY: number,
  mapWidth?: number,
  mapHeight?: number,
): { x: number; y: number } {
  const dimensions = getObjectDimensions(objects, objectId);
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
  objects: ObjectIndex,
  objectId: string,
  cursorX: number,
  cursorY: number,
  tileSize: number,
  mapPixelWidth?: number,
  mapPixelHeight?: number,
): { x: number; y: number } {
  const pixelSize = getObjectPixelSize(objects, objectId, tileSize);
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
  objects: ObjectIndex,
  objectId: string,
  mapWidth?: number,
  mapHeight?: number,
): Array<{ x: number; y: number }> {
  const dimensions = getObjectDimensions(objects, objectId) ?? { width: 1, height: 1 };

  const baseOrigin = getCenteredObjectPlacementOrigin(
    objects,
    objectId,
    start.x,
    start.y,
    mapWidth,
    mapHeight,
  );
  const positions = new Map<string, { x: number; y: number }>();
  const effectiveBrushSize = mode === 'point' || mode === 'line' ? brushSize : 1;

  const add = (cursorX: number, cursorY: number) => {
    const centeredOrigin = getCenteredObjectPlacementOrigin(
      objects,
      objectId,
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
      objects,
      objectId,
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

/** The map cells a placed object covers, each with its tile. */
export function expandObjectInstanceTiles(
  objects: ObjectIndex,
  placed: PlacedObject,
  tileSize: number,
): MapObjectInstanceTile[] {
  const object = objects.get(placed.objectId);
  if (!object) return [];

  return object.tiles.map((tile) => ({
    x: Math.floor(placed.x / tileSize) + tile.x,
    y: Math.floor(placed.y / tileSize) + tile.y,
    tilesetId: object.tilesetId,
    tileIndex: tile.tileIndex,
  }));
}

/** A placed object's tiles at their pixel positions on the map. */
export function expandObjectInstanceSpriteTiles(
  objects: ObjectIndex,
  placed: PlacedObject,
  tileSize: number,
): MapObjectInstanceTile[] {
  const object = objects.get(placed.objectId);
  if (!object) return [];

  return object.tiles.map((tile) => ({
    x: placed.x + tile.x * tileSize,
    y: placed.y + tile.y * tileSize,
    tilesetId: object.tilesetId,
    tileIndex: tile.tileIndex,
  }));
}

export function getObjectInstanceBounds(
  objects: ObjectIndex,
  placed: PlacedObject,
  tileSize: number,
): { x: number; y: number; width: number; height: number } | null {
  const pixelSize = getObjectPixelSize(objects, placed.objectId, tileSize);
  if (!pixelSize) return null;
  return { x: placed.x, y: placed.y, width: pixelSize.width, height: pixelSize.height };
}

export function objectPlacementIntersectsMap(
  objects: ObjectIndex,
  objectId: string,
  x: number,
  y: number,
  tileSize: number,
  mapWidth: number,
  mapHeight: number,
): boolean {
  const pixelSize = getObjectPixelSize(objects, objectId, tileSize);
  if (!pixelSize) return false;

  const mapPixelWidth = mapWidth * tileSize;
  const mapPixelHeight = mapHeight * tileSize;

  return (
    x < mapPixelWidth && x + pixelSize.width > 0 && y < mapPixelHeight && y + pixelSize.height > 0
  );
}

/** The tile a placed object shows at a map cell, as a tile reference. */
export function resolveObjectInstanceTileAt(
  layer: Layer,
  x: number,
  y: number,
  objects: ObjectIndex,
  tileSize = 16,
): string | null {
  for (const objectInstance of layer.objectInstances ?? []) {
    const tile = expandObjectInstanceTiles(objects, objectInstance, tileSize).find(
      (entry) => entry.x === x && entry.y === y,
    );
    if (tile) return createTileRef(tile.tilesetId, tile.tileIndex);
  }
  return null;
}

export function getObjectInstanceAtTile(
  layer: Layer,
  x: number,
  y: number,
  objects: ObjectIndex,
  tileSize = 16,
) {
  const objectInstances = layer.objectInstances ?? [];
  for (let instanceIndex = objectInstances.length - 1; instanceIndex >= 0; instanceIndex -= 1) {
    const objectInstance = objectInstances[instanceIndex];
    const tiles = expandObjectInstanceTiles(objects, objectInstance, tileSize);
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
  objects: ObjectIndex,
  tileSize: number,
) {
  const objectInstances = layer.objectInstances ?? [];
  for (let instanceIndex = objectInstances.length - 1; instanceIndex >= 0; instanceIndex -= 1) {
    const objectInstance = objectInstances[instanceIndex];
    const tiles = expandObjectInstanceSpriteTiles(objects, objectInstance, tileSize);
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
  objects: ObjectIndex,
  tileSize = 16,
) {
  const hit = getObjectInstanceAtTile(layer, x, y, objects, tileSize);
  if (!hit) return null;
  layer.objectInstances = (layer.objectInstances ?? []).filter(
    (instance) => instance.id !== hit.id,
  );
  return hit;
}

/** The depth a placed object sorts at: the lowest ground line of its tiles, after the layer's order. */
export function computeObjectInstanceSortDepth(
  objects: ObjectIndex,
  tilesets: Map<string, Tileset>,
  layer: Layer,
  placed: PlacedObject,
  tileSize: number,
): number {
  const tiles = expandObjectInstanceSpriteTiles(objects, placed, tileSize);
  if (!tiles.length) {
    return placed.y;
  }

  let maxDepth = -Infinity;
  for (const tile of tiles) {
    const pivotY = tilesets.get(tile.tilesetId)?.tiles[tile.tileIndex]?.pivotY ?? 1;
    maxDepth = Math.max(maxDepth, tile.y + pivotY * tileSize);
  }
  return maxDepth + layer.zOrder;
}

/** Every map cell covered by a placed object on the layer, with its tile. */
export function iterateRenderableObjectTiles(
  layer: Layer,
  objects: ObjectIndex,
  tileSize = 16,
): MapObjectInstanceTile[] {
  return (layer.objectInstances ?? []).flatMap((objectInstance) =>
    expandObjectInstanceTiles(objects, objectInstance, tileSize),
  );
}

/** The maps on which an object is placed. */
export function mapsPlacingObject<T extends { layers: Layer[] }>(maps: T[], objectId: string): T[] {
  return maps.filter((map) =>
    map.layers.some((layer) =>
      (layer.objectInstances ?? []).some((instance) => instance.objectId === objectId),
    ),
  );
}
