import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { enableMapSet } from 'immer';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from './TopBar';
import { useEditorStore, runEditorHistoryCommand } from '../../store/useEditorStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useSaveStore } from '../../lib/saveManager';
import { fileSystem } from '../../lib/fileSystem';
import type { Quest } from '../../types/quest';
import { withGraph } from '../../lib/questGraph.fixture';
import { theme } from '../../theme';

enableMapSet();
const quest: Quest = withGraph({
  formatVersion: 1,
  id: 'base:festival',
  title: 'Festival',
  description: 'Help Fabia.',
  steps: [
    {
      id: 'deliver',
      journal: 'Bring the wine.',
      objectives: [{ id: 'wine', kind: 'have', item: 'base:wine', count: 2, text: 'Two wine' }],
    },
  ],
});
const tab = {
  id: 'quest:' + quest.id,
  document: {
    kind: 'quest' as const,
    questId: quest.id,
    label: quest.title,
    saveUnitId: 'quest:' + quest.id,
  },
};
beforeEach(() => {
  useEditorStore.getState().resetQuests();
  useSaveStore.getState().reset();
  useWorkspaceStore.setState({ tabs: [tab], activeTabId: tab.id, autosaveEnabled: false });
  useEditorStore.setState({ quests: [quest], savedQuests: { [quest.id]: quest } });
  vi.spyOn(fileSystem, 'saveJson').mockResolvedValue();
});
afterEach(() => {
  cleanup();
  useEditorStore.getState().resetQuests();
  vi.restoreAllMocks();
});
const show = () =>
  render(
    <ChakraProvider theme={theme}>
      <TopBar />
    </ChakraProvider>,
  );
describe('application document commands', () => {
  it('exposes Save and Save All without opening File and saves both quest artifacts', async () => {
    show();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save All' }).hasAttribute('disabled')).toBe(true);
    act(() => useEditorStore.getState().updateQuest(quest.id, { title: 'Wine festival' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(useSaveStore.getState().saveUnits[tab.id]?.dirty).toBe(false));
    expect(vi.mocked(fileSystem.saveJson).mock.calls.map((call) => call[1])).toEqual([
      'base:festival.quest.json',
      'base:festival.i18n.json',
    ]);
    act(() =>
      useEditorStore.getState().updateQuest(quest.id, { description: 'Bring wine to Fabia.' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save All' }));
    await waitFor(() => expect(useSaveStore.getState().saveUnits[tab.id]?.dirty).toBe(false));
    expect(fileSystem.saveJson).toHaveBeenCalledTimes(4);
  });
  it('routes Undo to the active document and disables it after switching to a form without history', () => {
    act(() => useEditorStore.getState().updateQuest(quest.id, { title: 'Wine festival' }));
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(useEditorStore.getState().quests[0].title).toBe('Festival');
    const characterTab = {
      id: 'character:base:fabia',
      document: {
        kind: 'character' as const,
        characterId: 'base:fabia',
        label: 'Fabia',
        saveUnitId: 'character:base:fabia',
      },
    };
    act(() =>
      useWorkspaceStore.setState({ tabs: [tab, characterTab], activeTabId: characterTab.id }),
    );
    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(true);
    expect(runEditorHistoryCommand('undo', document.body)).toBe(false);
  });
});
