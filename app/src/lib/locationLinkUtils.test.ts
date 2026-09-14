import { describe, it, expect } from 'vitest';
import {
  getMapAnchors,
  getMapTriggers,
  getAnchorById,
  getTriggerById,
  getLinkById,
  getLinkTargetMap,
  getTriggerCenter,
  resolveLinkTarget,
} from './locationLinkUtils';
import type { Map as GameMap, MapTrigger, Anchor, LocationLink } from '../types/schema';

const makeMap = (overrides: Partial<GameMap> = {}): GameMap => ({
  version: 1,
  id: 'map-1',
  name: 'Map 1',
  width: 10,
  height: 10,
  baseTilesetId: 'ts1',
  tilesetRefs: ['ts1'],
  layers: [],
  entities: [],
  ...overrides,
});

const anchor1: Anchor = {
  id: 'anc-1',
  name: 'South Gate',
  position: [100, 200],
  tags: [],
};

const anchor2: Anchor = {
  id: 'anc-2',
  name: 'North Gate',
  position: [50, 10],
  tags: [],
};

const rectTrigger: MapTrigger = {
  id: 'trig-1',
  type: 'locationLinkTrigger',
  shape: 'rectangle',
  position: [32, 48],
  size: [64, 32],
};

const polyTrigger: MapTrigger = {
  id: 'trig-2',
  type: 'locationLinkTrigger',
  shape: 'polygon',
  position: [0, 0],
  points: [
    [10, 20],
    [30, 20],
    [20, 40],
  ],
};

const link1: LocationLink = {
  id: 'link-1',
  triggerId: 'trig-1',
  targetMapId: 'map-2',
  targetAnchorId: 'anc-1',
};

