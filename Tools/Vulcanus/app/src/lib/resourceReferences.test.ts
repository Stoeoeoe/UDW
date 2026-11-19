import { describe, expect, it } from 'vitest';
import { allReferences, usedBy, usesOf, type ReferenceSources } from './resourceReferences';
import type { Quest } from '../types/quest';
import type { Routine } from '../types/routine';

const sources: ReferenceSources = {
  characters: [
    {
      id: 'base:fabia',
      name: 'Fabia',
      dialogues: [{ dialogue: 'base:wary' }, { dialogue: 'base:friendly' }],
    },
  ],
  quests: [
    {
      formatVersion: 1,
      id: 'base:favour',
      title: 'Favour',
      description: '',
      giver: 'base:fabia',
      steps: [
        {
          id: 'ask',
          journal: '',
          objectives: [
            {
              id: 'talk',
              text: 'Talk to Fabia',
              kind: 'talk',
              character: 'base:fabia',
              dialogue: 'base:ask',
            },
            {
              id: 'seeds',
              text: 'Bring seeds',
              kind: 'deliver',
              character: 'base:fabia',
              item: 'base:seeds',
              count: 3,
            },
          ],
        },
      ],
    } as Quest,
  ],
  routines: [
    {
      formatVersion: 1,
      id: 'base:fabia_routine',
      character: 'base:fabia',
      home: { map: 'base:indoor', anchor: 'home' },
      dialogue: null,
      variants: [
        {
          id: 'default',
          goals: [
            {
              id: 'visit',
              departAt: '06:30',
              destination: { map: 'base:market', anchor: 'a' },
              dialogue: 'base:wary',
            },
            { id: 'home', departAt: '08:00', destination: 'home', walkingDialogue: null },
          ],
        },
      ],
    } as Routine,
  ],
  dialogues: [
    {
      id: 'base:ask',
      name: 'Ask',
      nodes: [
        { id: 'a', type: 'line', speaker: 'base:fabia', text: 'x', msgKey: 'k' },
        { id: 'b', type: 'line', speaker: 'base:fabia', text: 'y', msgKey: 'k2' },
        { id: 'c', type: 'jump', targetDialogueId: 'base:wary', targetNodeId: 'a' },
      ],
    } as never,
  ],
  shops: [
    {
      id: 'base:stall',
      name: 'Stall',
      buysGoods: false,
      offerings: [{ itemId: 'base:seeds', price: 1 }],
    },
  ],
};

describe('resource references', () => {
  const references = allReferences(sources);

  it('finds what uses a dialogue, whichever resource type points at it', () => {
    const users = usedBy(references, { type: 'dialogue', id: 'base:wary' }).map(
      (reference) => `${reference.from.type}:${reference.from.id} ${reference.via}`,
    );
    expect(users).toEqual([
      'character:base:fabia Dialogue 1',
      'routine:base:fabia_routine Goal visit',
      'dialogue:base:ask Jump',
    ]);
  });

  it('lists what a quest uses, with the objective as the reason', () => {
    expect(
      usesOf(references, { type: 'quest', id: 'base:favour' }).map(
        (r) => `${r.to.type}:${r.to.id} ${r.via}`,
      ),
    ).toEqual([
      'character:base:fabia Giver',
      'character:base:fabia Objective: Talk to Fabia',
      'dialogue:base:ask Objective: Talk to Fabia',
      'character:base:fabia Objective: Bring seeds',
      'item:base:seeds Objective: Bring seeds',
    ]);
  });

  it('skips nothing-to-say dialogues and repeated pointers', () => {
    expect(
      usedBy(references, { type: 'character', id: 'base:fabia' }).filter(
        (r) => r.from.type === 'dialogue',
      ),
    ).toHaveLength(1);
    expect(references.some((r) => r.to.id === 'null' || r.to.id === '')).toBe(false);
  });

  it('knows who sells an item', () => {
    expect(usedBy(references, { type: 'item', id: 'base:seeds' }).map((r) => r.from.type)).toEqual([
      'quest',
      'shop',
    ]);
  });
});
