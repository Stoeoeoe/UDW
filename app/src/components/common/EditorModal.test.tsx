import React from 'react';
import { ChakraProvider, Input } from '@chakra-ui/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditorModal } from './EditorModal';

describe('EditorModal focus lifecycle', () => {
  it('releases the overlay and focus lock immediately when closed, and accepts typing on reopen', async () => {
    const user = userEvent.setup();
    const view = (isOpen: boolean) => (
      <ChakraProvider>
        <Input aria-label="Outside field" />
        <EditorModal isOpen={isOpen} onClose={vi.fn()}>
          <Input aria-label="Dialog field" />
        </EditorModal>
      </ChakraProvider>
    );
    const { rerender } = render(view(true));
    const firstInput = screen.getByLabelText('Dialog field');
    await user.click(firstInput);
    await user.type(firstInput, 'first');
    expect(firstInput).toHaveFocus();
    expect(firstInput).toHaveValue('first');

    rerender(view(false));
    // No invisible exit layer may keep intercepting clicks or holding focus.
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument();
    const outside = screen.getByLabelText('Outside field');
    await user.click(outside);
    expect(outside).toHaveFocus();

    rerender(view(true));
    const reopenedInput = screen.getByLabelText('Dialog field');
    await user.click(reopenedInput);
    await user.type(reopenedInput, 'second');
    expect(reopenedInput).toHaveFocus();
    expect(reopenedInput).toHaveValue('second');
  });

  it('returns focus to the parent dialog after a nested dialog closes', async () => {
    const user = userEvent.setup();
    const view = (childOpen: boolean) => (
      <ChakraProvider>
        <EditorModal isOpen onClose={vi.fn()}>
          <Input aria-label="Parent field" />
          <EditorModal isOpen={childOpen} onClose={vi.fn()}>
            <Input aria-label="Child field" />
          </EditorModal>
        </EditorModal>
      </ChakraProvider>
    );
    const { rerender } = render(view(false));
    await user.click(screen.getByLabelText('Parent field'));
    rerender(view(true));
    await user.type(screen.getByLabelText('Child field'), 'child');
    rerender(view(false));
    await waitFor(() => expect(screen.getByLabelText('Parent field')).toHaveFocus());
    await user.type(screen.getByLabelText('Parent field'), 'parent');
    expect(screen.getByLabelText('Parent field')).toHaveValue('parent');
  });
});
