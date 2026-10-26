import React from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceExplorer } from './WorkspaceExplorer';
import { buildWorkspaceTree } from '../../lib/workspaceTree';
import { documentFromHash, documentToHash } from '../../lib/workspaceRouting';
import { getWorkspaceTabId, useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useEditorStore } from '../../store/useEditorStore';
import { useSaveStore } from '../../lib/saveManager';
import { theme } from '../../theme';
import { parseCutscene } from '../../lib/cutscenes';
import prototype from '../../lib/__fixtures__/prototype.v2.runtime.cutscene.json';

describe('cutscene explorer resources', () => {
  beforeEach(() => {
    useSaveStore.getState().reset();
    useWorkspaceStore.getState().resetWorkspace();
    useEditorStore.setState({
      project: { id: 'game', idPrefix: 'base' } as never,
      cutscenes: [parseCutscene(prototype)],
      cutsceneLabels: { [prototype.id]: 'Forge Intro' },
      cutsceneFolders: {},
      cutscenePast: {},
      cutsceneFuture: {},
      selectedCutsceneId: prototype.id,
    });
  });
  const tree = () => {
    const state = useEditorStore.getState();
    return buildWorkspaceTree({
      maps: [],
      tilesets: new Map(),
      characters: [],
      entityTypes: [],
      items: [],
      dialogues: [],
      gameVariables: [],
      cutscenes: state.cutscenes,
      cutsceneLabels: state.cutsceneLabels,
      cutsceneFolders: state.cutsceneFolders,
    });
  };

  it('renders an expandable resource section with a create button and individual documents', () => {
    const nodes = tree();
    const section = nodes.find((node) => node.id === 'group:cutscenes')!;
    expect(section).toMatchObject({
      kind: 'group',
      resourceKind: 'cutscene',
      defaultExpanded: true,
    });
    expect(nodes.some((node) => node.id === 'cutscenes')).toBe(false);
    expect(section.children?.[0]).toMatchObject({
      id: `cutscene:${prototype.id}`,
      label: 'Forge Intro',
      document: { kind: 'cutscene', cutsceneId: prototype.id },
    });
    const open = vi.fn();
    const toggle = vi.fn();
    render(
      <ChakraProvider theme={theme}>
        <WorkspaceExplorer
          nodes={nodes}
          expandedNodeIds={['group:cutscenes']}
          activeTabId={null}
          onToggleNode={toggle}
          onOpenNode={open}
        />
      </ChakraProvider>,
    );
    expect(screen.getByRole('button', { name: 'Create Cutscenes' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Forge Intro'));
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({ kind: 'cutscene', cutsceneId: prototype.id }),
      }),
      expect.anything(),
    );
    fireEvent.click(screen.getByText('Cutscenes'));
    expect(toggle).toHaveBeenCalledWith('group:cutscenes');
  });

  it('creates a draft through the shared plus dialog and opens its own tab', async () => {
    const open = vi.fn();
    render(
      <ChakraProvider theme={theme}>
        <WorkspaceExplorer
          nodes={tree()}
          expandedNodeIds={['group:cutscenes']}
          activeTabId={null}
          onToggleNode={vi.fn()}
          onOpenNode={vi.fn()}
          onOpenDocument={open}
        />
      </ChakraProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create Cutscenes' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. My Cutscene'), {
      target: { value: 'Second Scene' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Cutscene' }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'cutscene',
          cutsceneId: 'base:second_scene',
          label: 'Second Scene',
        }),
        { pin: true },
      ),
    );
    const document = open.mock.calls[0][0];
    expect(getWorkspaceTabId(document)).toBe('cutscene:base:second_scene');
    expect(
      documentFromHash(documentToHash(document), {
        maps: [],
        tilesets: new Map(),
        cutscenes: useEditorStore.getState().cutscenes,
        cutsceneLabels: useEditorStore.getState().cutsceneLabels,
      }),
    ).toEqual(document);
    expect(useSaveStore.getState().saveUnits['cutscene:base:second_scene'].dirty).toBe(true);
  });

  it('groups cutscenes in editor folders and restores folder membership with undo', () => {
    useEditorStore.getState().createCutscene('base:second', 'Second', 'Chapter One');
    const section = tree().find((node) => node.id === 'group:cutscenes')!;
    expect(section.children?.[0]).toMatchObject({
      kind: 'folder',
      label: 'Chapter One',
      children: [
        expect.objectContaining({
          document: expect.objectContaining({ cutsceneId: 'base:second' }),
        }),
      ],
    });
    useEditorStore.getState().undoCutscene();
    expect(useEditorStore.getState().cutsceneFolders['base:second']).toBeUndefined();
    expect(tree().find((node) => node.id === 'group:cutscenes')?.children).toHaveLength(1);
  });
});
