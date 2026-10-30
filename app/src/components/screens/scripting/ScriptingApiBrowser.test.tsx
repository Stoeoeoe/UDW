import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ScriptingApiBrowser } from './ScriptingApiBrowser';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import { parseScriptingManifest } from '../../../lib/scriptingManifest';
import { theme } from '../../../theme';

const manifest = parseScriptingManifest({
  schemaVersion: 2,
  modules: [
    {
      path: 'Scene',
      methods: [
        {
          name: 'Read',
          writesState: false,
          parameters: [],
          outputs: [
            { name: 'found', type: 'boolean' },
            { name: 'amount', type: 'number' },
          ],
        },
        {
          name: 'GetFarmland',
          writesState: false,
          parameters: [],
          returnType: 'FarmlandView',
          outputs: [{ name: 'result', type: 'table', nullable: true }],
        },
        {
          name: 'Move',
          writesState: true,
          parameters: [{ name: 'seconds', type: 'number', optional: true, defaultValue: 1 }],
          outputs: [],
          action: {
            id: 'scene.move',
            displayName: 'Move',
            category: 'Movement',
            description: 'Walk to the selected point.',
            execution: 'awaitable',
            contexts: ['cutscene'],
            phases: ['sequence'],
          },
        },
      ],
    },
  ],
  tables: [{ name: 'FarmlandView', fields: [{ name: 'plowed', type: 'boolean' }] }],
});
beforeEach(() => useScriptingManifestStore.setState({ manifest, status: 'ready' }));
afterEach(cleanup);
const mount = () =>
  render(
    <ChakraProvider theme={theme}>
      <ScriptingApiBrowser />
    </ChakraProvider>,
  );

it('browses exported inputs, multiple outputs, execution rules and table fields without authoring controls', () => {
  mount();
  expect(screen.getByText('Read-only')).toBeInTheDocument();
  expect(screen.getByText('found')).toBeInTheDocument();
  expect(screen.getByText('amount')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search Lua API' }), {
    target: { value: 'Movement' },
  });
  expect(screen.getByText('Changes game state')).toBeInTheDocument();
  expect(screen.getByText('Waits until finished before continuing.')).toBeInTheDocument();
  expect(screen.getByText('Phases: sequence')).toBeInTheDocument();
  expect(screen.getByText('Optional · default: 1')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search Lua API' }), {
    target: { value: '' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'API entry type' }), {
    target: { value: 'Table' },
  });
  expect(screen.getByText('plowed')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /add|delete|import/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/\bpure\b/i)).not.toBeInTheDocument();
});

it('updates exported fields live and clears the overview when the manifest becomes unavailable', () => {
  mount();
  fireEvent.change(screen.getByRole('combobox', { name: 'API entry type' }), {
    target: { value: 'Table' },
  });
  act(() =>
    useScriptingManifestStore.setState({
      manifest: {
        ...manifest,
        tables: [{ name: 'FarmlandView', fields: [{ name: 'irrigated', type: 'boolean' }] }],
      },
    }),
  );
  expect(screen.getByText('irrigated')).toBeInTheDocument();
  expect(screen.queryByText('plowed')).not.toBeInTheDocument();
  act(() => useScriptingManifestStore.setState({ manifest: null, status: 'error' }));
  expect(screen.queryByText('irrigated')).not.toBeInTheDocument();
  expect(screen.getByText('Connect the game API')).toBeInTheDocument();
});

it('links a returned table type to its exported fields', () => {
  mount();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search Lua API' }), {
    target: { value: 'GetFarmland' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'FarmlandView', exact: true }));
  expect(screen.getByRole('combobox', { name: 'API entry type' })).toHaveValue('Table');
  expect(screen.getByText('plowed')).toBeInTheDocument();
});
