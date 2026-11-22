/**
 * Navigation cost grid for NPC pathfinding. Mirrors the Unity importer's NavigationCostGridBuilder.
 * See docs/navigation-cost.md for the authoring rule.
 */
import { DEFAULT_TILE_SIZE } from '../config/constants';
import type { Layer, Map as GameMap, Tileset } from '../types/schema';
import { NAVIGATION_COST_CHEAP_COLOR, NAVIGATION_COST_EXPENSIVE_COLOR } from './editorColors';
import { expandObjectInstanceTiles, type ObjectIndex } from './mapObjects';
import { splitTileRef } from './tileRef';
import { resolveTileAt } from './mapUtils';

export const DEFAULT_NAVIGATION_COST = 2;
export const MIN_NAVIGATION_COST = 1;
export const MAX_NAVIGATION_COST = 100;

export interface NavigationCostCell {
  cost: number;
  /** Layer whose tile set this cost, or null when the default cost applies. */
  sourceLayerId: string | null;
}

/** Row-major `cells[y][x]` in Vulcanus map coordinates. */
export interface NavigationCostGrid {
  width: number;
  height: number;
  cells: NavigationCostCell[][];
}

/**
 * Cost of a map cell: the terrain layer tile's cost (default 2 when it has none), then every other
 * visible tile/object layer in ascending zOrder overrides it where its tile has a cost.
 * The terrain layer is the first visible terrain layer in map layer order (the one the Unity importer
 * treats as the terrain tilemap); it is always the base regardless of zOrder.
 */
export function computeNavigationCostGrid(
  map: GameMap,
  tilesets: Map<string, Tileset>,
  objects: ObjectIndex,
  activeVariationId: string | null,
  tileSize: number = DEFAULT_TILE_SIZE,
): NavigationCostGrid {
  const variation = map.variations?.find((v) => v.id === activeVariationId);
  const costOf = (tileRef: string): number | undefined => {
    const [tilesetId, indexStr] = splitTileRef(tileRef);
    let tileset = tilesets.get(tilesetId);
    if (variation?.tilesetSuffix) {
      tileset = tilesets.get(`${tilesetId}${variation.tilesetSuffix}`) ?? tileset;
    }
    return tileset?.tiles[parseInt(indexStr, 10)]?.navigationCost;
  };

  const visibleTileLayers = map.layers.filter(
    (layer) =>
      layer.visible && (layer.kind === 'visual' || layer.kind === 'terrain' || layer.kind === 'object'),
  );
  const terrainLayer = visibleTileLayers.find((layer) => layer.kind === 'terrain');
  const overrideLayers = visibleTileLayers
    .filter((layer) => layer !== terrainLayer)
    .sort((a, b) => a.zOrder - b.zOrder);

  // Object layers contribute only their placed instances, like the Unity importer.
  const objectCosts = new Map<string, Map<number, number>>();
  for (const layer of overrideLayers) {
    if (layer.kind === 'object') objectCosts.set(layer.id, objectInstanceCosts(layer));
  }

  function objectInstanceCosts(layer: Layer): Map<number, number> {
    const costs = new Map<number, number>();
    const claimed = new Set<number>();
    for (const instance of layer.objectInstances ?? []) {
      for (const tile of expandObjectInstanceTiles(objects, instance, tileSize)) {
        if (tile.x < 0 || tile.y < 0 || tile.x >= map.width || tile.y >= map.height) continue;
        const key = tile.y * map.width + tile.x;
        if (claimed.has(key)) continue; // first instance wins, as resolveTileAt does
        claimed.add(key);
        const cost = costOf(`${tile.tilesetId}:${tile.tileIndex}`);
        if (cost !== undefined) costs.set(key, cost);
      }
    }
    return costs;
  }

  const cells: NavigationCostCell[][] = [];
  for (let y = 0; y < map.height; y++) {
    const row: NavigationCostCell[] = [];
    for (let x = 0; x < map.width; x++) {
      let cell: NavigationCostCell = { cost: DEFAULT_NAVIGATION_COST, sourceLayerId: null };

      if (terrainLayer) {
        const tileRef = resolveTileAt(map, terrainLayer.id, x, y, activeVariationId);
        const cost = tileRef ? costOf(tileRef) : undefined;
        if (cost !== undefined) cell = { cost, sourceLayerId: terrainLayer.id };
      }

      for (const layer of overrideLayers) {
        let cost: number | undefined;
        if (layer.kind === 'object') {
          cost = objectCosts.get(layer.id)?.get(y * map.width + x);
        } else {
          const tileRef = resolveTileAt(map, layer.id, x, y, activeVariationId);
          cost = tileRef ? costOf(tileRef) : undefined;
        }
        if (cost !== undefined) cell = { cost, sourceLayerId: layer.id };
      }

      row.push(cell);
    }
    cells.push(row);
  }

  return { width: map.width, height: map.height, cells };
}

/** Heat tint for the overlay: cheaper than default = green, default = none, dearer = red. */
export function navigationCostTint(cost: number): { color: number; alpha: number } | null {
  if (cost === DEFAULT_NAVIGATION_COST) return null;
  if (cost < DEFAULT_NAVIGATION_COST) {
    const t = (DEFAULT_NAVIGATION_COST - cost) / (DEFAULT_NAVIGATION_COST - MIN_NAVIGATION_COST);
    return { color: NAVIGATION_COST_CHEAP_COLOR, alpha: 0.25 + 0.25 * t };
  }
  const t = Math.min(1, (cost - DEFAULT_NAVIGATION_COST) / 8);
  return { color: NAVIGATION_COST_EXPENSIVE_COLOR, alpha: 0.25 + 0.35 * t };
}
