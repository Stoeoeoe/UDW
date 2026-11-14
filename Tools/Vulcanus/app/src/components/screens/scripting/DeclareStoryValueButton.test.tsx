import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeclareStoryValueButton } from './DeclareStoryValueButton';
import { useEditorStore } from '../../../store/useEditorStore';
import type { Project } from '../../../types/schema';

vi.mock('../../../store/storeHelpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../store/storeHelpers')>()),
  persistProject: vi.fn(async () => {}),
}));

describe('DeclareStoryValueButton', () => {
  beforeEach(() => {
    useEditorStore.setState({
      project: { storyValues: [{ key: 'met', type: 'boolean' }] } as unknown as Project,
    });
  });

  it('declares the key in Data with the suggested type, which the author can change', () => {
    render(
      <ChakraProvider>
        <DeclareStoryValueButton suggestion={{ key: 'visits', type: 'long' }} />
      </ChakraProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Declare' }));
    expect((screen.getByLabelText('Story value type') as HTMLSelectElement).value).toBe('long');
    fireEvent.change(screen.getByLabelText('Story value type'), { target: { value: 'double' } });
    fireEvent.change(screen.getByLabelText('Story value description'), {
      target: { value: 'How often the player visited Fabia' },
    });
    // Chakra keeps the popover out of the accessibility tree while it animates in.
    fireEvent.click(screen.getByText('Add to Data'));

    expect(useEditorStore.getState().project?.storyValues).toEqual([
      { key: 'met', type: 'boolean' },
      { key: 'visits', type: 'double', description: 'How often the player visited Fabia' },
    ]);
  });
});
