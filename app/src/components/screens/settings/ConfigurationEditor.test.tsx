import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { fireEvent, render, screen } from '@testing-library/react';
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
});
