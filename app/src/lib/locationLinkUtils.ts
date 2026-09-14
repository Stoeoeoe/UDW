import type { Anchor, LocationLink, MapTrigger, Map as GameMap } from '../types/schema';

export const DEFAULT_LINK_FACING: [number, number] = [0, 1];

export function getMapAnchors(map?: GameMap | null): Anchor[] {
  return map?.spatialPrimitives?.anchors ?? [];
}

export function getMapTriggers(map?: GameMap | null): MapTrigger[] {
  return map?.spatialPrimitives?.triggers ?? [];
}

export function getAnchorById(
  map: GameMap | null | undefined,
  anchorId: string | undefined,
): Anchor | undefined {
  if (!map || !anchorId) return undefined;
  return getMapAnchors(map).find((anchor) => anchor.id === anchorId);
}

export function getTriggerById(
  map: GameMap | null | undefined,
  triggerId: string | undefined,
): MapTrigger | undefined {
  if (!map || !triggerId) return undefined;
  return getMapTriggers(map).find((trigger) => trigger.id === triggerId);
}

export function getLinkById(
  map: GameMap | null | undefined,
  linkId: string | undefined,
): LocationLink | undefined {
  if (!map || !linkId) return undefined;
  return map.locationLinks?.find((link) => link.id === linkId);
}

export function getLinkTargetMap(link: LocationLink, maps: GameMap[]): GameMap | undefined {
  return maps.find((map) => map.id === link.targetMapId);
}

/**
 * Computes the center of a trigger's footprint in pixel coords — used to
 * place connector lines and sidebar tooltips.
 */
export function getTriggerCenter(trigger: MapTrigger): [number, number] {
  if (trigger.shape === 'polygon' && trigger.points && trigger.points.length > 0) {
    let sx = 0;
    let sy = 0;
    for (const [x, y] of trigger.points) {
      sx += x;
      sy += y;
    }
    return [sx / trigger.points.length, sy / trigger.points.length];
  }
  const [x, y] = trigger.position;
  const [w, h] = trigger.size ?? [0, 0];
  return [x + w / 2, y + h / 2];
}

export function resolveLinkTarget(
  link: LocationLink,
  maps: GameMap[],
): {
  targetMap: GameMap | undefined;
  anchor: Anchor | undefined;
} {
  const targetMap = getLinkTargetMap(link, maps);
  const anchor = getAnchorById(targetMap, link.targetAnchorId);
  return { targetMap, anchor };
}
