import type { Anchor, LocationLink, Map as GameMap, MapTrigger } from '../types/schema';

export interface ConnectionSide {
  mapId: string;
  trigger: MapTrigger | null;
  anchor: Anchor | null;
  linkType: 'door' | 'open';
}

export interface LocationConnection {
  label: string;
  source: ConnectionSide;
  destination: ConnectionSide;
  twoWay: boolean;
}

/** Validate the complete authoring draft before changing either map. Existing objects stay shared. */
export function buildLocationConnection(
  maps: GameMap[],
  draft: LocationConnection,
  tileSize: number,
): { maps: GameMap[]; linkId: string } {
  const changed = new Map<string, GameMap>();
  for (const side of [draft.source, draft.destination]) {
    const map = maps.find((entry) => entry.id === side.mapId);
    if (!map) throw new Error('Choose an existing map for both sides.');
    if (!changed.has(map.id)) changed.set(map.id, structuredClone(map));
  }
  const resolve = (side: ConnectionSide, needsTrigger: boolean, needsAnchor: boolean) => {
    const map = changed.get(side.mapId)!;
    map.spatialPrimitives ??= {};
    const spatial = map.spatialPrimitives;
    let trigger: MapTrigger | undefined;
    let anchor: Anchor | undefined;
    const validPoint = ([x, y]: [number, number]) =>
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= 0 &&
      y >= 0 &&
      x < map.width * tileSize &&
      y < map.height * tileSize;
    if (needsTrigger) {
      if (!side.trigger) throw new Error('Place or select an activation area.');
      trigger = spatial.triggers?.find((item) => item.id === side.trigger!.id);
      if (!trigger) {
        trigger = side.trigger;
        if (
          trigger.shape !== 'rectangle' ||
          !validPoint(trigger.position) ||
          !trigger.size ||
          trigger.size.some((value) => !Number.isFinite(value) || value <= 0) ||
          trigger.position[0] + trigger.size[0] > map.width * tileSize ||
          trigger.position[1] + trigger.size[1] > map.height * tileSize
        )
          throw new Error('Place an activation rectangle inside the map.');
        (spatial.triggers ??= []).push(trigger);
      }
      if (trigger.type !== 'locationLinkTrigger')
        throw new Error('Choose a location link trigger.');
      if (map.locationLinks?.some((link) => link.triggerId === trigger!.id))
        throw new Error('This activation area already has a location link.');
    }
    if (needsAnchor) {
      if (!side.anchor) throw new Error('Place or select an arrival anchor.');
      anchor = spatial.anchors?.find((item) => item.id === side.anchor!.id);
      if (!anchor) {
        anchor = side.anchor;
        (spatial.anchors ??= []).push(anchor);
      }
      if (
        !validPoint(anchor.position) ||
        !anchor.facing ||
        !anchor.facing.every(Number.isFinite) ||
        Math.hypot(...anchor.facing) < 0.0001
      )
        throw new Error(
          'The arrival anchor needs a position inside the map and a facing direction.',
        );
    }
    return { map, trigger, anchor };
  };
  const source = resolve(draft.source, true, draft.twoWay);
  const destination = resolve(draft.destination, draft.twoWay, true);
  if (
    draft.twoWay &&
    source.map === destination.map &&
    source.trigger!.id === destination.trigger!.id
  )
    throw new Error('Choose a separate activation area for the return journey.');
  const createLink = (from: typeof source, to: typeof source, linkType: 'door' | 'open') => {
    const link: LocationLink = {
      id: `link-${crypto.randomUUID()}`,
      label: draft.label.trim() || `${from.map.name} → ${to.map.name}`,
      triggerId: from.trigger!.id,
      targetMapId: to.map.id,
      targetAnchorId: to.anchor!.id,
      linkType,
    };
    (from.map.locationLinks ??= []).push(link);
    return link.id;
  };
  const linkId = createLink(source, destination, draft.source.linkType);
  if (draft.twoWay) createLink(destination, source, draft.destination.linkType);
  return { maps: [...changed.values()], linkId };
}
