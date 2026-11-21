import type { Building } from '../../types/building';
import type { BuildingInstance, Layer, Map as GameMap } from '../../types/schema';
import { getVariationChain } from '../mapUtils';
import { STOREY_ROWS } from './layout';

type Cell = { x: number; y: number };

/** The map's active variation and its parents, nearest first: the chain a kit variation is looked up in. */
export function kitVariationChain(map: GameMap, activeVariationId: string | null): string[] {
  return getVariationChain(map, activeVariationId)
    .flatMap((entry) => (entry === 'base' ? [] : [entry.id]))
    .reverse();
}

/** The tiles the exterior image covers: the footprint and the 3 rows above it. */
export function exteriorBounds(building: Building, instance: BuildingInstance) {
  return {
    x: instance.x,
    y: instance.y - STOREY_ROWS,
    width: building.width,
    height: building.depth + STOREY_ROWS,
  };
}

/** The topmost placed building whose exterior covers the tile, if any. */
export function buildingInstanceAt(
  layer: Layer,
  buildings: readonly Building[],
  tile: Cell,
): BuildingInstance | undefined {
  return [...(layer.buildings ?? [])].reverse().find((instance) => {
    const building = buildings.find((entry) => entry.id === instance.buildingId);
    if (!building) return false;
    const bounds = exteriorBounds(building, instance);
    return (
      tile.x >= bounds.x &&
      tile.x < bounds.x + bounds.width &&
      tile.y >= bounds.y &&
      tile.y < bounds.y + bounds.height
    );
  });
}

/** Where to place a building so the pointer is over its door; the footprint's north-west cell. */
export function placementOrigin(building: Building, pointer: Cell): Cell {
  const door = building.openings.find((o) => o.kind === 'door' && o.y === building.depth - 1);
  return door
    ? { x: pointer.x - door.x, y: pointer.y - door.y }
    : { x: pointer.x - Math.floor(building.width / 2), y: pointer.y - (building.depth - 1) };
}

/**
 * Why the building cannot be placed (again), or `null`. A building with an interior map is placed once in the
 * project, so its interior's door leads back to one place.
 */
export function placementRefusal(
  maps: readonly GameMap[],
  currentMap: GameMap,
  building: Building,
): string | null {
  if (!building.interiorMapId) return null;
  const placedOn = [currentMap, ...maps.filter((map) => map.id !== currentMap.id)].find((map) =>
    map.layers.some((layer) =>
      layer.buildings?.some((instance) => instance.buildingId === building.id),
    ),
  );
  return placedOn
    ? `${building.name} is already placed on ${placedOn.name}. A building with an interior can be placed once.`
    : null;
}

/** The footprint's cells that will collide: all of them except doors in the south wall. */
export function footprintCollisionCells(building: Building, instance: BuildingInstance): Cell[] {
  const south = building.depth - 1;
  const doors = new Set(
    building.openings.filter((o) => o.kind === 'door' && o.y === south).map((o) => o.x),
  );
  const cells: Cell[] = [];
  for (let y = 0; y < building.depth; y++)
    for (let x = 0; x < building.width; x++)
      if (!(y === south && doors.has(x))) cells.push({ x: instance.x + x, y: instance.y + y });
  return cells;
}

export function createBuildingInstanceId(): string {
  return `building_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}
