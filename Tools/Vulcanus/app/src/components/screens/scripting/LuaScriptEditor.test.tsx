import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LuaScriptEditor } from './LuaScriptEditor';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import { parseScriptingManifest } from '../../../lib/scriptingManifest';
import unityBindings from '../../../lib/__fixtures__/unity-bindings-v2.json';

const mock = vi.hoisted(() => ({
  completions: [] as { provider: any; dispose: ReturnType<typeof vi.fn> }[],
  hovers: [] as any[],
  signatures: [] as any[],
  editors: [] as any[],
  markers: vi.fn(),
  lsp: { isAvailable: vi.fn(async () => false), start: vi.fn(), updateDocument: vi.fn() },
}));
vi.mock('../../../lib/lspClient', () => ({ getLspClient: () => mock.lsp }));
vi.mock('../../../store/useEditorStore', () => ({
  useEditorStore: (selector: (s: unknown) => unknown) => selector({ characters: [] }),
}));
vi.mock('@monaco-editor/react', () => ({
  default: (props: any) => {
    const ref = React.useRef<any>();
    if (!ref.current) {
      const state = { value: props.value, path: props.path };
      const model = {
        getValue: () => state.value,
        getOffsetAt: (p: any) => p.column - 1,
        getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }),
        isDisposed: () => false,
        getLineContent: () => state.value,
        getWordUntilPosition: (p: any) => ({ startColumn: p.column, endColumn: p.column }),
      };
      const editor = { getModel: () => model, updateOptions: vi.fn(), focus: vi.fn(), state };
      ref.current = editor;
    }
    ref.current.state.value = props.value;
    ref.current.state.path = props.path;
    React.useEffect(() => {
      // Monaco normally loads after the parent's first effects have already run.
      void Promise.resolve().then(() => {
        const register = (list: any[]) => (_language: string, provider: any) => {
          const dispose = vi.fn();
          list.push({ provider, dispose });
          return { dispose };
        };
        const monaco = {
          languages: {
            register: vi.fn(),
            setMonarchTokensProvider: vi.fn(),
            setLanguageConfiguration: vi.fn(),
            CompletionItemKind: { Variable: 1, Function: 2, Module: 3 },
            CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
            registerCompletionItemProvider: register(mock.completions),
            registerHoverProvider: register(mock.hovers),
            registerSignatureHelpProvider: register(mock.signatures),
          },
          editor: { defineTheme: vi.fn(), setModelMarkers: mock.markers },
          MarkerSeverity: { Warning: 4 },
        };
        mock.editors.push(ref.current);
        props.beforeMount(monaco);
        props.onMount(ref.current, monaco);
      });
    }, []);
    return <div data-testid="lua-editor" />;
  },
}));

const bindings = (name: string) =>
  parseScriptingManifest({
    schemaVersion: 2,
    modules: [
      {
        path: 'Characters',
        methods: [
          {
            name,
            parameters: [{ name: 'actor', type: 'string' }],
            returnType: 'nil',
          },
        ],
      },
    ],
  });
/** Renders, then opens every script in Monaco, as clicking each one does. */
const show = (ui: React.ReactElement) => {
  const view = render(ui);
  for (const preview of screen.getAllByRole('button', { name: 'Edit Lua script' }))
    fireEvent.click(preview);
  return view;
};
const latest = () => mock.completions.filter((p) => !p.dispose.mock.calls.length).at(-1)!.provider;
const complete = (editor: any, provider = latest()) =>
  provider.provideCompletionItems(editor.getModel(), {
    lineNumber: 1,
    column: editor.state.value.length + 1,
  });

beforeEach(() => {
  mock.markers.mockClear();
  mock.completions.length = mock.hovers.length = mock.signatures.length = mock.editors.length = 0;
  useScriptingManifestStore.setState({ manifest: bindings('Face') });
});
afterEach(cleanup);

describe('Lua script preview', () => {
  it('creates no Monaco editor until the script is clicked or focused', async () => {
    render(
      <>
        <LuaScriptEditor value="Characters.Face('player')" onChange={() => {}} />
        <LuaScriptEditor value="" onChange={() => {}} />
      </>,
    );
    expect(screen.getByText("Characters.Face('player')")).toBeTruthy();
    expect(screen.getByText('Click to write Lua')).toBeTruthy();
    expect(screen.queryByTestId('lua-editor')).toBeNull();
    fireEvent.focus(screen.getAllByRole('button', { name: 'Edit Lua script' })[0]);
    await waitFor(() => expect(mock.editors).toHaveLength(1));
    expect(mock.editors[0].focus).toHaveBeenCalled();
    expect(screen.getAllByTestId('lua-editor')).toHaveLength(1);
  });

  it('counts the binding problems Monaco would underline', () => {
    useScriptingManifestStore.setState({ manifest: parseScriptingManifest(unityBindings) });
    render(<LuaScriptEditor value={'Characters.Face("player", "host")'} onChange={() => {}} />);
    expect(screen.getByText('1 problem')).toBeTruthy();
  });
});

