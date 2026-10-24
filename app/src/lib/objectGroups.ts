import { Layer } from '../types/schema';
import { createTileRef, parseTileRef } from './tileUtils';

export interface ObjectGroupTile {
  x: number;
  y: number;
  tilesetId: string;
  tileIndex: number;
}

export interface ObjectGroup {
  id: string;
  tiles: ObjectGroupTile[];
}

interface ObjectGroupCell extends ObjectGroupTile {
  previousGroupId?: string;
}

interface ObjectGroupEdit {
  x: number;
  y: number;
  value: string | null;
}

const NEIGHBOR_OFFSETS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

const objectTileLookupCache = new WeakMap<Layer, Map<string, string>>();
const objectTileLookupSignature = new WeakMap<Layer, ObjectGroup[] | undefined>();

function makeCoordKey(x: number, y: number): string {
  return `${x},${y}`;
}

function sortObjectGroupTiles(a: ObjectGroupTile, b: ObjectGroupTile): number {
  return (
    a.y - b.y || a.x - b.x || a.tilesetId.localeCompare(b.tilesetId) || a.tileIndex - b.tileIndex
  );
}

function createObjectGroupId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `obj_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  return `obj_${Math.random().toString(36).slice(2, 14)}`;
}

function buildObjectTileLookup(layer: Layer): Map<string, string> {
  const cachedSignature = objectTileLookupSignature.get(layer);
  if (cachedSignature === layer.objectGroups) {
    return objectTileLookupCache.get(layer) ?? new Map<string, string>();
  }

  const lookup = new Map<string, string>();
  for (const group of layer.objectGroups ?? []) {
    for (const tile of group.tiles) {
      lookup.set(makeCoordKey(tile.x, tile.y), createTileRef(tile.tilesetId, tile.tileIndex));
    }
  }

  objectTileLookupSignature.set(layer, layer.objectGroups);
  objectTileLookupCache.set(layer, lookup);
  return lookup;
}

function rebuildObjectGroups(cells: ObjectGroupCell[]): ObjectGroup[] {
  if (cells.length === 0) {
    return [];
  }

  const occupied = new Map<string, ObjectGroupCell>();
  for (const cell of cells) {
    occupied.set(makeCoordKey(cell.x, cell.y), cell);
  }

  const visited = new Set<string>();
  const groups: ObjectGroup[] = [];

  for (const cell of cells) {
    const startKey = makeCoordKey(cell.x, cell.y);
    if (visited.has(startKey)) continue;

    const queue = [cell];
    const component: ObjectGroupTile[] = [];
    const candidateIds = new Set<string>();
    visited.add(startKey);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push({
        x: current.x,
        y: current.y,
        tilesetId: current.tilesetId,
        tileIndex: current.tileIndex,
      });
      if (current.previousGroupId) {
        candidateIds.add(current.previousGroupId);
      }

      for (const [dx, dy] of NEIGHBOR_OFFSETS) {
        const nextX = current.x + dx;
        const nextY = current.y + dy;
        const nextKey = makeCoordKey(nextX, nextY);
        if (visited.has(nextKey)) continue;
        const nextCell = occupied.get(nextKey);
        if (!nextCell) continue;
        visited.add(nextKey);
        queue.push(nextCell);
      }
    }

    component.sort(sortObjectGroupTiles);
    const id = Array.from(candidateIds).sort()[0] ?? createObjectGroupId();
    groups.push({ id, tiles: component });
  }

  return groups.sort((a, b) => {
    const aFirst = a.tiles[0];
    const bFirst = b.tiles[0];
    if (!aFirst || !bFirst) return a.id.localeCompare(b.id);
    return aFirst.y - bFirst.y || aFirst.x - bFirst.x || a.id.localeCompare(b.id);
  });
}

export function getObjectGroupTileRef(layer: Layer, x: number, y: number): string | null {
  if (!layer.objectGroups || layer.objectGroups.length === 0) return null;
  return buildObjectTileLookup(layer).get(makeCoordKey(x, y)) ?? null;
}

export function getObjectGroupAt(layer: Layer, x: number, y: number): ObjectGroup | null {
  for (const group of layer.objectGroups ?? []) {
    if (group.tiles.some((tile) => tile.x === x && tile.y === y)) {
      return group;
    }
  }
  return null;
}

export function applyObjectGroupEdits(layer: Layer, edits: ObjectGroupEdit[]): void {
  const currentCells = new Map<string, ObjectGroupCell>();

  for (const group of layer.objectGroups ?? []) {
    for (const tile of group.tiles) {
      currentCells.set(makeCoordKey(tile.x, tile.y), {
        ...tile,
        previousGroupId: group.id,
      });
    }
  }

  for (const edit of edits) {
    const key = makeCoordKey(edit.x, edit.y);
    if (edit.value === null) {
      currentCells.delete(key);
      continue;
    }

    const parsed = parseTileRef(edit.value);
    if (!parsed) continue;
    const previous = currentCells.get(key);
    currentCells.set(key, {
      x: edit.x,
      y: edit.y,
      tilesetId: parsed.tilesetId,
      tileIndex: parsed.tileIndex,
      previousGroupId: previous?.previousGroupId,
    });
  }

  layer.objectGroups = rebuildObjectGroups(Array.from(currentCells.values()));
  delete layer.data;
}

export function collectTilesetRefsFromObjectGroups(layers: Layer[]): string[] {
  const refs = new Set<string>();
  for (const layer of layers) {
    for (const group of layer.objectGroups ?? []) {
      for (const tile of group.tiles) {
        refs.add(tile.tilesetId);
      }
    }
  }
  return Array.from(refs).sort();
}
