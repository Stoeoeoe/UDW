import { describe, expect, it } from 'vitest';
import { canReachMap } from './worldGraph';
import { validateRoutine } from './routines';
import type { Map as GameMap } from '../types/schema';
import type { Routine } from '../types/routine';

const map = (id: string, ...targets: string[]) =>
  ({
    id,
    name: id,
    spatialPrimitives: { anchors: [{ id: 'spot', name: 'spot', position: [8, 8], tags: [] }] },
    locationLinks: targets.map((targetMapId, i) => ({
      id: `link-${i}`,
      triggerId: `trigger-${i}`,
      targetMapId,
      targetAnchorId: 'spot',
    })),
  }) as unknown as GameMap;

// map-1 <-> town, town -> cellar; nothing leads back out of the cellar or to the island.
const maps = [
  map('base:map-1', 'base:town'),
  map('base:town', 'base:map-1', 'base:cellar'),
  map('base:cellar'),
  map('base:island'),
];

describe('world graph', () => {
  it('follows chains of one-way location links', () => {
    expect(canReachMap(maps, 'base:map-1', 'base:cellar')).toBe(true);
    expect(canReachMap(maps, 'base:cellar', 'base:map-1')).toBe(false);
    expect(canReachMap(maps, 'base:island', 'base:island')).toBe(true);
  });

  it('flags routine goals no link chain reaches from where the character comes from', () => {
    const goal = (id: string, departAt: string, mapId: string | null) => ({
      id,
      departAt,
      destination: mapId ? { map: mapId, anchor: 'spot' } : ('home' as const),
    });
    const routine: Routine = {
      formatVersion: 1,
      id: 'base:fabia_routine',
      character: 'base:fabia',
      home: { map: 'base:map-1', anchor: 'spot' },
      variants: [
        {
          id: 'default',
          goals: [
            goal('market', '08:00', 'base:town'),
            goal('cellar', '09:00', 'base:cellar'),
            goal('back_home', '10:00', null),
            goal('island', '12:00', 'base:island'),
          ],
        },
      ],
    };
    const messages = validateRoutine(routine, {
      maps,
      dialogueIds: new Set(),
      characterIds: new Set(['base:fabia']),
      animationIds: null,
      otherRoutines: [],
    }).map((issue) => issue.message);
    expect(messages).toEqual([
      'back_home goes to base:map-1, but no location links lead there from base:cellar.',
      'island goes to base:island, but no location links lead there from base:map-1.',
    ]);
  });
});
