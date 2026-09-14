import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ChakraProvider } from '@chakra-ui/react';
import { CreateEntityTypeDialog } from './CreateEntityTypeDialog';
import { useEditorStore } from '../../../store/useEditorStore';

describe('CreateEntityTypeDialog', () => {
  beforeEach(() => {
    // reset minimal store state for tests
    useEditorStore.setState({ entityTypes: [] });
  });

  it('computes id from name and calls addEntityType', async () => {
    const addEntityType = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    useEditorStore.setState({ addEntityType });

    render(
      <ChakraProvider>
        <CreateEntityTypeDialog onClose={onClose} />
      </ChakraProvider>,
    );

    const input = screen.getByPlaceholderText('e.g. My Entity Type');
    fireEvent.change(input, { target: { value: 'Treasure Chest' } });

    // id should be rendered
    await waitFor(() => expect(screen.getByText('treasure_chest')).toBeTruthy());

    const createBtn = screen.getByRole('button', {
      name: /Create Entity Type/i,
    });
    fireEvent.click(createBtn);

    await waitFor(() => expect(addEntityType).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();

    const arg = addEntityType.mock.calls[0][0];
    expect(arg.id).toBe('treasure_chest');
    expect(arg.displayName).toBe('Treasure Chest');
  });
});
