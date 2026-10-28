import { describe, expect, it } from 'vitest';
import { storyValueDiagnostics, validateStoryValueDeclarations } from './storyValues';
import { normalizeProject } from './resourceRegistry';
import { bindingCompletions } from './luaBindings';
import { buildWorkspaceTree } from './workspaceTree';
import {
  createWorkspaceScreenDocument,
  documentFromHash,
  documentToHash,
} from './workspaceRouting';
import { getWorkspaceTabId } from '../store/useWorkspaceStore';
import type { StoryValueDefinition } from '../types/schema';

const declarations: StoryValueDefinition[] = [
  { key: 'met', type: 'boolean', description: 'Met the blacksmith' },
  { key: 'quest', type: 'object' },
  { key: 'count', type: 'long' },
  { key: 'score', type: 'double' },
  { key: 'name', type: 'string' },
];

describe('story value authoring', () => {
  it('rejects malformed declarations when accepting project data', () => {
    expect(() => validateStoryValueDeclarations(declarations)).not.toThrow();
    expect(() => validateStoryValueDeclarations([declarations[0], declarations[0]])).toThrow(
      'unique',
    );
    expect(() => validateStoryValueDeclarations([{ key: ' ', type: 'boolean' }])).toThrow(
      'nonempty',
    );
    const project = {
      id: 'test',
      version: '1.0',
      name: 'Test',
      tileSize: 16,
      defaultMapWidth: 16,
      defaultMapHeight: 16,
    };
    expect(() =>
      normalizeProject({ ...project, storyValues: [declarations[0], declarations[0]] }),
    ).toThrow('unique');
    expect(normalizeProject({ ...project, storyValues: declarations }).storyValues).toEqual(
      declarations,
    );
  });
  it('warns for undeclared literal keys and obvious type mismatches', () => {
    expect(storyValueDiagnostics("GameState.Story.Get('typo')", declarations)[0].message).toContain(
      'not declared in Data',
    );
    expect(
      storyValueDiagnostics("GameState.Story.Set('met', 1)", declarations)[0].message,
    ).toContain('literal is long');
    expect(storyValueDiagnostics("GameState.Story.Set('count', 1.5)", declarations)).toHaveLength(
      1,
    );
    expect(storyValueDiagnostics("GameState.Story.Set('quest', true)", declarations)).toHaveLength(1);
    expect(storyValueDiagnostics("GameState.Story.Set('name', true)", declarations)).toHaveLength(
      1,
    );
    expect(storyValueDiagnostics("GameState.Story.Set('score', 3)", declarations)).toHaveLength(0);
    expect(
      storyValueDiagnostics("GameState.Story.Set('quest', { stage = 2 })", declarations),
    ).toHaveLength(0);
    expect(storyValueDiagnostics("GameState.Story.Set('name', 'Ada')", declarations)).toHaveLength(
      0,
    );
  });

  it('does not mistake comments, strings, dynamic keys or shadowed API calls for declarations', () => {
    for (const text of [
      "-- GameState.Story.Get('typo')",
      'local example = "GameState.Story.Get(\'typo\')"',
      'GameState.Story.Get(key)',
      "GameState.Story.Get('ty' .. 'po')",
      "local GameState = other; GameState.Story.Get('typo')",
      "other.GameState.Story.Get('typo')",
    ])
      expect(storyValueDiagnostics(text, declarations)).toEqual([]);
  });

  it('completes declared keys within story calls, including without a manifest', () => {
    const result = bindingCompletions('GameState.Story.Get("me', [], {}, [], {
      storyValues: declarations,
    });
    expect(result.options).toHaveLength(1);
    expect(result.options[0]).toMatchObject({ label: 'met', insertText: 'met' });
    expect(
      bindingCompletions('GameState.Story.Set("met", "', [], {}, [], { storyValues: declarations })
        .options,
    ).toEqual([]);
  });

  it('opens Data as its own workspace document and restores its route', () => {
    const document = createWorkspaceScreenDocument('data');
    const snapshot = {
      maps: [],
      tilesets: new Map(),
      characters: [],
      entityTypes: [],
      items: [],
      dialogues: [],
      gameVariables: [],
    };
    expect(documentFromHash(documentToHash(document), snapshot)).toEqual(document);
    expect(getWorkspaceTabId(document)).toBe('data');
    expect(buildWorkspaceTree(snapshot).find((node) => node.id === 'data')?.document).toEqual(
      document,
    );
  });
});
