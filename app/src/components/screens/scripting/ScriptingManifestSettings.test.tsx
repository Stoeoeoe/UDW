import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VariableEditor } from './VariableEditor';
import { ScriptingManifestSettings } from './ScriptingManifestSettings';
import { useScriptingManifestStore } from '../../../store/useScriptingManifestStore';
import { theme } from '../../../theme';
import manifest from '../../../lib/__fixtures__/cutscene-bindings.json';

const invoke = vi.fn();
const filename = 'C:/Unity/Generated/Scripting/bindings.json';
const originalIpc = window.ipcRenderer;

describe('Scripting manifest location', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'ipcRenderer', { configurable: true, value: { invoke } });
    window.localStorage.clear();
    useScriptingManifestStore.setState({
      path: '',
      manifest: null,
      actionsByContext: {},
      status: 'unconfigured',
      error: null,
      revision: -1,
      lastReadAt: null,
    });
    invoke.mockImplementation(async (channel, selectedPath) => {
      if (channel === 'app:scripting-manifest-select') return filename;
      if (channel === 'app:scripting-manifest-watch' && selectedPath)
        return { path: selectedPath, revision: 1, content: manifest, error: null };
      return null;
    });
  });
  afterEach(() => {
    if (originalIpc)
      Object.defineProperty(window, 'ipcRenderer', { configurable: true, value: originalIpc });
    else Reflect.deleteProperty(window, 'ipcRenderer');
  });

  it('configures a watched filesystem path in the Scripting menu and shows the entire API', async () => {
    render(
      <ChakraProvider theme={theme}>
        <VariableEditor />
      </ChakraProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lua Manifest' }));
    fireEvent.change(screen.getByLabelText('Manifest filesystem location'), {
      target: { value: filename },
    });
    expect(screen.queryByRole('button', { name: 'Watch file' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Watching')).toBeInTheDocument(), {
      timeout: 2500,
    });
    expect(invoke).toHaveBeenCalledWith('app:scripting-manifest-watch', filename);
    const module = manifest.modules.find((m) => m.methods.some((method) => !method.action))!;
    const method = module.methods.find((m) => !m.action)!;
    expect(
      screen.getByText(
        (text, element) =>
          element?.tagName === 'P' && text.includes(`${module.path}.${method.name}(`),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /import/i })).not.toBeInTheDocument();
  });

  it('browses for the location and can clear it without altering the source file', async () => {
    render(
      <ChakraProvider theme={theme}>
        <ScriptingManifestSettings />
      </ChakraProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Browse…' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Manifest filesystem location')).toHaveValue(filename),
    );
    expect(invoke).toHaveBeenCalledWith('app:scripting-manifest-select');
    fireEvent.click(screen.getByRole('button', { name: 'Clear location' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Manifest filesystem location')).toHaveValue(''),
    );
    expect(invoke).toHaveBeenLastCalledWith('app:scripting-manifest-watch', null);
  });
});
