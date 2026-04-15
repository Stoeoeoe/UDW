import type { Anchor, LocationLink, Map as GameMap } from '../types/schema';

export const DEFAULT_LINK_FACING: [number, number] = [0, 1];

export function normalizeFacingVector(facing?: [number, number] | null): [number, number] {
  if (!facing) return DEFAULT_LINK_FACING;

  const [x, y] = facing;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return DEFAULT_LINK_FACING;
  }

  const length = Math.hypot(x, y);
  if (length < 0.0001) {
    return DEFAULT_LINK_FACING;
  }

  return [Number((x / length).toFixed(4)), Number((y / length).toFixed(4))];
}

export function getMapAnchors(map?: GameMap | null): Anchor[] {
  return map?.spatialPrimitives?.anchors ?? [];
}

export function getAnchorById(
  map: GameMap | null | undefined,
  anchorId: string | undefined,
): Anchor | undefined {
  if (!map || !anchorId) return undefined;
  return getMapAnchors(map).find((anchor) => anchor.id === anchorId);
}

export function getLinkById(
  map: GameMap | null | undefined,
  linkId: string | undefined,
): LocationLink | undefined {
  if (!map || !linkId) return undefined;
  return map.locationLinks?.find((link) => link.id === linkId);
}

export function getLinkOwnedAnchor(
  link: LocationLink | undefined,
  map: GameMap | null | undefined,
): Anchor | undefined {
  if (!link) return undefined;
  return getAnchorById(map, link.anchorId);
}

export function getLinkTargetMap(
  link: LocationLink,
  currentMap: GameMap | null | undefined,
  maps: GameMap[],
): GameMap | undefined {
  if (!link.targetMapId || link.targetMapId === currentMap?.id) {
    return currentMap ?? undefined;
  }

  return maps.find((map) => map.id === link.targetMapId);
}

export function resolveLinkTarget(
  link: LocationLink,
  currentMap: GameMap | null | undefined,
  maps: GameMap[],
): {
  targetMap: GameMap | undefined;
  targetLink: LocationLink | undefined;
  anchor: Anchor | undefined;
  usesAnchor: boolean;
  position: [number, number];
  facing: [number, number];
} {
  const targetMap = getLinkTargetMap(link, currentMap, maps);
  const targetLink = getLinkById(targetMap, link.targetLinkId);
  const anchor =
    getLinkOwnedAnchor(targetLink, targetMap) ?? getAnchorById(targetMap, link.targetAnchorId);

  return {
    targetMap,
    targetLink,
    anchor,
    usesAnchor: !!anchor,
    position: anchor?.position ?? link.targetPosition,
    facing: normalizeFacingVector(anchor?.facing ?? link.targetFacing),
  };
}

export function getIncomingLinksForLink(
  targetLink: LocationLink,
  currentMap: GameMap | null | undefined,
  maps: GameMap[],
): Array<{ map: GameMap; link: LocationLink }> {
  if (!currentMap) return [];

  const results: Array<{ map: GameMap; link: LocationLink }> = [];
  for (const map of maps) {
    for (const link of map.locationLinks ?? []) {
      const pointsToMap = (link.targetMapId || currentMap.id) === currentMap.id;
      if (!pointsToMap) continue;
      if (link.targetLinkId === targetLink.id) {
        results.push({ map, link });
      }
    }
  }

  return results;
}

export function getDefaultLinkTargetPosition(
  sourcePosition: [number, number],
  triggerSize: [number, number],
  tileSize: number,
): [number, number] {
  const centerX = Math.round(sourcePosition[0] + triggerSize[0] / 2);
  const belowY = Math.round(sourcePosition[1] + triggerSize[1] + tileSize);
  return [centerX, belowY];
}
