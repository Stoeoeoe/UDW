import { describe, expect, it } from 'vitest';
import { buildLocationConnection } from './locationConnection';
import {
  connectionAnchor as anchor,
  connectionDraft,
  connectionMaps,
} from './__fixtures__/locationConnection';

describe('location connection authoring', () => {
  it('creates both journeys with independent arrival positions and facing, without mutating the input', () => {
    const maps = connectionMaps(),
      draft = connectionDraft();
    const result = buildLocationConnection(maps, draft, 16);
    expect(maps.every((map) => !map.locationLinks && !map.spatialPrimitives)).toBe(true);
    expect(result.maps[0].locationLinks![0]).toMatchObject({
      triggerId: 'outside-exit',
      targetMapId: 'base:inside',
      targetAnchorId: 'inside-arrival',
      linkType: 'door',
    });
    expect(result.maps[1].locationLinks![0]).toMatchObject({
      triggerId: 'inside-exit',
      targetMapId: 'base:outside',
      targetAnchorId: 'outside-arrival',
      linkType: 'open',
    });
    expect(result.maps[0].spatialPrimitives!.anchors![0]).toEqual(draft.source.anchor);
    expect(result.maps[1].spatialPrimitives!.anchors![0].facing).toEqual([-1, 0]);
  });

  it('supports a one-way link without authoring an unused return trigger or anchor', () => {
    const draft = connectionDraft();
    draft.twoWay = false;
    draft.source.anchor = null;
    draft.destination.trigger = null;
    const { maps } = buildLocationConnection(connectionMaps(), draft, 16);
    expect(maps[0].spatialPrimitives!.anchors).toBeUndefined();
    expect(maps[1].spatialPrimitives!.triggers).toBeUndefined();
    expect(maps[1].locationLinks).toBeUndefined();
  });

  it('reuses the current shared anchor without changing its position or facing', () => {
    const maps = connectionMaps(),
      draft = connectionDraft();
    const shared = anchor('inside-arrival', [1, 0]);
    maps[1].spatialPrimitives = { anchors: [shared] };
    const result = buildLocationConnection(maps, draft, 16);
    expect(result.maps[1].spatialPrimitives!.anchors).toEqual([shared]);
  });

  it('rejects incomplete arrival facing and leaves both maps unchanged', () => {
    const maps = connectionMaps(),
      draft = connectionDraft();
    draft.destination.anchor!.facing = [0, 0];
    expect(() => buildLocationConnection(maps, draft, 16)).toThrow(/facing/);
    expect(maps).toEqual(connectionMaps());
  });

  it('rejects cutscene triggers, occupied activation areas and rectangles outside the map', () => {
    const draft = connectionDraft(),
      maps = connectionMaps();
    draft.source.trigger!.type = 'cutscene';
    expect(() => buildLocationConnection(maps, draft, 16)).toThrow(/location link trigger/);
    draft.source.trigger!.type = 'locationLinkTrigger';
    maps[0].locationLinks = [
      {
        id: 'existing',
        triggerId: 'outside-exit',
        targetMapId: maps[1].id,
        targetAnchorId: 'shared',
      },
    ];
    expect(() => buildLocationConnection(maps, draft, 16)).toThrow(/already has/);
    maps[0].locationLinks = [];
    draft.source.trigger!.size = [999, 16];
    expect(() => buildLocationConnection(maps, draft, 16)).toThrow(/inside the map/);
  });

  it('supports two separate entrances on the same map', () => {
    const draft = connectionDraft();
    draft.destination.mapId = draft.source.mapId;
    const result = buildLocationConnection(connectionMaps(), draft, 16);
    expect(result.maps).toHaveLength(1);
    expect(result.maps[0].locationLinks).toHaveLength(2);
    expect(result.maps[0].spatialPrimitives!.anchors).toHaveLength(2);
    draft.destination.trigger = draft.source.trigger;
    expect(() => buildLocationConnection(connectionMaps(), draft, 16)).toThrow(
      /separate activation/,
    );
  });
});
