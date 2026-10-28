import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataEditor } from './DataEditor';
import { useEditorStore } from '../../../store/useEditorStore';
import { persistProject } from '../../../store/storeHelpers';
import { theme } from '../../../theme';

vi.mock('../../../store/storeHelpers', async (original) => ({
  ...(await original<typeof import('../../../store/storeHelpers')>()),
  persistProject: vi.fn(),
}));

const original = useEditorStore.getState().project;
afterEach(() => {
  cleanup();
  useEditorStore.setState({ project: original });
});

describe('Data editor', () => {
  it('creates and edits declarations in the persisted project', async () => {
    useEditorStore.setState({
      project: {
        id: 'test',
        version: '1.0',
        name: 'Test',
        tileSize: 16,
        defaultMapWidth: 16,
        defaultMapHeight: 16,
      },
    });
    render(
      <ChakraProvider theme={theme}>
        <DataEditor />
      </ChakraProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Story Value' }));
    fireEvent.change(screen.getByPlaceholderText('met_blacksmith'), {
      target: { value: 'met_blacksmith' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(useEditorStore.getState().project?.storyValues).toEqual([
        { key: 'met_blacksmith', type: 'boolean', description: '' },
      ]),
    );
    expect(persistProject).toHaveBeenLastCalledWith(
      expect.objectContaining({
        storyValues: [{ key: 'met_blacksmith', type: 'boolean', description: '' }],
      }),
    );
  });
});
