import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProjectSettingsEditor } from './ProjectSettingsEditor';
import { ChakraProvider } from '@chakra-ui/react';
import React from 'react';

const renderWithChakra = (ui: React.ReactElement) => {
  return render(<ChakraProvider>{ui}</ChakraProvider>);
};

describe('ProjectSettingsEditor', () => {
  const mockProject = {
    version: '1.0',
    name: 'Old Project',
    tileSize: 16,
    defaultMapWidth: 32,
    defaultMapHeight: 32,
    metadata: {
      author: 'Tester',
      description: 'Old description',
    },
  };

  it('should render with initial project values', () => {
    renderWithChakra(<ProjectSettingsEditor initialProject={mockProject} onSave={() => {}} />);

    expect(screen.getByLabelText(/Project Name/i)).toHaveValue('Old Project');
    expect(screen.getByLabelText(/Author/i)).toHaveValue('Tester');
    expect(screen.getByLabelText(/Description/i)).toHaveValue('Old description');
  });

  it('should call onSave with updated values when submitted', async () => {
    const onSave = vi.fn();
    renderWithChakra(<ProjectSettingsEditor initialProject={mockProject} onSave={onSave} />);

    const nameInput = screen.getByLabelText(/Project Name/i);
    fireEvent.change(nameInput, { target: { value: 'New Amazing Project' } });

    const saveButton = screen.getByText(/Save Project/i);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Amazing Project',
        }),
      );
    });
  });

  it('should show validation error for invalid tile size', async () => {
    renderWithChakra(<ProjectSettingsEditor initialProject={mockProject} onSave={() => {}} />);

    const tileSizeInput = screen.getByLabelText(/Tile Size/i);
    // Change to a non-power-of-2 value
    fireEvent.change(tileSizeInput, { target: { value: '13' } });

    const saveButton = screen.getByText(/Save Project/i);
    fireEvent.click(saveButton);

    expect(await screen.findByText(/Tile size should be power of 2/i)).toBeInTheDocument();
  });

  it('renders create-project actions and allows cancellation', () => {
    const onCancel = vi.fn();

    renderWithChakra(<ProjectSettingsEditor onSave={() => {}} onCancel={onCancel} />);

    expect(screen.getByRole('button', { name: 'Create Project' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
