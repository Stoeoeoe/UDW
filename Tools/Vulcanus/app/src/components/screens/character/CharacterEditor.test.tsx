import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../../store/useEditorStore';
import { CharacterEditor } from './CharacterEditor';
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

describe('character tabs', () => {
  it('keeps the portraits, voice and dialogues on their own tabs', () => {
    show();
    expect(screen.getByLabelText('Walk speed')).toBeTruthy();
    expect(screen.queryByText('Typewriter sound')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Voice/ }));
    expect(screen.getByText('Typewriter sound')).toBeTruthy();
    expect(screen.queryByLabelText('Walk speed')).toBeNull();
  });
});

describe('character dialogues', () => {
  const withDialogues = (dialogues: Character['dialogues']) => {
    cleanup();
    useEditorStore.setState({
      characters: [{ ...fabia, dialogues }],
      dialogues: new Map([
        ['base:hello', { id: 'base:hello', name: 'Hello' }],
        ['base:grumpy', { id: 'base:grumpy', name: 'Grumpy' }],
      ]) as never,
    });
    show();
    fireEvent.click(screen.getByRole('button', { name: /^Dialogues/ }));
  };

  it('adds a chosen dialogue to the end of the list', () => {
    withDialogues([{ dialogue: 'base:hello' }]);
    fireEvent.change(screen.getByLabelText('Add a dialogue'), { target: { value: 'base:grumpy' } });
    expect(updateCharacter).toHaveBeenLastCalledWith('base:fabia', {
      dialogues: [{ dialogue: 'base:hello' }, { dialogue: 'base:grumpy' }],
    });
  });

  it('reorders because the first match wins', () => {
    withDialogues([{ dialogue: 'base:hello' }, { dialogue: 'base:grumpy', condition: 'true' }]);
    fireEvent.click(screen.getByLabelText('Move dialogue 2 up'));
    expect(updateCharacter).toHaveBeenLastCalledWith('base:fabia', {
      dialogues: [{ dialogue: 'base:grumpy', condition: 'true' }, { dialogue: 'base:hello' }],
    });
  });

  it('removes entries and leaves the key out when none remain', () => {
    withDialogues([{ dialogue: 'base:hello' }]);
    fireEvent.click(screen.getByLabelText('Remove dialogue 1'));
    expect(updateCharacter).toHaveBeenLastCalledWith('base:fabia', { dialogues: undefined });
  });
});
