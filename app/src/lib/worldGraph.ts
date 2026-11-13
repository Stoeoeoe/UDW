/**
 * The world's maps joined by their location links, the only way characters get from one map to another. Each link is
 * one way: from a trigger on its map to an arrival anchor on the target map. Mirrors Unity's MapLinkGraph.
 */
import type { Map as GameMap } from '../types/schema';

/** Whether a chain of location links leads from one map to the other; a map always reaches itself. */
export function canReachMap(maps: readonly GameMap[], fromMapId: string, toMapId: string): boolean {
  const seen = new Set([fromMapId]);
  const queue = [fromMapId];
  while (queue.length) {
    const mapId = queue.shift()!;
    if (mapId === toMapId) return true;
    for (const link of maps.find((map) => map.id === mapId)?.locationLinks ?? [])
      if (!seen.has(link.targetMapId)) {
        seen.add(link.targetMapId);
        queue.push(link.targetMapId);
      }
  }
  return false;
}
