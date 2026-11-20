import { describe, expect, it } from 'vitest';
import { questI18n, questReferenceWarnings, validateQuest } from './quests';
import { withGraph } from './questGraph.fixture';
import { bindingCompletions } from './luaBindings';
import { parseScriptingManifest } from './scriptingManifest';
import { normalizeResourceDocument } from './resourceRegistry';
import type { Quest } from '../types/quest';
import type { Map as GameMap } from '../types/schema';

// The quest authoring example in Assets/Core/Quests/README.md, with every objective kind.
export const festivalQuest: Quest = withGraph({
  formatVersion: 1,
  id: 'base:festival_wine',
  title: 'Wine for the festival',
  description: 'The priestess needs wine.',
  giver: 'base:fabia',
  onComplete: 'Wallet.AddMoney(50)',
  steps: [
    {
      id: 'buy',
      journal: 'Buy two amphorae of wine.',
      deadline: { days: 2, at: '18:00' },
      objectives: [
        { id: 'carry', kind: 'have', item: 'base:wine', count: 2, text: 'Wine' },
        {
          id: 'ask',
          kind: 'talk',
          character: 'base:fabia',
          dialogue: 'base:festival',
          text: 'Ask Fabia',
        },
        {
          id: 'give',
          kind: 'deliver',
          character: 'base:fabia',
          item: 'base:wine',
          count: 2,
          text: 'Give wine',
        },
        {
          id: 'arrive',
          kind: 'reach',
          map: 'base:village',
          trigger: 'altar',
          text: 'Reach the altar',
        },
        {
          id: 'ready',
          kind: 'condition',
          condition: "Quests.IsActive('base:festival_wine')",
          text: 'Be ready',
        },
      ],
    },
  ],
});
const references = {
  characterIds: new Set(['base:fabia']),
  itemIds: new Set(['base:wine']),
  dialogueIds: new Set(['base:festival']),
  maps: [{ id: 'base:village', spatialPrimitives: { triggers: [{ id: 'altar' }] } }] as GameMap[],
};
const manifest = parseScriptingManifest({
  schemaVersion: 2,
  modules: [
    {
      path: 'Quests',
      methods: [
        {
          name: 'Start',
          parameters: [{ name: 'questId', type: 'string' }],
          writesState: true,
          returnType: 'void',
        },
        {
          name: 'IsActive',
          parameters: [{ name: 'questId', type: 'string' }],
          returnType: 'boolean',
        },
      ],
    },
  ],
});

describe('quest authoring contract', () => {
  it('accepts all objective kinds and parses game calls without running them', () => {
    expect(validateQuest(festivalQuest, manifest)).toEqual([]);
    expect(questReferenceWarnings(festivalQuest, references, {})).toEqual([]);
  });
  it('warns about unknown content, including triggers scoped to the chosen map, without blocking', () => {
    const warnings = questReferenceWarnings(
      festivalQuest,
      {
        characterIds: new Set(),
        itemIds: new Set(),
        dialogueIds: new Set(),
        maps: references.maps.map((m) => ({ ...m, spatialPrimitives: { triggers: [] } })),
      },
      {},
    );
    for (const kind of ['character', 'item', 'dialogue', 'trigger'])
      expect(warnings.some((e) => e.includes(`unknown ${kind}`))).toBe(true);
    expect(
      questReferenceWarnings(festivalQuest, { ...references, maps: [] }, {}).some((e) =>
        e.includes('unknown map'),
      ),
    ).toBe(true);
    expect(
      questReferenceWarnings(
        festivalQuest,
        { ...references, maps: [{ ...references.maps[0], id: 'base:Village' }] },
        {},
      ),
    ).toContain('buy.arrive: unknown map base:village.');
  });
  it('rejects empty steps, duplicate IDs, invalid deadlines, syntax and writes in conditions', () => {
    const quest = structuredClone(festivalQuest);
    quest.steps[0].objectives.push({ ...quest.steps[0].objectives[0] });
    quest.steps.push({
      id: 'wait',
      journal: 'Wait',
      objectives: [],
      failWhen: "Quests.Start('base:festival_wine')",
      deadline: { days: -1, at: '25:00' },
      onComplete: 'if then',
    });
    const errors = validateQuest(withGraph(quest), manifest);
    for (const part of [
      'objectives',
      'duplicate ID',
      'deadline.days',
      'deadline.at',
      'State-changing',
      'onComplete',
    ])
      expect(errors.some((e) => e.includes(part))).toBe(true);
  });
  it('exports stable message keys and updated source text', () => {
    const exported = questI18n(festivalQuest);
    expect(exported.questId).toBe(festivalQuest.id);
    expect(exported.messages).toContainEqual({
      msgKey: 'quest.base:festival_wine.buy.carry.text',
      text: 'Wine',
    });
    expect(questI18n({ ...festivalQuest, title: 'Changed title' }).messages[0]).toEqual({
      msgKey: 'quest.base:festival_wine.title',
      text: 'Changed title',
    });
  });
  it('preserves other mods and local step IDs through normalization', () => {
    const normalized = normalizeResourceDocument(
      { ...festivalQuest, id: 'festival_wine', giver: 'fabia' },
      'quest',
      'expansion',
    );
    expect(normalized.id).toBe('expansion:festival_wine');
    expect(normalized.giver).toBe('expansion:fabia');
    expect(normalized.steps[0].objectives[0]).toEqual(festivalQuest.steps[0].objectives[0]);
    expect(normalized.steps[0].id).toBe('buy');
  });
  it('completes quest IDs and only steps belonging to the first argument', () => {
    const quests = [
      festivalQuest,
      {
        ...festivalQuest,
        id: 'mod:other',
        steps: [{ id: 'other_step', journal: 'Other', objectives: [] }],
      },
    ];
    const complete = (code: string) =>
      bindingCompletions(code, [], {}, [], { quests }).options.map((o) => o.label);
    expect(complete('Quests.Start("')).toEqual(['base:festival_wine', 'mod:other']);
    expect(complete("Quests.IsOnStep('base:festival_wine', '")).toEqual(['buy']);
    expect(complete('Quests.IsOnStep("mod:other", ')).toEqual(['other_step']);
    expect(complete('Quests.IsOnStep("missing:id", "')).toEqual([]);
    expect(complete('-- Quests.Start("')).toEqual([]);
  });
});
