import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../store/useEditorStore';
import { useMusicStore } from '../../store/useMusicStore';
import { PropertyForm, propertyDefinitionsToSchema } from './PropertyForm';
import { theme } from '../../theme';

beforeEach(() => {
  useEditorStore.setState({
    maps: [],
    tilesets: new Map(),
    characters: [{ id: 'base:fabia', name: 'Fabia' }],
    entityTypes: [],
    items: [],
    shops: [],
    quests: [],
    routines: [],
    dialogues: new Map(),
    cutscenes: [],
  });
  useMusicStore.setState({ cues: [{ id: 'base:roman-spring', name: 'Roman Spring' }] as never });
});
afterEach(cleanup);

const schema = propertyDefinitionsToSchema([
  {
    key: 'musicCue',
    label: 'Music Cue',
    type: 'reference',
    defaultValue: '',
    required: false,
    constraints: { referenceType: 'music' },
  },
]);

const show = (value: string, onChange = vi.fn()) => {
  render(
    <ChakraProvider theme={theme}>
      <PropertyForm schema={schema} values={{ musicCue: value }} onChange={onChange} />
    </ChakraProvider>,
  );
  return onChange;
};

describe('reference properties', () => {
  it('pick one of the project resources of the referenced type', () => {
    const onChange = show('');
    const select = screen.getByRole('combobox', { name: 'Music Cue' });
    expect(screen.getByRole('option', { name: 'Roman Spring — base:roman-spring' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Fabia/ })).toBeNull();
    fireEvent.change(select, { target: { value: 'base:roman-spring' } });
    expect(onChange).toHaveBeenLastCalledWith('musicCue', 'base:roman-spring');
  });

  it('keep showing a reference to a resource that no longer exists', () => {
    show('base:gone');
    expect(screen.getByRole('option', { name: 'Missing: base:gone' })).toBeTruthy();
  });

  it('fail clearly for a resource type that does not exist', () => {
    const bad = propertyDefinitionsToSchema([
      {
        key: 'x',
        label: 'X',
        type: 'reference',
        defaultValue: '',
        required: false,
        constraints: { referenceType: 'nonsense' },
      },
    ]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <ChakraProvider theme={theme}>
          <PropertyForm schema={bad} values={{}} onChange={() => {}} />
        </ChakraProvider>,
      ),
    ).toThrow(/unknown resource type 'nonsense'/);
  });
});
