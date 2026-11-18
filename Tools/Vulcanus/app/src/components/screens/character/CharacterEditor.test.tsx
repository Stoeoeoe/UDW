import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterEditor } from './CharacterEditor';
import { useEditorStore } from '../../../store/useEditorStore';
import { theme } from '../../../theme';
import type { Character } from '../../../types/schema';

vi.mock('../../../lib/fileSystem', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/fileSystem')>();
  return {
    ...original,
    fileSystem: { ...original.fileSystem, saveJson: vi.fn(async () => {}) },
  };
});

const fabia: Character = { id: 'base:fabia', name: 'Fabia' };
const updateCharacter = vi.fn(async (id: string, updates: Partial<Character>) => {
  useEditorStore.setState((state) => ({
    characters: state.characters.map((c) => (c.id === id ? { ...c, ...updates } : c)),
  }));
});

beforeEach(() => {
  updateCharacter.mockClear();
  useEditorStore.setState({
    characters: [fabia],
    selectedCharacterId: fabia.id,
    emotions: [],
    updateCharacter,
  });
});
afterEach(cleanup);

const show = () =>
  render(
    <ChakraProvider theme={theme}>
      <CharacterEditor />
    </ChakraProvider>,
  );

describe('character starting social standing', () => {
  it('shows the default when the character leaves it out and keeps what they author', () => {
    show();
    const field = screen.getByLabelText('Starting social standing') as HTMLInputElement;
    expect(field.value).toBe('');
    expect(field.placeholder).toBe('50');
    cleanup();
    useEditorStore.setState({ characters: [{ ...fabia, startingSocialStanding: 80 }] });
    show();
    expect((screen.getByLabelText('Starting social standing') as HTMLInputElement).value).toBe(
      '80',
    );
  });

  it('saves a whole number kept between 0 and 100, and nothing when emptied', () => {
    show();
    const field = screen.getByLabelText('Starting social standing');
    fireEvent.change(field, { target: { value: '70' } });
    expect(updateCharacter).toHaveBeenLastCalledWith('base:fabia', { startingSocialStanding: 70 });
    fireEvent.change(field, { target: { value: '150' } });
    expect(updateCharacter).toHaveBeenLastCalledWith('base:fabia', {
      startingSocialStanding: 100,
    });
    fireEvent.change(field, { target: { value: '' } });
    expect(updateCharacter).toHaveBeenLastCalledWith('base:fabia', {
      startingSocialStanding: undefined,
    });
  });
});
