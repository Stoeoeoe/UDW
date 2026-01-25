import { Box, Flex } from '@chakra-ui/react';
import { AppLayout } from './components/layout/AppLayout';
import { TopBar } from './components/layout/TopBar';
import { Sidebar } from './components/navigation/Sidebar';
import { ProjectPanel } from './components/panels/ProjectPanel';
import { MapsPanel } from './components/panels/MapsPanel';
import { TilesetPanel } from './components/panels/TilesetPanel';
import { EntitiesPanel } from './components/panels/EntitiesPanel';
import { PropertiesPanel } from './components/panels/PropertiesPanel';
import { MainViewport } from './components/viewport/MainViewport';
import { LandingScreen } from './components/startup/LandingScreen';
import { useEditorStore } from './store/useEditorStore';

function App() {
  const project = useEditorStore(state => state.project);
  const editorMode = useEditorStore(state => state.mode);
  const setEditorMode = useEditorStore(state => state.setMode);

  if (!project) {
    return <LandingScreen />;
  }

  const isProjectMode = editorMode === 'project';

  const renderLeftPanelContent = () => {
    switch (editorMode) {
      case 'maps':
        return <MapsPanel />;
      case 'tilesets':
        return <TilesetPanel />;
      case 'entities':
        return <EntitiesPanel />;
      default:
        return null;
    }
  };

  const LeftPanel = (
    <Flex h="full">
      <Sidebar activeMode={editorMode} onModeChange={setEditorMode} />
      {!isProjectMode && (
        <Box flex={1} overflow="hidden">
          {renderLeftPanelContent()}
        </Box>
      )}
    </Flex>
  );

  return (
    <AppLayout
      topBar={<TopBar />}
      leftPanel={LeftPanel}
      rightPanel={!isProjectMode ? <PropertiesPanel /> : null}
      viewport={isProjectMode ? <ProjectPanel /> : <MainViewport mode={editorMode} />}
      leftPanelOpen={true}
      rightPanelOpen={!isProjectMode}
      leftWidth={isProjectMode ? "16" : "80"}
    />
  );
}

export default App;