describe('Lua script editor providers', () => {
  it('filters action APIs and marks unavailable calls inside a regular Lua block', async () => {
    useScriptingManifestStore.setState({ manifest: parseScriptingManifest(unityBindings) });
    const view = show(
      <LuaScriptEditor documentId="block" value="Characters." onChange={() => {}} />,
    );
    await waitFor(() => expect(mock.completions.length).toBeGreaterThan(0));
    expect((await complete(mock.editors[0])).suggestions).toEqual([]);
    view.rerender(
      <LuaScriptEditor
        documentId="block"
        value={'Characters.Face("player", "host")'}
        onChange={() => {}}
      />,
    );
    expect(mock.markers).toHaveBeenCalledWith(expect.anything(), 'lua-bindings', [
      expect.objectContaining({
        message: expect.stringContaining('separate action step'),
        startColumn: 1,
        endColumn: 16,
      }),
    ]);
  });

  it('inserts quoted player IDs and updates permissions when an action phase changes', async () => {
    useScriptingManifestStore.setState({ manifest: parseScriptingManifest(unityBindings) });
    const actors = [{ id: 'player', name: 'Player' }];
    const view = show(
      <LuaScriptEditor
        value="Characters.Face("
        scope={{ mode: 'actions', context: 'cutscene', phase: 'sequence' }}
        characterReferences={actors}
        onChange={() => {}}
      />,
    );
    await waitFor(() => expect(mock.completions.length).toBeGreaterThan(0));
    expect((await complete(mock.editors[0])).suggestions).toContainEqual(
      expect.objectContaining({
        label: 'player',
        insertText: '"player"',
        detail: 'Player - current player actor',
      }),
    );
    view.rerender(
      <LuaScriptEditor
        value="Cutscene."
        scope={{ mode: 'actions', context: 'cutscene', phase: 'completion' }}
        onChange={() => {}}
      />,
    );
    expect((await complete(mock.editors[0])).suggestions.map((s: any) => s.label)).not.toContain(
      'Cutscene.Wait',
    );
    view.rerender(
      <LuaScriptEditor
        value="Cutscene."
        scope={{ mode: 'actions', context: 'cutscene', phase: 'sequence' }}
        onChange={() => {}}
      />,
    );
    expect((await complete(mock.editors[0])).suggestions.map((s: any) => s.label)).toContain(
      'Cutscene.Wait',
    );
  });
  it('registers on first asynchronous mount, replaces full paths and offers signatures without LuaLS', async () => {
    show(<LuaScriptEditor value="Characters.Fa" onChange={() => {}} />);
    await waitFor(() => expect(mock.completions.length).toBeGreaterThan(0));
    const editor = mock.editors[0];
    const result = await complete(editor);
    expect(result.suggestions).toContainEqual(
      expect.objectContaining({
        label: 'Characters.Face',
        insertText: 'Characters.Face(${1:actor})',
        range: expect.objectContaining({ startColumn: 1 }),
      }),
    );
    editor.state.value = 'Characters.Face(';
    const signature = mock.signatures.at(-1).provider.provideSignatureHelp(editor.getModel(), {
      lineNumber: 1,
      column: editor.state.value.length + 1,
    });
    expect(signature.value.signatures[0].label).toContain('actor: string');
  });

  it('refreshes and invalidates manifest completions live', async () => {
    show(<LuaScriptEditor value="Characters." onChange={() => {}} />);
    await waitFor(() => expect(mock.completions.length).toBeGreaterThan(0));
    act(() => useScriptingManifestStore.setState({ manifest: bindings('Walk') }));
    let result = await complete(mock.editors[0]);
    expect(result.suggestions.map((s: any) => s.label)).toEqual(['Characters.Walk']);
    act(() => useScriptingManifestStore.setState({ manifest: null }));
    result = await complete(mock.editors[0]);
    expect(result.suggestions).toEqual([]);
  });

  it('isolates simultaneous editors and disposes providers on unmount', async () => {
    const view = show(
      <>
        <LuaScriptEditor value="Characters." onChange={() => {}} />
        <LuaScriptEditor value="Characters." onChange={() => {}} />
      </>,
    );
    await waitFor(() => expect(mock.editors).toHaveLength(2));
    const active = mock.completions.filter((p) => !p.dispose.mock.calls.length);
    expect((await complete(mock.editors[1], active[0].provider)).suggestions).toEqual([]);
    expect((await complete(mock.editors[0], active[0].provider)).suggestions).toHaveLength(1);
    view.unmount();
    expect(active.every((p) => p.dispose.mock.calls.length === 1)).toBe(true);
  });

  it('changes model identity when the selected script changes', async () => {
    const view = show(
      <LuaScriptEditor documentId="first" value="Characters." onChange={() => {}} />,
    );
    await waitFor(() => expect(mock.editors).toHaveLength(1));
    const previous = mock.editors[0].state.path;
    view.rerender(
      <LuaScriptEditor documentId="second" value="Characters.Fa" onChange={() => {}} />,
    );
    expect(mock.editors[0].state.path).not.toBe(previous);
    expect((await complete(mock.editors[0])).suggestions[0].label).toBe('Characters.Face');
  });
});
