import React from 'react';
import { Box, Flex, Text, useToast } from '@chakra-ui/react';
import { TopBar } from './components/layout/TopBar';
import { AppShell } from './components/common/AppShell';
import { LandingScreen } from './components/startup/LandingScreen';
import { EmptyScreen } from './components/screens/common/EmptyScreen';
import { WorkspaceLoadingScreen } from './components/screens/common/WorkspaceLoadingScreen';
import { WorkspaceExplorer } from './components/navigation/WorkspaceExplorer';
import { WorkspaceTabs } from './components/navigation/WorkspaceTabs';
import {
  ActorEditor,
  DialogueEditor,
  EntityEditor,
  ItemEditor,
  MapEditor,
  TilesetEditor,
  VariableEditor,
  SettingsEditor,
} from './components/screens';
import { ConfigurationEditor } from './components/screens/settings/ConfigurationEditor';
import { useEditorStore } from './store/useEditorStore';
import { supportsPreviewTab, useWorkspaceStore } from './store/useWorkspaceStore';
import { buildWorkspaceTree } from './lib/workspaceTree';
import { documentFromHash, documentToHash } from './lib/workspaceRouting';
import {
  applyTabSession,
  captureTabSession,
  ensureDocumentSession,
} from './lib/workspaceController';
import { WorkspaceTab, WorkspaceTreeNode } from './types/workspace';
import { useSaveStore, getSaveUnitStatus } from './lib/saveManager';
import { persistWorkspaceSession, restoreWorkspaceSession } from './lib/workspacePersistence';
import { discardWorkspaceTabChanges } from './lib/workspaceSaveActions';

function App() {
  const project = useEditorStore((state) => state.project);
  const projectPath = useEditorStore((state) => state.projectPath);
  const resourcesLoaded = useEditorStore((state) => state.resourcesLoaded);
  const resourceLoadingLabel = useEditorStore((state) => state.resourceLoadingLabel);
  const resourceLoadingProgress = useEditorStore((state) => state.resourceLoadingProgress);
  const maps = useEditorStore((state) => state.maps);
  const tilesets = useEditorStore((state) => state.tilesets);

  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const expandedNodeIds = useWorkspaceStore((state) => state.expandedNodeIds);
  const openDocument = useWorkspaceStore((state) => state.openDocument);
  const activateTab = useWorkspaceStore((state) => state.activateTab);
  const closeTab = useWorkspaceStore((state) => state.closeTab);
  const pinTab = useWorkspaceStore((state) => state.pinTab);
  const reorderTabs = useWorkspaceStore((state) => state.reorderTabs);
  const restoreWorkspace = useWorkspaceStore((state) => state.restoreWorkspace);
  const toggleNode = useWorkspaceStore((state) => state.toggleNode);
  const setExpanded = useWorkspaceStore((state) => state.setExpanded);
  const resetWorkspace = useWorkspaceStore((state) => state.resetWorkspace);
  const dirtySaveUnitCount = useSaveStore(
    (state) => Object.values(state.saveUnits).filter((unit) => unit.dirty).length,
  );

  const treeNodes = React.useMemo(() => buildWorkspaceTree(maps, tilesets), [maps, tilesets]);
  const toast = useToast();
  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const previousTabRef = React.useRef<WorkspaceTab | null>(null);
  const initializedProjectPathRef = React.useRef<string | null>(null);

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

    const snapshot = { maps, tilesets };
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
    treeNodes,
    openDocument,
    activateTab,
    restoreWorkspace,
  ]);

  React.useEffect(() => {
    if (!project || !projectPath || !resourcesLoaded) return;

    const syncFromHash = () => {
      const document = documentFromHash(window.location.hash, { maps, tilesets });
      if (!document) return;

      const tab = openDocument(document);
      ensureDocumentSession(tab.document, tab.id);
      activateTab(tab.id);
    };

    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [project, projectPath, resourcesLoaded, maps, tilesets, openDocument, activateTab]);

  React.useEffect(() => {
    if (!projectPath || !resourcesLoaded) return;

    persistWorkspaceSession(projectPath, {
      tabs,
      activeTabId,
      expandedNodeIds,
    });
  }, [projectPath, resourcesLoaded, tabs, activeTabId, expandedNodeIds]);

  React.useEffect(() => {
    if (!dirtySaveUnitCount) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirtySaveUnitCount]);

  React.useEffect(() => {
    if (!project) return;

    const previousTab = previousTabRef.current;
    if (previousTab && previousTab.id !== activeTab?.id) {
      captureTabSession(previousTab);
    }

    if (activeTab) {
      applyTabSession(activeTab);
      useSaveStore.getState().setActiveSaveUnit(activeTab.document.saveUnitId);
      const nextHash = documentToHash(activeTab.document);
      if (window.location.hash !== nextHash) {
        window.history.replaceState(null, '', nextHash);
      }
    } else {
      useSaveStore.getState().setActiveSaveUnit(null);
    }

    previousTabRef.current = activeTab;
  }, [activeTab, project]);

  const handleOpenNode = React.useCallback(
    (node: WorkspaceTreeNode, options?: { pin?: boolean }) => {
      if (!node.document) return;
      const tab = openDocument(node.document, {
        preview: !options?.pin && supportsPreviewTab(node.document),
        pin: options?.pin,
      });
      ensureDocumentSession(tab.document, tab.id);
      activateTab(tab.id);
    },
    [activateTab, openDocument],
  );

  const handleCloseTab = React.useCallback(
    async (tabId: string) => {
      const tab = tabs.find((entry) => entry.id === tabId);
      if (!tab) return;

      const saveUnitStatus = getSaveUnitStatus(tab.document.saveUnitId);
      const relatedOpenTabs = tabs.filter(
        (entry) => entry.id !== tabId && entry.document.saveUnitId === tab.document.saveUnitId,
      );

      if (saveUnitStatus.dirty) {
        const currentActiveTab = tabs.find((entry) => entry.id === activeTabId) ?? null;
        const affectsOtherTabs = relatedOpenTabs.length > 0;
        const confirmed = confirm(
          affectsOtherTabs
            ? `Close "${tab.document.label}" and discard unsaved changes for this resource? This will also revert the content shown in ${relatedOpenTabs.length} other open tab${relatedOpenTabs.length === 1 ? '' : 's'}.`
            : `Close "${tab.document.label}" and discard its unsaved changes? This will throw away your in-memory edits.`,
        );
        if (!confirmed) return;

        try {
          await discardWorkspaceTabChanges(tab);
        } catch (error) {
          toast({
            title: 'Discard failed',
            description: error instanceof Error ? error.message : 'Unknown error',
            status: 'error',
            duration: 4000,
          });
          return;
        }

        if (
          currentActiveTab &&
          currentActiveTab.id !== tabId &&
          currentActiveTab.document.saveUnitId === tab.document.saveUnitId
        ) {
          applyTabSession(currentActiveTab);
        }
      }

      if (activeTabId === tabId) {
        captureTabSession(tab);
      }
      closeTab(tabId);
    },
    [activeTabId, closeTab, tabs, toast],
  );

  if (!project) {
    return <LandingScreen />;
  }

  if (!resourcesLoaded) {
    return (
      <AppShell
        topBar={<TopBar />}
        workspace={
          <WorkspaceLoadingScreen
            projectName={project.name}
            label={resourceLoadingLabel}
            progress={resourceLoadingProgress}
          />
        }
        status={<Text>{resourceLoadingLabel ?? 'Loading project resources...'}</Text>}
      />
    );
  }

  return (
    <AppShell
      topBar={<TopBar />}
      workspace={
        <Flex flex={1} overflow="hidden" minH={0} h="full">
          <Box
            w="72"
            flexShrink={0}
            borderRight="1px"
            borderColor="editorShellBorder"
            overflow="hidden"
          >
            <WorkspaceExplorer
              nodes={treeNodes}
              expandedNodeIds={expandedNodeIds}
              activeTabId={activeTabId}
              onToggleNode={toggleNode}
              onOpenNode={handleOpenNode}
            />
          </Box>
          <Flex flex={1} overflow="hidden" minW={0} direction="column">
            <WorkspaceTabs
              tabs={tabs}
              activeTabId={activeTabId}
              onActivate={activateTab}
              onPin={pinTab}
              onReorder={reorderTabs}
              onClose={(tabId) => void handleCloseTab(tabId)}
            />
            <Box flex={1} overflow="hidden" minH={0}>
              <ActiveWorkspaceDocument tab={activeTab} />
            </Box>
          </Flex>
        </Flex>
      }
    />
  );
}

