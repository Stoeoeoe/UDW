import { Box, Flex, Text } from '@chakra-ui/react';
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
import { useEditorStore } from './store/useEditorStore';
import { useWorkspaceStore } from './store/useWorkspaceStore';
import { useWorkspaceInit, useBeforeUnloadGuard } from './hooks/useWorkspaceInit';
import { useCommandPalette } from './hooks/useCommandPalette';
import { useWorkspaceTabs } from './hooks/useWorkspaceTabs';

function App() {
  const project = useEditorStore((state) => state.project);
  const resourcesLoaded = useEditorStore((state) => state.resourcesLoaded);
  const resourceLoadingLabel = useEditorStore((state) => state.resourceLoadingLabel);
  const resourceLoadingProgress = useEditorStore((state) => state.resourceLoadingProgress);

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

export default App;
