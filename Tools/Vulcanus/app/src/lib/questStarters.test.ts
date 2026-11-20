import { describe, expect, it } from 'vitest';
import type { Cutscene } from '../types/cutscene';
import type { Quest } from '../types/quest';
import type { DialogueDocument } from '../types/schema';
import { describeStartMoment, questStartedBy, startedQuestIds } from './questStarters';
import { questReferenceWarnings, questStartWarnings, validateQuest } from './quests';
import { withGraph } from './questGraph.fixture';

const quest = (extra: Partial<Quest> = {}): Quest =>
  withGraph({
    formatVersion: 1,
    id: 'base:wine',
    title: 'Wine',
    description: 'Bring wine.',
    steps: [
      {
        id: 'bring',
        journal: 'Bring it.',
        objectives: [{ id: 'carry', text: 'Carry', kind: 'condition', condition: 'false' }],
      },
    ],
    ...extra,
  });

const dialogue = (lua: string): DialogueDocument =>
  ({
    id: 'base:greeting',
    name: 'Greeting',
    nodes: [
      { id: 'say', type: 'line', text: 'Hi', msgKey: 'k', next: 'go' },
      { id: 'go', type: 'action', lua, next: null },
    ],
  }) as unknown as DialogueDocument;

describe('startedQuestIds', () => {
  it('finds literal quest IDs in either quote style, and nothing else', () => {
    expect(startedQuestIds(`Quests.Start('base:a')\nQuests.Start( "base:b" )`)).toEqual([
      'base:a',
      'base:b',
    ]);
    expect(startedQuestIds(`Quests.IsActive('base:a'); Quests.Start(id)`)).toEqual([]);
    expect(startedQuestIds(undefined)).toEqual([]);
  });
});

describe('questStartedBy', () => {
  it('lists dialogue nodes, cutscenes and other quests that start the quest', () => {
    const cutscene = {
      id: 'base:intro',
      sequence: [{ id: 's', action: 'Quests.Start', arguments: { questId: 'base:wine' } }],
    } as unknown as Cutscene;
    const other = quest({
      id: 'base:prologue',
      title: 'Prologue',
      onComplete: `Quests.Start("base:wine")`,
    });
    expect(
      questStartedBy('base:wine', {
        quests: [quest(), other],
        dialogues: new Map([
          ['base:greeting', dialogue(`Quests.Start('base:wine')`)],
          ['base:other', { ...dialogue(`Quests.Start('base:else')`), id: 'base:other' }],
        ]),
        cutscenes: [cutscene],
      }),
    ).toEqual([
      { kind: 'dialogue', id: 'base:greeting', name: 'Greeting', nodeId: 'go' },
      { kind: 'cutscene', id: 'base:intro', name: 'base:intro' },
      { kind: 'quest', id: 'base:prologue', name: 'Prologue' },
    ]);
  });
});

describe('start moments', () => {
  it('are described in words', () => {
    expect(describeStartMoment({ on: 'gameStart' })).toBe('A new game begins');
    expect(describeStartMoment({ on: 'newSeason', season: 'winter' })).toBe('Winter begins');
    expect(describeStartMoment({ on: 'divineFavour', deity: 'base:ceres', atLeast: 10 })).toBe(
      'Favour with base:ceres changes to 10 or more',
    );
  });

  it('validate their condition, map and deity, and warn about the clock', () => {
    const start = {
      when: [
        { on: 'locationChanged', map: 'base:nowhere' },
        { on: 'divineFavour', deity: 'base:unknown' },
        { on: 'everyTenMinutes' },
      ],
      condition: 'GameState.Story.Has(',
    } as const;
    const starting = quest({ start: { when: [...start.when], condition: start.condition } });
    expect(validateQuest(starting).join('\n')).toContain('Start condition');
    const warnings = questReferenceWarnings(
      starting,
      { characterIds: new Set(), itemIds: new Set(), dialogueIds: new Set(), maps: [] },
      { deity: [{ id: 'base:ceres', description: 'Ceres' }] },
    );
    expect(warnings).toContain('Start moment 1: unknown map base:nowhere.');
    expect(warnings).toContain('Start moment 2: unknown deity base:unknown.');
    expect(questStartWarnings(quest({ start: { when: [...start.when] } }))).toHaveLength(1);
    expect(questStartWarnings(quest({ start: { when: [{ on: 'newDay' }] } }))).toEqual([]);
  });
});
