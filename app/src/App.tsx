import React from 'react';
import { Box, Flex, Text, useToast } from '@chakra-ui/react';
import { TopBar } from './components/layout/TopBar';
import { AppShell } from './components/common/AppShell';
import { LandingScreen } from './components/startup/LandingScreen';
import { EmptyScreen } from './components/screens/common/EmptyScreen';
import { WorkspaceLoadingScreen } from './components/screens/common/WorkspaceLoadingScreen';
import { WorkspaceExplorer } from './components/navigation/WorkspaceExplorer';
import {
  WorkspaceCommandPalette,
  WorkspaceCommandPaletteButton,
} from './components/navigation/WorkspaceCommandPalette';
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
import {
  buildWorkspaceTree,
  collectDefaultExpandedNodeIds,
  findFirstDocument,
} from './lib/workspaceTree';
import { documentFromHash, documentToHash } from './lib/workspaceRouting';
import {
  applyTabSession,
  captureTabSession,
  ensureDocumentSession,
} from './lib/workspaceController';
import { WorkspaceDocument, WorkspaceTab, WorkspaceTreeNode } from './types/workspace';
import { useSaveStore, getSaveUnitStatus } from './lib/saveManager';
import { persistWorkspaceSession, restoreWorkspaceSession } from './lib/workspacePersistence';
import { discardWorkspaceTabChanges } from './lib/workspaceSaveActions';
import {
  buildCommandPaletteResources,
  CommandPaletteFilter,
  CommandPaletteMatch,
  searchCommandPaletteResources,
} from './lib/workspaceCommandPalette';

