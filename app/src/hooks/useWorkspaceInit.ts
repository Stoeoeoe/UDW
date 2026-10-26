import React from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { getDocumentSaveUnitId, useWorkspaceStore } from '../store/useWorkspaceStore';
import {
  buildWorkspaceTree,
  collectDefaultExpandedNodeIds,
  findFirstDocument,
} from '../lib/workspaceTree';
import { documentFromHash, documentToHash } from '../lib/workspaceRouting';
import {
  applyTabSession,
  captureTabSession,
  ensureDocumentSession,
} from '../lib/workspaceController';
import { WorkspaceTab, WorkspaceTreeNode } from '../types/workspace';
import { useSaveStore } from '../lib/saveManager';
import { persistWorkspaceSession, restoreWorkspaceSession } from '../lib/workspacePersistence';

function getPreferredInitialDocument(nodes: WorkspaceTreeNode[]): WorkspaceTreeNode | null {
  const primaryDocument = findFirstDocument(
    nodes,
    (node) => node.document?.kind === 'location' || node.document?.kind === 'tileset',
  );
  if (primaryDocument) return primaryDocument;
  return findFirstDocument(nodes, () => true);
}

export function useWorkspaceInit() {
  const project = useEditorStore((state) => state.project);
  const projectPath = useEditorStore((state) => state.projectPath);
  const resourcesLoaded = useEditorStore((state) => state.resourcesLoaded);
  const maps = useEditorStore((state) => state.maps);
  const tilesets = useEditorStore((state) => state.tilesets);
  const entityTypes = useEditorStore((state) => state.entityTypes);
  const characters = useEditorStore((state) => state.characters);
  const items = useEditorStore((state) => state.items);
  const dialogues = useEditorStore((state) => state.dialogues);
  const cutscenes = useEditorStore((s) => s.cutscenes);
  const cutsceneLabels = useEditorStore((s) => s.cutsceneLabels);
  const cutsceneFolders = useEditorStore((s) => s.cutsceneFolders);
  const gameVariables = useEditorStore((state) => state.gameVariables);

  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const expandedNodeIds = useWorkspaceStore((state) => state.expandedNodeIds);
  const openDocument = useWorkspaceStore((state) => state.openDocument);
  const activateTab = useWorkspaceStore((state) => state.activateTab);
  const restoreWorkspace = useWorkspaceStore((state) => state.restoreWorkspace);
  const setExpanded = useWorkspaceStore((state) => state.setExpanded);
  const resetWorkspace = useWorkspaceStore((state) => state.resetWorkspace);

  const treeNodes = React.useMemo(
    () =>
      buildWorkspaceTree({
        maps,
        tilesets,
        characters,
        entityTypes,
        items,
        dialogues: Array.from(dialogues.values()),
        cutscenes,
        cutsceneLabels,
        cutsceneFolders,
        gameVariables,
      }),
    [
      maps,
      tilesets,
      characters,
      entityTypes,
      items,
      dialogues,
      cutscenes,
      cutsceneLabels,
      cutsceneFolders,
      gameVariables,
    ],
  );

  const initializedProjectPathRef = React.useRef<string | null>(null);
  const previousTabRef = React.useRef<WorkspaceTab | null>(null);

  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );

  React.useEffect(() => {
    collectDefaultExpandedNodeIds(treeNodes).forEach((nodeId) => setExpanded(nodeId, true));
  }, [setExpanded, treeNodes]);

  React.useEffect(() => {
    if (!resourcesLoaded) {
      initializedProjectPathRef.current = null;
    }
  }, [resourcesLoaded]);

  React.useEffect(() => {
    if (!project || !projectPath) {
      resetWorkspace();
      useSaveStore.getState().setActiveSaveUnit(null);
      previousTabRef.current = null;
      initializedProjectPathRef.current = null;
    }
  }, [project, projectPath, resetWorkspace]);

  React.useEffect(() => {
    if (!project || !projectPath || !resourcesLoaded) return;
    if (initializedProjectPathRef.current === projectPath) return;

    const snapshot = {
      maps,
      tilesets,
      characters,
      entityTypes,
      items,
      dialogues: Array.from(dialogues.values()),
      cutscenes,
      cutsceneLabels,
      cutsceneFolders,
      gameVariables,
    };
    const restored = restoreWorkspaceSession(projectPath, snapshot);

    if (restored) {
      restoreWorkspace(restored);
      restored.tabs.forEach((tab) => ensureDocumentSession(tab.document, tab.id));
    }

    const routeDocument = documentFromHash(window.location.hash, snapshot);
    if (routeDocument) {
      const tab = openDocument(routeDocument);
      ensureDocumentSession(tab.document, tab.id);
      activateTab(tab.id);
    } else if (!restored?.tabs.length) {
      const fallback = getPreferredInitialDocument(treeNodes);
      if (fallback?.document) {
        const tab = openDocument(fallback.document);
        ensureDocumentSession(tab.document, tab.id);
        activateTab(tab.id);
      }
    }

    initializedProjectPathRef.current = projectPath;
  }, [
    project,
    projectPath,
    resourcesLoaded,
    maps,
    tilesets,
    characters,
    entityTypes,
    items,
    dialogues,
    cutscenes,
    cutsceneLabels,
    cutsceneFolders,
    gameVariables,
    treeNodes,
    openDocument,
    activateTab,
    restoreWorkspace,
  ]);

  React.useEffect(() => {
    if (!project || !projectPath || !resourcesLoaded) return;

    const syncFromHash = () => {
      const document = documentFromHash(window.location.hash, {
        maps,
        tilesets,
        characters,
        entityTypes,
        items,
        dialogues: Array.from(dialogues.values()),
        cutscenes,
        cutsceneLabels,
        cutsceneFolders,
        gameVariables,
      });
      if (!document) return;
      const tab = openDocument(document);
      ensureDocumentSession(tab.document, tab.id);
      activateTab(tab.id);
    };

    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [
    project,
    projectPath,
    resourcesLoaded,
    maps,
    tilesets,
    characters,
    entityTypes,
    items,
    dialogues,
    cutscenes,
    cutsceneLabels,
    cutsceneFolders,
    gameVariables,
    openDocument,
    activateTab,
  ]);

  React.useEffect(() => {
    if (!projectPath || !resourcesLoaded) return;
    persistWorkspaceSession(projectPath, { tabs, activeTabId, expandedNodeIds });
  }, [projectPath, resourcesLoaded, tabs, activeTabId, expandedNodeIds]);

  React.useEffect(() => {
    if (!project) return;

    const previousTab = previousTabRef.current;
    if (previousTab && previousTab.id !== activeTab?.id) {
      captureTabSession(previousTab);
    }

    if (activeTab) {
      applyTabSession(activeTab);
      useSaveStore.getState().setActiveSaveUnit(getDocumentSaveUnitId(activeTab.document));
      const nextHash = documentToHash(activeTab.document);
      if (window.location.hash !== nextHash) {
        window.history.replaceState(null, '', nextHash);
      }
    } else {
      useSaveStore.getState().setActiveSaveUnit(null);
    }

    previousTabRef.current = activeTab;
  }, [activeTab, project]);

  return { treeNodes, activeTab };
}

export function useBeforeUnloadGuard() {
  const dirtySaveUnitCount = useSaveStore(
    (state) => Object.values(state.saveUnits).filter((unit) => unit.dirty).length,
  );

  React.useEffect(() => {
    if (!dirtySaveUnitCount) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirtySaveUnitCount]);
}
