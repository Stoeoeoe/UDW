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

  it('names the band the starting standing falls in', () => {
    show();
    expect(screen.getByLabelText('Starting band').textContent).toBe('Neutral');
    cleanup();
    useEditorStore.setState({ characters: [{ ...fabia, startingSocialStanding: 20 }] });
    show();
    expect(screen.getByLabelText('Starting band').textContent).toBe('Wary');
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
  const withRules = (dialogueRules: Character['dialogueRules']) => {
    cleanup();
    useEditorStore.setState({
      characters: [{ ...fabia, dialogueRules }],
      routines: [],
      dialogues: new Map([
        ['base:hello', { id: 'base:hello', name: 'Hello' }],
        ['base:grumpy', { id: 'base:grumpy', name: 'Grumpy' }],
      ]) as never,
    });
    show();
    fireEvent.click(screen.getByRole('button', { name: /^Dialogues/ }));
  };

  it('adds a chosen dialogue as a row that holds always', () => {
    withRules([{ dialogue: 'base:hello' }]);
    fireEvent.change(screen.getByLabelText('Add a dialogue'), { target: { value: 'base:grumpy' } });
    expect(updateCharacter).toHaveBeenLastCalledWith('base:fabia', {
      dialogueRules: [{ dialogue: 'base:hello' }, { dialogue: 'base:grumpy' }],
      dialogues: [{ dialogue: 'base:hello' }, { dialogue: 'base:grumpy' }],
    });
  });

  it('saves a standing column both as the row and as the compiled condition', () => {
    withRules([{ dialogue: 'base:hello' }]);
    fireEvent.change(screen.getByLabelText('Standing 1'), { target: { value: 'wary-' } });
    expect(updateCharacter).toHaveBeenLastCalledWith('base:fabia', {
      dialogueRules: [{ dialogue: 'base:hello', standing: 'wary-' }],
      dialogues: [
        { dialogue: 'base:hello', condition: "SocialStanding.HasLessThan('base:fabia', 40)" },
      ],
    });
    fireEvent.change(screen.getByLabelText('Standing 1'), { target: { value: '' } });
    expect(updateCharacter).toHaveBeenLastCalledWith('base:fabia', {
      dialogueRules: [{ dialogue: 'base:hello' }],
      dialogues: [{ dialogue: 'base:hello' }],
    });
  });

  it('reorders because the first match wins', () => {
    withRules([{ dialogue: 'base:hello' }, { dialogue: 'base:grumpy', weather: 'Sunny' }]);
    fireEvent.click(screen.getByLabelText('Move dialogue 2 up'));
    expect(updateCharacter).toHaveBeenLastCalledWith(
      'base:fabia',
      expect.objectContaining({
        dialogueRules: [{ dialogue: 'base:grumpy', weather: 'Sunny' }, { dialogue: 'base:hello' }],
      }),
    );
  });

  it('removes rows and leaves both keys out when none remain', () => {
    withRules([{ dialogue: 'base:hello' }]);
    fireEvent.click(screen.getByLabelText('Remove dialogue 1'));
    expect(updateCharacter).toHaveBeenLastCalledWith('base:fabia', {
      dialogueRules: undefined,
      dialogues: undefined,
    });
  });

  it('shows each rule as a table row and opens its Lua condition under it', () => {
    withRules([{ dialogue: 'base:hello' }, { dialogue: 'base:grumpy', condition: 'true' }]);
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.queryByText(/And also, if/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Lua condition 2'));
    expect(screen.getByText(/And also, if/)).toBeTruthy();
  });

  it('edits dialogues authored without rules as rows', () => {
    cleanup();
    useEditorStore.setState({
      characters: [{ ...fabia, dialogues: [{ dialogue: 'base:hello', condition: 'true' }] }],
      routines: [],
      dialogues: new Map() as never,
    });
    show();
    fireEvent.click(screen.getByRole('button', { name: /^Dialogues/ }));
    expect(screen.getByLabelText('Move dialogue 1 down')).toBeTruthy();
  });
});