function App() {
  const project = useEditorStore((state) => state.project);
  const projectPath = useEditorStore((state) => state.projectPath);
  const resourcesLoaded = useEditorStore((state) => state.resourcesLoaded);
  const resourceLoadingLabel = useEditorStore((state) => state.resourceLoadingLabel);
  const resourceLoadingProgress = useEditorStore((state) => state.resourceLoadingProgress);
  const maps = useEditorStore((state) => state.maps);
  const tilesets = useEditorStore((state) => state.tilesets);
  const entityTypes = useEditorStore((state) => state.entityTypes);
  const actors = useEditorStore((state) => state.actors);
  const items = useEditorStore((state) => state.items);
  const dialogueIndex = useEditorStore((state) => state.dialogueIndex);
  const gameVariables = useEditorStore((state) => state.gameVariables);
  const selectedEntityTypeId = useEditorStore((state) => state.selectedEntityTypeId);
  const selectedActorId = useEditorStore((state) => state.selectedActorId);
  const selectedItemId = useEditorStore((state) => state.selectedItemId);
  const selectedDialogueId = useEditorStore((state) => state.selectedDialogueId);

  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const expandedNodeIds = useWorkspaceStore((state) => state.expandedNodeIds);
  const recentResourceKeys = useWorkspaceStore((state) => state.recentResourceKeys);
  const openDocument = useWorkspaceStore((state) => state.openDocument);
  const activateTab = useWorkspaceStore((state) => state.activateTab);
  const closeTab = useWorkspaceStore((state) => state.closeTab);
  const pinTab = useWorkspaceStore((state) => state.pinTab);
  const reorderTabs = useWorkspaceStore((state) => state.reorderTabs);
  const restoreWorkspace = useWorkspaceStore((state) => state.restoreWorkspace);
  const toggleNode = useWorkspaceStore((state) => state.toggleNode);
  const setExpanded = useWorkspaceStore((state) => state.setExpanded);
  const markRecentResource = useWorkspaceStore((state) => state.markRecentResource);
  const resetWorkspace = useWorkspaceStore((state) => state.resetWorkspace);
  const dirtySaveUnitCount = useSaveStore(
    (state) => Object.values(state.saveUnits).filter((unit) => unit.dirty).length,
  );

  const treeNodes = React.useMemo(
    () =>
      buildWorkspaceTree({
        maps,
        tilesets,
        actors,
        entityTypes,
        items,
        dialogueEntries: dialogueIndex?.dialogues ?? [],
        gameVariables,
      }),
    [maps, tilesets, actors, entityTypes, items, dialogueIndex, gameVariables],
  );
  const toast = useToast();
  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const previousTabRef = React.useRef<WorkspaceTab | null>(null);
  const initializedProjectPathRef = React.useRef<string | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = React.useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = React.useState('');
  const [commandPaletteFilter, setCommandPaletteFilter] =
    React.useState<CommandPaletteFilter>('all');
  const [commandPaletteSelectedIndex, setCommandPaletteSelectedIndex] = React.useState(-1);

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
      actors,
      entityTypes,
      items,
      dialogueEntries: dialogueIndex?.dialogues ?? [],
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
    actors,
    entityTypes,
    items,
    dialogueIndex,
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
        actors,
        entityTypes,
        items,
        dialogueEntries: dialogueIndex?.dialogues ?? [],
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
    actors,
    entityTypes,
    items,
    dialogueIndex,
    gameVariables,
    openDocument,
    activateTab,
  ]);

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

  const commandPaletteResources = React.useMemo(
    () =>
      buildCommandPaletteResources({
        maps,
        tilesets,
        entityTypes,
        actors,
        items,
        dialogueIndex,
      }),
    [actors, dialogueIndex, entityTypes, items, maps, tilesets],
  );

  const commandPaletteResourceMap = React.useMemo(
    () => new Map(commandPaletteResources.map((resource) => [resource.key, resource])),
    [commandPaletteResources],
  );

  const commandPaletteResults = React.useMemo(() => {
    if (!commandPaletteQuery.trim()) {
      return recentResourceKeys
        .map((key) => commandPaletteResourceMap.get(key))
        .filter((resource): resource is NonNullable<typeof resource> => resource !== undefined)
        .map(
          (resource, index): CommandPaletteMatch => ({
            resource,
            matchedField: 'label',
            labelMatchIndices: [],
            secondaryMatchIndices: [],
            score: 1000 - index,
          }),
        )
        .filter((match) => filterCommandPaletteMatch(match, commandPaletteFilter));
    }

    return searchCommandPaletteResources(
      commandPaletteResources,
      commandPaletteQuery,
      commandPaletteFilter,
    );
  }, [
    commandPaletteFilter,
    commandPaletteQuery,
    commandPaletteResourceMap,
    commandPaletteResources,
    recentResourceKeys,
  ]);

  const openCommandPalette = React.useCallback(() => {
    setCommandPaletteQuery('');
    setCommandPaletteFilter('all');
    setCommandPaletteSelectedIndex(-1);
    setIsCommandPaletteOpen(true);
  }, []);

  const closeCommandPalette = React.useCallback(() => {
    setIsCommandPaletteOpen(false);
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isPrimaryModifier = event.ctrlKey || event.metaKey;
      if (!isPrimaryModifier || event.defaultPrevented || event.key.toLowerCase() !== 'p') {
        return;
      }

      event.preventDefault();
      if (isCommandPaletteOpen) {
        closeCommandPalette();
        return;
      }

      openCommandPalette();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [closeCommandPalette, isCommandPaletteOpen, openCommandPalette]);

  React.useEffect(() => {
    const handleOpenCommandPalette = () => {
      if (isCommandPaletteOpen) {
        closeCommandPalette();
        return;
      }

      openCommandPalette();
    };

    window.addEventListener('openCommandPalette', handleOpenCommandPalette as EventListener);
    return () =>
      window.removeEventListener('openCommandPalette', handleOpenCommandPalette as EventListener);
  }, [closeCommandPalette, isCommandPaletteOpen, openCommandPalette]);

  React.useEffect(() => {
    if (!activeTab) return;
    const doc = activeTab.document;

    if (doc.kind === 'location') {
      markRecentResource(`location:${doc.mapId}`);
      return;
    }
    if (doc.kind === 'tileset') {
      markRecentResource(`tileset:${doc.tilesetId}`);
      return;
    }
    if (doc.kind === 'actor') {
      markRecentResource(`actor:${doc.actorId}`);
      return;
    }
    if (doc.kind === 'entity') {
      markRecentResource(`entity:${doc.entityTypeId}`);
      return;
    }
    if (doc.kind === 'item') {
      markRecentResource(`item:${doc.itemId}`);
      return;
    }
    if (doc.kind === 'dialogue') {
      markRecentResource(`dialogue:${doc.dialogueId}`);
      return;
    }

    // Legacy screen tabs — still mark selection-based recents for backward compat
    if (doc.kind === 'entities' && selectedEntityTypeId) {
      markRecentResource(`entity:${selectedEntityTypeId}`);
      return;
    }
    if (doc.kind === 'actors' && selectedActorId) {
      markRecentResource(`actor:${selectedActorId}`);
      return;
    }
    if (doc.kind === 'items' && selectedItemId) {
      markRecentResource(`item:${selectedItemId}`);
      return;
    }
    if (doc.kind === 'dialogues' && selectedDialogueId) {
      markRecentResource(`dialogue:${selectedDialogueId}`);
    }
  }, [
    activeTab,
    markRecentResource,
    selectedActorId,
    selectedDialogueId,
    selectedEntityTypeId,
    selectedItemId,
  ]);

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

  const handleOpenDocument = React.useCallback(
    (document: WorkspaceDocument, options?: { pin?: boolean }) => {
      const tab = openDocument(document, {
        preview: !options?.pin && supportsPreviewTab(document),
        pin: options?.pin,
      });
      ensureDocumentSession(tab.document, tab.id);
      activateTab(tab.id);
    },
    [activateTab, openDocument],
  );

  const handleOpenPaletteResult = React.useCallback(
    (result: CommandPaletteMatch, options?: { pin?: boolean }) => {
      const tab = openDocument(result.resource.document, {
        preview: !options?.pin && supportsPreviewTab(result.resource.document),
        pin: options?.pin,
      });
      ensureDocumentSession(tab.document, tab.id);
      activateTab(tab.id);
      markRecentResource(result.resource.key);
      closeCommandPalette();
    },
    [activateTab, closeCommandPalette, markRecentResource, openDocument],
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
    <>
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
                onOpenDocument={handleOpenDocument}
                headerAction={<WorkspaceCommandPaletteButton onClick={openCommandPalette} />}
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
      <WorkspaceCommandPalette
        isOpen={isCommandPaletteOpen}
        query={commandPaletteQuery}
        filter={commandPaletteFilter}
        results={commandPaletteResults}
        selectedIndex={commandPaletteSelectedIndex}
        onClose={closeCommandPalette}
        onQueryChange={setCommandPaletteQuery}
        onFilterChange={setCommandPaletteFilter}
        onSelectedIndexChange={setCommandPaletteSelectedIndex}
        onOpenResult={handleOpenPaletteResult}
      />
    </>
  );
}

