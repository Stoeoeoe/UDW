import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorFormSave } from './EditorFormSave';
import { saveAllDirtyWorkspaceUnits, saveWorkspaceTab } from '../../lib/workspaceSaveActions';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useSaveStore } from '../../lib/saveManager';

beforeEach(() => {
  useSaveStore.getState().reset();
  useWorkspaceStore.getState().setAutosaveEnabled(false);
});
afterEach(() => {
  cleanup();
  useSaveStore.getState().reset();
});

it('makes a character draft dirty and saves its latest values through both toolbar commands', async () => {
  const saved: string[] = [];
  const tab = {
    id: 'character:base:fabia',
    document: {
      kind: 'character' as const,
      characterId: 'base:fabia',
      label: 'Fabia',
      saveUnitId: 'character:base:fabia',
    },
  };
  const { rerender } = render(
    <EditorFormSave
      kind="character"
      resourceId="base:fabia"
      isDirty
      values="Fabia"
      onSave={async () => {
        saved.push('Fabia');
      }}
    />,
  );
  expect(useSaveStore.getState().saveUnits[tab.id].dirty).toBe(true);
  await act(() => saveWorkspaceTab(tab));
  expect(saved).toEqual(['Fabia']);
  rerender(
    <EditorFormSave
      kind="character"
      resourceId="base:fabia"
      isDirty
      values="Priestess Fabia"
      onSave={async () => {
        saved.push('Priestess Fabia');
      }}
    />,
  );
  await act(() => saveAllDirtyWorkspaceUnits());
  expect(saved).toEqual(['Fabia', 'Priestess Fabia']);
  expect(useSaveStore.getState().saveUnits[tab.id].dirty).toBe(false);
});

it('keeps a failed form save dirty and reports its error to the toolbar caller', async () => {
  const onSave = vi.fn(async () => {
    throw new Error('Disk full');
  });
  render(
    <EditorFormSave kind="item" resourceId="base:wine" isDirty values="Wine" onSave={onSave} />,
  );
  await act(async () => {
    await expect(saveAllDirtyWorkspaceUnits()).rejects.toThrow('Disk full');
  });
  expect(useSaveStore.getState().saveUnits['item:base:wine']).toMatchObject({
    dirty: true,
    status: 'error',
    error: 'Disk full',
  });
});
