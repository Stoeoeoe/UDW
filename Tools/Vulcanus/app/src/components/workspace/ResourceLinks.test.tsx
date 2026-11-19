import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../store/useEditorStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { ResourceLinks } from './ResourceLinks';
import { theme } from '../../theme';
import type { Quest } from '../../types/quest';

const openDocument = vi.fn();

beforeEach(() => {
  // jsdom has no scrollTo, which Chakra's menu calls when it opens.
  Element.prototype.scrollTo = vi.fn();
  openDocument.mockClear();
  useWorkspaceStore.setState({ openDocument } as never);
  useEditorStore.setState({
    characters: [{ id: 'base:fabia', name: 'Fabia' }],
    quests: [
      {
        formatVersion: 1,
        id: 'base:favour',
        title: "Fabia's Favour",
        description: '',
        giver: 'base:fabia',
        steps: [],
      } as Quest,
    ],
    routines: [],
    shops: [],
    items: [],
    maps: [],
    dialogues: new Map(),
  });
});
afterEach(cleanup);

const show = (resource: { type: 'character' | 'quest'; id: string }) =>
  render(
    <ChakraProvider theme={theme}>
      <ResourceLinks resource={resource} />
    </ChakraProvider>,
  );

describe('resource links', () => {
  it('jumps from a quest to the character it uses', () => {
    show({ type: 'quest', id: 'base:favour' });
    fireEvent.click(screen.getByLabelText('Links (1)'));
    fireEvent.click(screen.getByText('Fabia'));
    expect(openDocument).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'character', characterId: 'base:fabia' }),
      { pin: true },
    );
  });

  it('shows the quests that use a character', () => {
    show({ type: 'character', id: 'base:fabia' });
    fireEvent.click(screen.getByLabelText('Links (1)'));
    expect(screen.getByText("Fabia's Favour")).toBeTruthy();
    expect(screen.getByText(/Quest · Giver/)).toBeTruthy();
  });

  it('is disabled when there is nothing to link', () => {
    show({ type: 'character', id: 'base:nobody' });
    expect((screen.getByLabelText('Links (0)') as HTMLButtonElement).disabled).toBe(true);
  });
});
