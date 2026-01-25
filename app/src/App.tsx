import { useState } from 'react';
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
import { EditorMode } from './types/editor';

function App() {
  const [leftOpen] = useState(true);
  const [rightOpen] = useState(true);
  const [editorMode, setEditorMode] = useState<EditorMode>('maps');

  const renderLeftPanelContent = () => {
    switch (editorMode) {
      case 'project':
        return <ProjectPanel />;
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
      <Box flex={1} overflow="hidden">
        {renderLeftPanelContent()}
      </Box>
    </Flex>
  );

  return (
    <AppLayout
      topBar={<TopBar />}
      leftPanel={LeftPanel}
      rightPanel={<PropertiesPanel />}
      viewport={<MainViewport mode={editorMode} />}
      leftPanelOpen={leftOpen}
      rightPanelOpen={rightOpen}
    />
  );
}

export default App;
