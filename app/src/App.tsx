import { Box, Flex } from '@chakra-ui/react';
import { TopBar } from './components/layout/TopBar';
import { Sidebar } from './components/navigation/Sidebar';
import { ProjectPanel } from './components/panels/ProjectPanel';
import {
  MapEditor,
  TilesetEditor,
  EntityEditor,
  ActorEditor,
  DialogueEditor,
  VariableEditor,
  SettingsEditor,
} from './components/screens';
import { MapSettingsEditor } from './components/screens/settings/MapSettingsEditor';
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
      case 'dialogues':
        return <DialogueEditor />;
      case 'scripting':
        return <VariableEditor />;
      case 'settings':
        return <SettingsEditor />;
      case 'mapConfig':
        return <MapSettingsEditor />;
      case 'terrain':
        return <MapSettingsEditor initialTab="terrain" />;
      case 'layers':
        return <MapSettingsEditor initialTab="layers" />;
      default:
        return null;
    }
  };

  return (
    <Flex
      direction="column"
      h="100vh"
      w="100vw"
      overflow="hidden"
      bg="gray.900"
      color="gray.200"
      userSelect="none"
    >
      {/* Top Bar */}
      <Box
        h="12"
        borderBottom="1px"
        borderColor="gray.800"
        bg="gray.950"
        zIndex="20"
        flexShrink={0}
      >
        <TopBar />
      </Box>

      {/* Main Workspace */}
      <Flex flex={1} overflow="hidden" minH={0}>
        {/* Sidebar (always visible) */}
        <Sidebar activeMode={editorMode} onModeChange={setEditorMode} />

        {/* Editor Content */}
        <Box flex={1} overflow="hidden">
          {renderEditor()}
        </Box>
      </Flex>

      {/* Status Bar */}
      <Flex
        h="6"
        bg="gray.900"
        borderTop="1px"
        borderColor="gray.800"
        alignItems="center"
        px="2"
        fontSize="xs"
        color="gray.500"
        zIndex="20"
        flexShrink={0}
      >
        Ready
      </Flex>
    </Flex>
  );
}

export default App;
