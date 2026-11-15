import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { enableMapSet } from 'immer';
import { EditorDocumentFrame } from '../../common/EditorDocumentFrame';
import { FiStar } from 'react-icons/fi';
import { QuestEditor } from './QuestEditor';
import { useEditorStore } from '../../../store/useEditorStore';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { fileSystem } from '../../../lib/fileSystem';
import { theme } from '../../../theme';
import type { Character } from '../../../types/schema';

enableMapSet();
vi.mock('../scripting/LuaScriptEditor', () => ({
  LuaScriptEditor: ({
    value,
    onChange,
    documentId,
  }: {
    value: string;
    onChange: (v: string) => void;
    documentId: string;
  }) => (
    <textarea aria-label={documentId} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('../routine/DialogueSelect', () => ({
  DialogueSelect: ({ value, onChange }: { value?: string; onChange: (v?: string) => void }) => (
    <input
      aria-label="Quest dialogue"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
beforeEach(() => {
  useWorkspaceStore.getState().setAutosaveEnabled(false);
  useEditorStore.getState().resetQuests();
  useEditorStore.setState({
    characters: [{ id: 'base:fabia', name: 'Fabia' }] as Character[],
    items: [],
    maps: [],
    dialogues: new Map(),
    quests: [
      {
        formatVersion: 1,
        id: 'base:festival',
        title: 'Festival',
        description: 'Help Fabia.',
        steps: [
          {
            id: 'talk',
            journal: 'Ask Fabia.',
            objectives: [
              {
                id: 'ask',
                text: 'Talk to Fabia',
                kind: 'talk',
                character: 'base:fabia',
                dialogue: 'base:festival_intro',
              },
            ],
          },
        ],
      },
    ],
  });
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
      <EditorDocumentFrame
        title="Festival"
        resourceId="base:festival"
        icon={FiStar}
        layout="sequence"
      >
        <QuestEditor questId="base:festival" />
      </EditorDocumentFrame>
    </ChakraProvider>,
  );
describe('quest editor', () => {
  it('changes objective kind without retaining forbidden dialogue or character fields', () => {
    show();
    fireEvent.click(screen.getByLabelText('Select objective ask'));
    fireEvent.change(screen.getByLabelText('Objective kind'), { target: { value: 'condition' } });
    const objective = useEditorStore.getState().quests[0].steps[0].objectives[0];
    expect(objective).toEqual({
      id: 'ask',
      text: 'Talk to Fabia',
      kind: 'condition',
      condition: '',
    });
    expect(screen.queryByLabelText('Quest dialogue')).toBeNull();
  });
  it('edits deadlines, adds ordered steps and keeps their IDs when moving them', () => {
    show();
    fireEvent.click(screen.getByText('Deadline'));
    fireEvent.change(screen.getByLabelText('Deadline days'), { target: { value: '2' } });
    expect(useEditorStore.getState().quests[0].steps[0].deadline).toEqual({ days: 2 });
    fireEvent.click(screen.getByText('Add step'));
    fireEvent.change(screen.getByLabelText('Step ID'), { target: { value: 'deliver' } });
    fireEvent.click(screen.getByText('Move up'));
    expect(useEditorStore.getState().quests[0].steps.map((s) => s.id)).toEqual(['deliver', 'talk']);
    act(() => useEditorStore.getState().discardQuest('base:festival'));
    expect(screen.getByText('Quest not found.')).toBeTruthy();
  });
});