const ActiveWorkspaceDocument: React.FC<{ tab: WorkspaceTab | null }> = ({ tab }) => {
  const openDocument = useWorkspaceStore((state) => state.openDocument);

  if (!tab) {
    return (
      <EmptyScreen
        icon="🗂️"
        title="No Document Open"
        description="Choose a location, tileset, settings page, or configuration screen from the explorer."
      />
    );
  }

  switch (tab.document.kind) {
    case 'location':
      return <MapEditor />;
    case 'tileset':
      return <TilesetEditor />;
    case 'settings':
      return <SettingsEditor />;
    case 'configuration': {
      const configurationDocument = tab.document;
      const handleConfigurationTabChange = React.useCallback(
        (configTab: NonNullable<typeof configurationDocument.configTab>) => {
          if ((configurationDocument.configTab ?? 'terrain') === configTab) {
            return;
          }

          openDocument({
            ...configurationDocument,
            configTab,
          });
        },
        [configurationDocument, openDocument],
      );

      return (
        <ConfigurationEditor
          initialTab={configurationDocument.configTab ?? 'terrain'}
          onTabChange={handleConfigurationTabChange}
        />
      );
    }
    case 'entities':
      return <EntityEditor />;
    case 'actors':
      return <ActorEditor />;
    case 'items':
      return <ItemEditor />;
    case 'dialogues':
      return <DialogueEditor />;
    case 'scripting':
      return <VariableEditor />;
    default:
      return null;
  }
};

function getPreferredInitialDocument(nodes: WorkspaceTreeNode[]): WorkspaceTreeNode | null {
  const primaryDocument = findFirstDocument(
    nodes,
    (node) => node.document?.kind === 'location' || node.document?.kind === 'tileset',
  );
  if (primaryDocument) {
    return primaryDocument;
  }

  return findFirstDocument(nodes, () => true);
}

function findFirstDocument(
  nodes: WorkspaceTreeNode[],
  predicate: (node: WorkspaceTreeNode) => boolean,
): WorkspaceTreeNode | null {
  for (const node of nodes) {
    if (node.document && predicate(node)) {
      return node;
    }
    if (node.children?.length) {
      const child = findFirstDocument(node.children, predicate);
      if (child) return child;
    }
  }
  return null;
}

function collectDefaultExpandedNodeIds(nodes: WorkspaceTreeNode[]): string[] {
  const collected: string[] = [];
  for (const node of nodes) {
    if (node.defaultExpanded) {
      collected.push(node.id);
    }
    if (node.children?.length) {
      collected.push(...collectDefaultExpandedNodeIds(node.children));
    }
  }
  return collected;
}

export default App;
