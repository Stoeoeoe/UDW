import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConditionEditor } from './ConditionEditor';
import { parseScriptingManifest } from '../../../lib/scriptingManifest';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';

const mock = vi.hoisted(() => ({ props: null as any, source: null as any }));
vi.mock('@uiw/react-codemirror', () => ({
  default: (props: any) => {
    mock.props = props;
    return null;
  },
}));
vi.mock('@codemirror/autocomplete', async (original) => {
  const actual = await original<typeof import('@codemirror/autocomplete')>();
  return {
    ...actual,
    autocompletion: (config: any) => {
      mock.source = config.override[0];
      return actual.autocompletion(config);
    },
  };
});
vi.mock('../../../store/useEditorStore', () => ({
  useEditorStore: (selector: (s: unknown) => unknown) => selector({ characters: [] }),
}));
afterEach(cleanup);

describe('condition Lua language support', () => {
  it('hides writes from suggestions and explains unavailable calls', async () => {
    useScriptingManifestStore.setState({
      manifest: parseScriptingManifest({
        schemaVersion: 2,
        modules: [
          {
            path: 'Story',
            methods: [
              { name: 'Has', parameters: [], returnType: 'boolean' },
              { name: 'Set', parameters: [], writesState: true },
            ],
          },
        ],
      }),
    });
    render(
      <ChakraProvider>
        <ConditionEditor value="Story.Set(, true)" onChange={() => {}} />
      </ChakraProvider>,
    );
    await waitFor(() => expect(mock.source).not.toBeNull());
    const state = EditorState.create({ doc: 'Story.', extensions: mock.props.extensions });
    expect(
      mock
        .source(new CompletionContext(state, state.doc.length, true))
        .options.map((s: any) => s.label),
    ).toEqual(['Story.Has']);
    expect(
      screen.getByText(/State-changing calls are unavailable in conditions/),
    ).toBeInTheDocument();
  });

  it('inserts quoted resource IDs when completion opens at an empty argument', async () => {
    useScriptingManifestStore.setState({
      manifest: parseScriptingManifest({
        schemaVersion: 2,
        resources: { direction: [{ id: 'South', description: 'South' }] },
        modules: [
          {
            path: 'Weather',
            methods: [
              {
                name: 'Check',
                parameters: [{ name: 'direction', type: 'string', resourceType: 'direction' }],
              },
            ],
          },
        ],
      }),
    });
    render(
      <ChakraProvider>
        <ConditionEditor value="" onChange={() => {}} />
      </ChakraProvider>,
    );
    await waitFor(() => expect(mock.source).not.toBeNull());
    const state = EditorState.create({ doc: 'Weather.Check(', extensions: mock.props.extensions });
    expect(
      mock.source(new CompletionContext(state, state.doc.length, false)).options,
    ).toContainEqual(expect.objectContaining({ label: 'South', apply: '"South"' }));
  });
  it('registers a Lua grammar and refreshes bindings without a language server', async () => {
    const manifest = parseScriptingManifest({
      schemaVersion: 2,
      modules: [
        { path: 'Weather', methods: [{ name: 'IsRain', parameters: [], returnType: 'boolean' }] },
      ],
    });
    useScriptingManifestStore.setState({ manifest });
    render(
      <ChakraProvider>
        <ConditionEditor value="" onChange={() => {}} />
      </ChakraProvider>,
    );
    await waitFor(() => expect(mock.props).not.toBeNull());
    const state = EditorState.create({
      doc: 'true and Weather.IsRain()',
      extensions: mock.props.extensions,
    });
    const nodes: string[] = [];
    syntaxTree(state).iterate({
      enter: (node) => {
        nodes.push(node.name);
      },
    });
    expect(nodes.some((name) => name.includes('keyword') || name.includes('bool'))).toBe(true);
    const complete = () => {
      const completionState = EditorState.create({
        doc: 'Weather.Is',
        extensions: mock.props.extensions,
      });
      return mock.source(new CompletionContext(completionState, completionState.doc.length, true));
    };
    expect(complete().options).toContainEqual(expect.objectContaining({ label: 'Weather.IsRain' }));
    act(() => useScriptingManifestStore.setState({ manifest: null }));
    expect(complete().options).not.toContainEqual(
      expect.objectContaining({ label: 'Weather.IsRain' }),
    );
  });
});
