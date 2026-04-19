import { Box, Flex } from '@chakra-ui/react';
import { TopBar } from './components/layout/TopBar';
import { Sidebar } from './components/navigation/Sidebar';
import { ProjectPanel } from './components/panels/ProjectPanel';
import { AppShell } from './components/common/AppShell';
import {
  MapEditor,
  TilesetEditor,
  EntityEditor,
  ActorEditor,
  DialogueEditor,
  VariableEditor,
  SettingsEditor,
  ItemEditor,
} from './components/screens';
import { ConfigurationEditor } from './components/screens/settings/ConfigurationEditor';
import { LandingScreen } from './components/startup/LandingScreen';
import { useEditorStore } from './store/useEditorStore';

function App() {
  const project = useEditorStore((state) => state.project);
  const editorMode = useEditorStore((state) => state.mode);
  const setEditorMode = useEditorStore((state) => state.setMode);

  if (!project) {
    return <LandingScreen />;
  }

  const renderEditor = () => {
    switch (editorMode) {
      case 'project':
        return <ProjectPanel />;
      case 'maps':
        return <MapEditor />;
      case 'tilesets':
        return <TilesetEditor />;
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
      case 'settings':
        return <SettingsEditor />;
      case 'config':
        return <ConfigurationEditor />;
      case 'terrain':
        return <ConfigurationEditor initialTab="terrain" />;
      case 'layers':
        return <ConfigurationEditor initialTab="layers" />;
      default:
        return null;
    }
  };

  return (
    <AppShell
      topBar={<TopBar />}
      workspace={
        <Flex flex={1} overflow="hidden" minH={0} h="full">
          <Sidebar activeMode={editorMode} onModeChange={setEditorMode} />
          <Box flex={1} overflow="hidden" h="full">
            {renderEditor()}
          </Box>
        </Flex>
      }
    />
  );
}

export default App;