describe('locationLinkUtils', () => {
  describe('getMapAnchors', () => {
    it('returns empty array for null map', () => {
      expect(getMapAnchors(null)).toEqual([]);
    });

    it('returns empty array for undefined map', () => {
      expect(getMapAnchors(undefined)).toEqual([]);
    });

    it('returns empty array when no spatialPrimitives', () => {
      expect(getMapAnchors(makeMap())).toEqual([]);
    });

    it('returns empty array when spatialPrimitives has no anchors', () => {
      expect(getMapAnchors(makeMap({ spatialPrimitives: {} }))).toEqual([]);
    });

    it('returns anchors from spatialPrimitives', () => {
      const map = makeMap({ spatialPrimitives: { anchors: [anchor1, anchor2] } });
      expect(getMapAnchors(map)).toEqual([anchor1, anchor2]);
    });
  });

  describe('getMapTriggers', () => {
    it('returns empty array for null map', () => {
      expect(getMapTriggers(null)).toEqual([]);
    });

    it('returns empty array when no spatialPrimitives', () => {
      expect(getMapTriggers(makeMap())).toEqual([]);
    });

    it('returns triggers from spatialPrimitives', () => {
      const map = makeMap({ spatialPrimitives: { triggers: [rectTrigger, polyTrigger] } });
      expect(getMapTriggers(map)).toEqual([rectTrigger, polyTrigger]);
    });
  });

  describe('getAnchorById', () => {
    const map = makeMap({ spatialPrimitives: { anchors: [anchor1, anchor2] } });

    it('returns undefined for null map', () => {
      expect(getAnchorById(null, 'anc-1')).toBeUndefined();
    });

    it('returns undefined for undefined anchorId', () => {
      expect(getAnchorById(map, undefined)).toBeUndefined();
    });

    it('returns undefined for unknown anchorId', () => {
      expect(getAnchorById(map, 'unknown')).toBeUndefined();
    });

    it('returns the matching anchor', () => {
      expect(getAnchorById(map, 'anc-1')).toEqual(anchor1);
      expect(getAnchorById(map, 'anc-2')).toEqual(anchor2);
    });
  });

  describe('getTriggerById', () => {
    const map = makeMap({ spatialPrimitives: { triggers: [rectTrigger, polyTrigger] } });

    it('returns undefined for null map', () => {
      expect(getTriggerById(null, 'trig-1')).toBeUndefined();
    });

    it('returns undefined for undefined triggerId', () => {
      expect(getTriggerById(map, undefined)).toBeUndefined();
    });

    it('returns undefined for unknown triggerId', () => {
      expect(getTriggerById(map, 'trig-99')).toBeUndefined();
    });

    it('returns the matching trigger', () => {
      expect(getTriggerById(map, 'trig-1')).toEqual(rectTrigger);
      expect(getTriggerById(map, 'trig-2')).toEqual(polyTrigger);
    });
  });

  describe('getLinkById', () => {
    const map = makeMap({ locationLinks: [link1] });

    it('returns undefined for null map', () => {
      expect(getLinkById(null, 'link-1')).toBeUndefined();
    });

    it('returns undefined for undefined linkId', () => {
      expect(getLinkById(map, undefined)).toBeUndefined();
    });

    it('returns undefined when no locationLinks on map', () => {
      expect(getLinkById(makeMap(), 'link-1')).toBeUndefined();
    });

    it('returns undefined for unknown linkId', () => {
      expect(getLinkById(map, 'link-99')).toBeUndefined();
    });

    it('returns the matching link', () => {
      expect(getLinkById(map, 'link-1')).toEqual(link1);
    });
  });

  describe('getLinkTargetMap', () => {
    const map1 = makeMap({ id: 'map-1' });
    const map2 = makeMap({ id: 'map-2' });

    it('returns undefined when target map is not in the list', () => {
      expect(getLinkTargetMap(link1, [map1])).toBeUndefined();
    });

    it('returns the target map when found', () => {
      expect(getLinkTargetMap(link1, [map1, map2])).toEqual(map2);
    });
  });

  describe('getTriggerCenter', () => {
    it('computes center of a rectangle trigger', () => {
      // position [32, 48], size [64, 32] → center = [32+32, 48+16] = [64, 64]
      expect(getTriggerCenter(rectTrigger)).toEqual([64, 64]);
    });

    it('computes center of a rectangle trigger with no size (defaults to [0,0])', () => {
      const noSizeTrigger: MapTrigger = {
        id: 'trig-3',
        type: 'locationLinkTrigger',
        shape: 'rectangle',
        position: [10, 20],
      };
      expect(getTriggerCenter(noSizeTrigger)).toEqual([10, 20]);
    });

    it('computes centroid of a polygon trigger', () => {
      // points: [10,20],[30,20],[20,40] → centroid = [(10+30+20)/3, (20+20+40)/3] = [20, ~26.67]
      const [cx, cy] = getTriggerCenter(polyTrigger);
      expect(cx).toBeCloseTo(20, 5);
      expect(cy).toBeCloseTo(80 / 3, 5);
    });

    it('falls back to position for polygon trigger with no points', () => {
      const emptyPolyTrigger: MapTrigger = {
        id: 'trig-4',
        type: 'locationLinkTrigger',
        shape: 'polygon',
        position: [5, 15],
        points: [],
      };
      expect(getTriggerCenter(emptyPolyTrigger)).toEqual([5, 15]);
    });
  });

  describe('resolveLinkTarget', () => {
    const sourceMap = makeMap({ id: 'source' });
    const targetMap = makeMap({
      id: 'map-2',
      spatialPrimitives: { anchors: [anchor1] },
    });

    it('returns undefined for both when target map is not found', () => {
      const result = resolveLinkTarget(link1, [sourceMap]);
      expect(result.targetMap).toBeUndefined();
      expect(result.anchor).toBeUndefined();
    });

    it('returns target map and anchor when both are found', () => {
      const result = resolveLinkTarget(link1, [sourceMap, targetMap]);
      expect(result.targetMap).toEqual(targetMap);
      expect(result.anchor).toEqual(anchor1);
    });

    it('returns target map but undefined anchor when anchor is not found', () => {
      const linkBadAnchor: LocationLink = {
        ...link1,
        targetAnchorId: 'anc-missing',
      };
      const result = resolveLinkTarget(linkBadAnchor, [sourceMap, targetMap]);
      expect(result.targetMap).toEqual(targetMap);
      expect(result.anchor).toBeUndefined();
    });
  });
});
