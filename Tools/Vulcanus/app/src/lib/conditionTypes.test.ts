import { describe, expect, it } from 'vitest';
import { conditionTypeIssues } from './conditionTypes';
import { parseScriptingManifest } from './scriptingManifest';
import type { StoryValueDefinition } from '../types/schema';

// Shapes copied from Unity's Generated/Scripting/bindings.json.
const manifest = parseScriptingManifest({
  schemaVersion: 2,
  modules: [
    {
      path: 'DivineFavour',
      methods: [
        {
          name: 'GetFavour',
          parameters: [{ name: 'deityId', type: 'string' }],
          returnType: 'integer',
          outputs: [{ name: 'result', type: 'number', nullable: false }],
        },
      ],
    },
    {
      path: 'GameState.Story',
      methods: [
        { name: 'Has', parameters: [{ name: 'key', type: 'string' }], returnType: 'boolean' },
        {
          name: 'Get',
          parameters: [{ name: 'key', type: 'string' }],
          returnType: 'boolean|string|number|table',
          outputs: [{ name: 'value', type: 'storyValue', nullable: true }],
        },
      ],
    },
    {
      path: 'Weather',
      methods: [{ name: 'Current', parameters: [], returnType: 'string' }],
    },
  ],
});

const storyValues: StoryValueDefinition[] = [
  { key: 'visits', type: 'long' },
  { key: 'met_fabia', type: 'boolean' },
];

const messages = (text: string) =>
  conditionTypeIssues(text, manifest, storyValues, [{ name: 'count', type: 'number' }]).map(
    (issue) => issue.message,
  );

describe('conditionTypeIssues', () => {
  it('rejects a call that returns a number, and suggests a comparison', () => {
    expect(messages("DivineFavour.GetFavour('base:sun')")).toEqual([
      "DivineFavour.GetFavour('base:sun') is a number, which always counts as true. " +
        "Compare it, for example DivineFavour.GetFavour('base:sun') >= 1.",
    ]);
  });

  it('accepts comparisons, negations and boolean calls, however they are combined', () => {
    for (const text of [
      "DivineFavour.GetFavour('base:sun') >= 10",
      "not DivineFavour.GetFavour('base:sun')",
      "GameState.Story.Has('met_fabia') and (Weather.Current() == 'rain' or DivineFavour.GetFavour('x') > 2)",
      "GameState.Story.Get('met_fabia')",
      "GameState.Story.Get('undeclared')",
      'true',
      'Cutscene.Variables.count > 0',
    ])
      expect(messages(text), text).toEqual([]);
  });

  it('checks every operand of and/or, and inside brackets', () => {
    expect(messages("GameState.Story.Has('x') and Weather.Current()")).toEqual([
      "Weather.Current() is a string, which always counts as true. Compare it, for example Weather.Current() == 'value'.",
    ]);
    expect(messages("(GameState.Story.Get('visits'))")).toHaveLength(1);
    expect(messages('Cutscene.Variables.count or 1')).toHaveLength(2);
    expect(messages('nil')).toEqual(['nil is nil, so this is never true.']);
  });

  it('leaves expressions it cannot type alone', () => {
    for (const text of [
      'Unknown.Call()',
      "DivineFavour.GetFavour('x') + 1",
      "string.len('a')",
      "DivineFavour.GetFavour('x').field",
      "'unterminated",
    ])
      expect(messages(text), text).toEqual([]);
  });

  it('ignores keywords inside names and strings', () => {
    expect(messages("GameState.Story.Has('order and more')")).toEqual([]);
    expect(messages('Cutscene.Variables.count >= 1 or notify')).toEqual([]);
  });
});

describe('fields of returned tables', () => {
  const timeManifest = parseScriptingManifest({
    schemaVersion: 2,
    tables: [
      {
        name: 'TimeLuaView',
        fields: [
          { name: 'hour', type: 'integer' },
          { name: 'season', type: 'string' },
        ],
      },
    ],
    modules: [
      {
        path: 'Time',
        methods: [{ name: 'GetCurrent', parameters: [], returnType: 'TimeLuaView' }],
      },
    ],
  });
  const check = (text: string) => conditionTypeIssues(text, timeManifest).map((i) => i.message);

  it('knows the type of a field, so a bare field is flagged and a comparison is fine', () => {
    expect(check('Time.GetCurrent().hour')).toEqual([
      'Time.GetCurrent().hour is a number, which always counts as true. Compare it, for example Time.GetCurrent().hour >= 1.',
    ]);
    expect(check('Time.GetCurrent().hour >= 8')).toEqual([]);
    expect(check("Time.GetCurrent().season == 'summer'")).toEqual([]);
    expect(check('Time.GetCurrent()')).toHaveLength(1);
    expect(check('Time.GetCurrent().unknownField')).toEqual([]);
  });
});
