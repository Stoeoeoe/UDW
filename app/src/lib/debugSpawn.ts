import type { Map as GameMap } from '../types/schema';

/** Tag marking the anchor the game uses as the debug spawn point for a map. */
export const DEBUG_SPAWN_POINT_TAG = 'debug_spawn_point';

export function mapHasDebugSpawnPoint(map: GameMap): boolean {
  return (map.spatialPrimitives?.anchors ?? []).some((anchor) =>
    anchor.tags.includes(DEBUG_SPAWN_POINT_TAG),
  );
}
