import { describe, expect, it } from 'vitest';
import {
  bindingCompletions,
  bindingSnippet,
  bindingSymbols,
  luaCallContext,
  bindingDiagnostics,
  CONDITION_SCOPE,
  SCRIPT_SCOPE,
} from './luaBindings';
import { parseScriptingManifest } from './scriptingManifest';
import unityBindings from './__fixtures__/unity-bindings-v2.json';

const manifest = parseScriptingManifest({
  schemaVersion: 2,
  resources: { direction: [{ id: 'south', description: 'Face down' }] },
  modules: [
    {
      path: 'Game.Characters',
      methods: [
        {
          name: 'Face',
          parameters: [
            { name: 'character', type: 'string', semanticType: 'characterRef' },
            { name: 'direction', type: 'string', resourceType: 'direction' },
          ],
          returnType: 'boolean',
          returnNullable: true,
          description: 'Turn a character',
        },
      ],
    },
  ],
});
const symbols = bindingSymbols(manifest);

describe('Lua bindings intelligence', () => {
  it('includes ordinary methods, exact exported paths, signatures and documentation', () => {
    expect(symbols.map((s) => s.label)).toEqual([
      'Game',
      'Game.Characters',
      'Game.Characters.Face',
    ]);
    expect(symbols[2]).toMatchObject({
      detail: 'Game.Characters.Face(character: string, direction: string): boolean | nil',
      description: 'Turn a character',
    });
    expect(bindingSnippet(symbols[2])).toBe('Game.Characters.Face(${1:character}, ${2:direction})');
  });

  it('replaces the full partial path without duplicating the receiver', () => {
    const text = 'local x = Game.Characters.Fa';
    const result = bindingCompletions(text, symbols);
    expect(result.options.map((s) => s.label)).toEqual(['Game.Characters.Face']);
    expect(text.slice(0, result.from) + result.options[0].label).toBe(
      'local x = Game.Characters.Face',
    );
    expect(bindingCompletions('Game.', symbols).options.map((s) => s.label)).toEqual([
      'Game.Characters',
    ]);
  });

  it('tracks arguments across nested calls, tables, strings and comments', () => {
    expect(luaCallContext('Game.Characters.Face(other({1,2}, "a,b"), ')).toMatchObject({
      name: 'Game.Characters.Face',
      argument: 1,
    });
    expect(luaCallContext('Game.Characters.Face("x", -- ignored , (\n')).toMatchObject({
      argument: 1,
    });
    expect(luaCallContext('Game.Characters.Face("x", "south")')).toBeNull();
  });

  it('completes quoted resources and project characters only in matching arguments', () => {
    const characters = [{ id: 'host', name: 'Village host' }];
    expect(
      bindingCompletions('Game.Characters.Face("h', symbols, manifest.resources, characters),
    ).toMatchObject({ string: true, options: [{ label: 'host', detail: 'Village host' }] });
    expect(
      bindingCompletions('Game.Characters.Face("host", "s', symbols, manifest.resources).options,
    ).toEqual([{ label: 'south', insertText: 'south', type: 'constant', detail: 'Face down' }]);
    expect(bindingCompletions('local x = "s', symbols, manifest.resources).options).toEqual([]);
  });

  it('suppresses code suggestions in comments and long strings', () => {
    for (const text of ['-- Game.', '--[=[ Game.', 'local x = [==[ Game.', '"Game.'])
      expect(bindingCompletions(text, symbols).options).toEqual([]);
    expect(
      bindingCompletions('--[=[ ignored ]=]\nGame.Characters.F', symbols).options,
    ).toHaveLength(1);
  });

  it('drops old bindings when the manifest is replaced or invalidated', () => {
    expect(bindingCompletions('Game.', bindingSymbols(null)).options).toEqual([]);
    const replacement = parseScriptingManifest({
      schemaVersion: 2,
      modules: [{ path: 'Weather', methods: [] }],
    });
    expect(bindingCompletions('Game.', bindingSymbols(replacement)).options).toEqual([]);
  });

  it('inserts quoted actor IDs into bare arguments and leaves existing quotes intact', () => {
    const actors = [
      { id: 'player', name: 'Player' },
      { id: 'guest-01', name: 'Guest' },
    ];
    const text = 'Game.Characters.Face(  pl';
    const result = bindingCompletions(text, symbols, {}, actors);
    expect(result.options[0]).toMatchObject({
      label: 'player',
      insertText: '"player"',
      detail: 'Player - current player actor',
    });
    expect(text.slice(0, result.from) + result.options[0].insertText).toBe(
      'Game.Characters.Face(  "player"',
    );
    const quoted = bindingCompletions("Game.Characters.Face('pl", symbols, {}, actors);
    expect(quoted.options[0].insertText).toBe('player');
    expect(bindingCompletions('Game.Characters.Face(', symbols, {}, actors).options).toHaveLength(
      2,
    );
    expect(
      bindingCompletions('Game.Characters.Face({ ', symbols, {}, actors).options.some(
        (s) => s.type === 'constant',
      ),
    ).toBe(false);
  });

  it('resolves anchors and dialogues by semantic metadata and escapes inserted IDs', () => {
    const semantic = bindingSymbols(
      parseScriptingManifest({
        schemaVersion: 2,
        modules: [
          {
            path: 'Scene',
            methods: [
              {
                name: 'Anchor',
                parameters: [{ name: 'where', type: 'string', semanticType: 'anchorRef' }],
              },
              {
                name: 'Talk',
                parameters: [{ name: 'what', type: 'string', semanticType: 'dialogueRef' }],
              },
            ],
          },
        ],
      }),
    );
    const refs = {
      anchors: [{ id: 'door-01', name: 'Door' }],
      dialogues: [{ id: 'base:hello', name: 'Greeting' }],
    };
    expect(bindingCompletions('Scene.Anchor(', semantic, {}, [], refs).options[0].insertText).toBe(
      '"door-01"',
    );
    expect(bindingCompletions('Scene.Talk(', semantic, {}, [], refs).options[0].insertText).toBe(
      '"base:hello"',
    );
    const resource = bindingCompletions('Game.Characters.Face("host", ', symbols, {
      direction: [{ id: 'a"b\\c', description: '' }],
    });
    expect(resource.options[0].insertText).toBe(JSON.stringify('a"b\\c'));
  });

  it('matches the shipped runtime: RunLua and conditions do not expose action APIs', () => {
    const shipped = parseScriptingManifest(unityBindings);
    for (const scope of [SCRIPT_SCOPE, CONDITION_SCOPE]) {
      const names = bindingSymbols(shipped, scope).map((s) => s.label);
      expect(names).not.toContain('Characters.Face');
      expect(names).not.toContain('Cutscene.Wait');
      expect(names).not.toContain('Cutscene.RunLua');
    }
    const writes = parseScriptingManifest({
      schemaVersion: 2,
      modules: [
        {
          path: 'Story',
          methods: [
            { name: 'HasFlag', parameters: [], writesState: false },
            { name: 'SetFlag', parameters: [], writesState: true },
          ],
        },
      ],
    });
    expect(bindingSymbols(writes, CONDITION_SCOPE).map((s) => s.label)).toEqual([
      'Story',
      'Story.HasFlag',
    ]);
    expect(bindingSymbols(writes, SCRIPT_SCOPE).map((s) => s.label)).toContain('Story.SetFlag');
  });

  it('limits action sessions to the current context and phase', () => {
    const shipped = parseScriptingManifest(unityBindings);
    const names = (context: string, phase: 'setup' | 'sequence' | 'completion') =>
      bindingSymbols(shipped, { mode: 'actions', context, phase }).map((s) => s.label);
    expect(names('cutscene', 'sequence')).toContain('Cutscene.Wait');
    expect(names('cutscene', 'completion')).not.toContain('Cutscene.Wait');
    expect(names('cutscene', 'completion')).toContain('Characters.Face');
    expect(names('npcRoutine', 'sequence')).not.toContain('Cutscene.Wait');
    expect(names('cutscene', 'sequence')).not.toContain('GameState.Story.SetFlag');
  });

  it('diagnoses direct unavailable calls without flagging strings, comments, locals or parameters', () => {
    const shipped = parseScriptingManifest(unityBindings);
    const text =
      '-- Characters.Face()\nlocal text = "Characters.Face()"\nCharacters.Face("player", "host")';
    const issues = bindingDiagnostics(text, shipped, SCRIPT_SCOPE);
    expect(issues).toHaveLength(1);
    expect(text.slice(issues[0].from, issues[0].to)).toBe('Characters.Face');
    expect(issues[0].message).toContain('separate action step');
    for (const code of [
      'local Characters = {}\nCharacters.Face()',
      'local function f(Characters) Characters.Face() end',
      'function Characters.Face() end',
    ])
      expect(bindingDiagnostics(code, shipped, SCRIPT_SCOPE)).toEqual([]);
    expect(
      bindingDiagnostics('Cutscene.Wait(1)', shipped, {
        mode: 'actions',
        context: 'cutscene',
        phase: 'completion',
      })[0].message,
    ).toContain('completion phase');
    expect(bindingDiagnostics('Characters.Unknown()', shipped, SCRIPT_SCOPE)).toEqual([]);
  });
});
