import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { theme } from '../../../theme';
import { useEditorStore } from '../../../store/useEditorStore';
import { ConfigurationEditor } from './ConfigurationEditor';

describe('ConfigurationEditor', () => {
  beforeEach(() => {
    useEditorStore.getState().closeProject();
  });

  it('does not notify onTabChange on mount or same-tab rerender, but does on user tab change', () => {
    const onTabChange = vi.fn();
    const { rerender } = render(
      <ChakraProvider theme={theme}>
        <ConfigurationEditor initialTab="terrain" onTabChange={onTabChange} />
      </ChakraProvider>,
    );

    expect(onTabChange).not.toHaveBeenCalled();

    rerender(
      <ChakraProvider theme={theme}>
        <ConfigurationEditor initialTab="terrain" onTabChange={onTabChange} />
      </ChakraProvider>,
    );

    expect(onTabChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /layers/i }));

    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith('layers');
  });

  it('can create, reopen, edit and create another metadata field with working input focus', async () => {
    useEditorStore.setState({ tileMetadataDefinitions: [] });
    render(
      <ChakraProvider theme={theme}>
        <ConfigurationEditor initialTab="metadata" />
      </ChakraProvider>,
    );

    const openCreate = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Metadata Field' }));
      return within(screen.getByRole('dialog'));
    };
    const first = await openCreate();
    // Initialize Chakra's focus-visible tracking before user-event patches focus.
    const user = userEvent.setup();
    await user.clear(first.getByLabelText('Key'));
    await user.type(first.getByLabelText('Key'), 'footstep');
    await user.clear(first.getByLabelText('Label'));
    await user.type(first.getByLabelText('Label'), 'Footstep');
    expect(first.getByLabelText('Label')).toHaveFocus();
    await user.click(first.getByRole('button', { name: 'Create Metadata' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Reusing the create dialog must start a fresh form, not the last saved draft.
    const second = await openCreate();
    expect(second.getByLabelText('Label')).toHaveValue('New Metadata');
    await user.clear(second.getByLabelText('Label'));
    await user.type(second.getByLabelText('Label'), 'Another field');
    expect(second.getByLabelText('Label')).toHaveFocus();
    expect(second.getByLabelText('Label')).toHaveValue('Another field');
    await user.click(second.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    for (const label of ['Footstep sound', 'Footstep material']) {
      await user.click(
        screen.getByText(useEditorStore.getState().tileMetadataDefinitions[0].label),
      );
      const edit = within(screen.getByRole('dialog'));
      const input = edit.getByLabelText('Label');
      expect(input).toHaveValue(useEditorStore.getState().tileMetadataDefinitions[0].label);
      await user.clear(input);
      await user.type(input, label);
      expect(input).toHaveFocus();
      await user.click(edit.getByRole('button', { name: 'Save Metadata' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(useEditorStore.getState().tileMetadataDefinitions[0].label).toBe(label);
    }
  }, 15000);
});