const ActiveWorkspaceDocument: React.FC<{ tab: WorkspaceTab | null }> = ({ tab }) => {
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
    case 'configuration':
      return <ConfigurationWorkspaceDocument document={tab.document} />;
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
    case 'actor':
      return <ActorResourceDocument actorId={tab.document.actorId} />;
    case 'entity':
      return <EntityResourceDocument entityTypeId={tab.document.entityTypeId} />;
    case 'item':
      return <ItemResourceDocument itemId={tab.document.itemId} />;
    case 'dialogue':
      return <DialogueResourceDocument dialogueId={tab.document.dialogueId} />;
    case 'variable':
      return <VariableResourceDocument variableKey={tab.document.variableKey} />;
    default:
      return null;
  }
};

const ConfigurationWorkspaceDocument: React.FC<{
  document: Extract<WorkspaceTab['document'], { kind: 'configuration' }>;
}> = ({ document }) => {
  const openDocument = useWorkspaceStore((state) => state.openDocument);

  const handleConfigurationTabChange = React.useCallback(
    (configTab: NonNullable<typeof document.configTab>) => {
      if ((document.configTab ?? 'terrain') === configTab) {
        return;
      }

      openDocument({
        ...document,
        configTab,
      });
    },
    [document, openDocument],
  );

  return (
    <ConfigurationEditor
      initialTab={document.configTab ?? 'terrain'}
      onTabChange={handleConfigurationTabChange}
    />
  );
};

// ─── Per-resource document wrappers ──────────────────────────────────────────
// Each syncs the store selection on mount so the existing screen shows the
// correct item, then renders the full editor screen.

const ActorResourceDocument: React.FC<{ actorId: string }> = ({ actorId }) => {
  const setSelectedActor = useEditorStore((state) => state.setSelectedActor);
  React.useEffect(() => {
    setSelectedActor(actorId);
  }, [actorId, setSelectedActor]);
  return <ActorEditor />;
};

const EntityResourceDocument: React.FC<{ entityTypeId: string }> = ({ entityTypeId }) => {
  const setSelectedEntityType = useEditorStore((state) => state.setSelectedEntityType);
  React.useEffect(() => {
    setSelectedEntityType(entityTypeId);
  }, [entityTypeId, setSelectedEntityType]);
  return <EntityEditor />;
};

const ItemResourceDocument: React.FC<{ itemId: string }> = ({ itemId }) => {
  const setSelectedItem = useEditorStore((state) => state.setSelectedItem);
  React.useEffect(() => {
    setSelectedItem(itemId);
  }, [itemId, setSelectedItem]);
  return <ItemEditor />;
};

const DialogueResourceDocument: React.FC<{ dialogueId: string }> = ({ dialogueId }) => {
  React.useEffect(() => {
    useEditorStore.setState((state) => {
      state.selectedDialogueId = dialogueId;
      state.selectedDialogueNodeId = null;
    });
  }, [dialogueId]);
  return <DialogueEditor />;
};

const VariableResourceDocument: React.FC<{ variableKey: string }> = () => {
  return <VariableEditor />;
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

function filterCommandPaletteMatch(
  match: CommandPaletteMatch,
  filter: CommandPaletteFilter,
): boolean {
  if (filter === 'all') return true;

  switch (filter) {
    case 'locations':
      return match.resource.type === 'location';
    case 'tilesets':
      return match.resource.type === 'tileset';
    case 'entities':
      return match.resource.type === 'entity';
    case 'actors':
      return match.resource.type === 'actor';
    case 'items':
      return match.resource.type === 'item';
    case 'dialogues':
      return match.resource.type === 'dialogue';
    case 'quests':
      return match.resource.type === 'quest';
    case 'audio':
      return match.resource.type === 'audio';
    default:
      return true;
  }
}

export default App;
