import React, { useEffect } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { watchScriptingManifest } from './store/useScriptingManifestStore';
import { TopBar } from './components/layout/TopBar';
import { AppShell } from './components/common/AppShell';
import { LandingScreen } from './components/startup/LandingScreen';
import { WorkspaceLoadingScreen } from './components/screens/common/WorkspaceLoadingScreen';
import { WorkspaceExplorer } from './components/navigation/WorkspaceExplorer';
import {
  WorkspaceCommandPalette,
  WorkspaceCommandPaletteButton,
} from './components/navigation/WorkspaceCommandPalette';
import { WorkspaceTabs } from './components/navigation/WorkspaceTabs';
import { ActiveWorkspaceDocument } from './components/workspace/WorkspaceDocumentViews';
import { useEditorStore, runEditorHistoryCommand } from './store/useEditorStore';
import { useWorkspaceStore } from './store/useWorkspaceStore';
import { useWorkspaceInit, useBeforeUnloadGuard } from './hooks/useWorkspaceInit';
import { useCommandPalette } from './hooks/useCommandPalette';
import { useWorkspaceTabs } from './hooks/useWorkspaceTabs';
import { Panel, PanelGroup } from 'react-resizable-panels';
import { EditorResizeHandle } from './components/common/EditorWorkspaceShell';

function App() {
  useEffect(watchScriptingManifest, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const command =
        key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' ? 'redo' : null;
      if (command && runEditorHistoryCommand(command, event.target)) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const project = useEditorStore((state) => state.project);
  const resourcesLoaded = useEditorStore((state) => state.resourcesLoaded);
  const resourceLoadingLabel = useEditorStore((state) => state.resourceLoadingLabel);
  const resourceLoadingProgress = useEditorStore((state) => state.resourceLoadingProgress);
  const mapFullscreen = useEditorStore((state) => state.mapFullscreen);

  const expandedNodeIds = useWorkspaceStore((state) => state.expandedNodeIds);
  const toggleNode = useWorkspaceStore((state) => state.toggleNode);

  const { treeNodes } = useWorkspaceInit();
  useBeforeUnloadGuard();

  const {
    tabs,
    activeTabId,
    activeTab,
    activateTab,
    pinTab,
    reorderTabs,
    handleOpenNode,
    handleOpenDocument,
    handleCloseTab,
  } = useWorkspaceTabs();

  const {
    isOpen: isCommandPaletteOpen,
    query: commandPaletteQuery,
    filter: commandPaletteFilter,
    results: commandPaletteResults,
    selectedIndex: commandPaletteSelectedIndex,
    open: openCommandPalette,
    close: closeCommandPalette,
    setQuery: setCommandPaletteQuery,
    setFilter: setCommandPaletteFilter,
    setSelectedIndex: setCommandPaletteSelectedIndex,
    openResult: handleOpenPaletteResult,
  } = useCommandPalette();

  const isMapFullscreen = mapFullscreen && activeTab?.document.kind === 'location';
  // Stable props, so the memoized explorer and tabs skip App renders that don't concern them.
  const paletteButton = React.useMemo(
    () => <WorkspaceCommandPaletteButton onClick={openCommandPalette} />,
    [openCommandPalette],
  );
  const closeTab = React.useCallback((tabId: string) => void handleCloseTab(tabId), [handleCloseTab]);

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
          isMapFullscreen ? (
            <Box h="full" overflow="hidden">
              <ActiveWorkspaceDocument tab={activeTab} />
            </Box>
          ) : (
            <PanelGroup
              direction="horizontal"
              autoSaveId="workspace-sidebar"
              style={{ height: '100%' }}
            >
              <Panel defaultSize={17} minSize={10} maxSize={28} order={1}>
                <Box h="full" borderRight="1px" borderColor="editorShellBorder" overflow="hidden">
                  <WorkspaceExplorer
                    nodes={treeNodes}
                    expandedNodeIds={expandedNodeIds}
                    activeTabId={activeTabId}
                    onToggleNode={toggleNode}
                    onOpenNode={handleOpenNode}
                    onOpenDocument={handleOpenDocument}
                    headerAction={paletteButton}
                  />
                </Box>
              </Panel>
              <EditorResizeHandle direction="horizontal" />
              <Panel order={2} minSize={50}>
                <Flex h="full" overflow="hidden" minW={0} direction="column">
                  <WorkspaceTabs
                    tabs={tabs}
                    activeTabId={activeTabId}
                    onActivate={activateTab}
                    onPin={pinTab}
                    onReorder={reorderTabs}
                    onClose={closeTab}
                  />
                  <Box flex={1} overflow="hidden" minH={0}>
                    <ActiveWorkspaceDocument tab={activeTab} />
                  </Box>
                </Flex>
              </Panel>
            </PanelGroup>
          )
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

export default App;
