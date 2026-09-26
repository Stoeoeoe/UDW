import React from 'react';
import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Text,
  useToast,
} from '@chakra-ui/react';
import { FiSearch } from 'react-icons/fi';
import { useEditorStore } from '../../store/useEditorStore';
import { fileSystem } from '../../lib/fileSystem';
import { TilesetToolbar } from '../screens/tileset/TilesetToolbar';
import { MapToolbar, MapToolbarActions } from './MapToolbar';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import {
  canSaveWorkspaceTab,
  saveAllDirtyWorkspaceUnits,
  saveWorkspaceTab,
} from '../../lib/workspaceSaveActions';
import { useSaveStore } from '../../lib/saveManager';

export const TopBar: React.FC = () => {
  const closeProject = useEditorStore((state) => state.closeProject);
  const loadProject = useEditorStore((state) => state.loadProject);
  const loadProjectResources = useEditorStore((state) => state.loadProjectResources);
  const project = useEditorStore((state) => state.project);
  const toast = useToast();

  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const resetWorkspace = useWorkspaceStore((state) => state.resetWorkspace);
  const dirtySaveUnitCount = useSaveStore(
    (state) => Object.values(state.saveUnits).filter((unit) => unit.dirty).length,
  );

  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const canSaveActiveTab = canSaveWorkspaceTab(activeTab);

  const handleSave = React.useCallback(async () => {
    if (!canSaveActiveTab) return;

    try {
      await saveWorkspaceTab(activeTab);
      toast({
        title: 'Saved',
        status: 'success',
        duration: 1800,
      });
    } catch (error: unknown) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 4000,
      });
    }
  }, [activeTab, canSaveActiveTab, toast]);

  const handleSaveAll = React.useCallback(async () => {
    try {
      await saveAllDirtyWorkspaceUnits();
      toast({
        title: 'All documents saved',
        status: 'success',
        duration: 1800,
      });
    } catch (error: unknown) {
      toast({
        title: 'Save all failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 4000,
      });
    }
  }, [toast]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isPrimaryModifier = event.ctrlKey || event.metaKey;
      if (!isPrimaryModifier || event.defaultPrevented) {
        return;
      }

      if (event.key.toLowerCase() !== 's') {
        return;
      }

      event.preventDefault();

      if (event.shiftKey) {
        void handleSaveAll();
        return;
      }

      if (canSaveActiveTab) {
        void handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [canSaveActiveTab, handleSave, handleSaveAll]);

  const handleCloseProject = () => {
    const message =
      dirtySaveUnitCount > 0
        ? `Close the project? ${dirtySaveUnitCount} unsaved document${dirtySaveUnitCount === 1 ? '' : 's'} will remain unsaved.`
        : 'Are you sure you want to close the project?';
    if (!confirm(message)) {
      return;
    }

    resetWorkspace();
    useSaveStore.getState().reset();
    closeProject();
    window.history.replaceState(null, '', '#/');
  };

  const handleOpenProject = async () => {
    try {
      const { project: nextProject, path } = await fileSystem.openProject();
      resetWorkspace();
      useSaveStore.getState().reset();
      await loadProject(path, nextProject);
      await loadProjectResources();
      window.history.replaceState(null, '', '#/');
      toast({
        title: 'Project opened',
        description: `Switched to ${nextProject.name}`,
        status: 'success',
        duration: 3000,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message !== 'Open project cancelled.') {
        console.error(error);
        toast({
          title: 'Failed to open project',
          description: error.message,
          status: 'error',
          duration: 5000,
        });
      }
    }
  };

  const handleOpenCommandPalette = React.useCallback(() => {
    window.dispatchEvent(new CustomEvent('openCommandPalette'));
  }, []);

  return (
    <Flex align="center" justify="space-between" h="full" px="4" userSelect="none">
      <HStack spacing="6">
        <HStack spacing="2">
          <Flex
            w="6"
            h="6"
            bg="blue.600"
            rounded="md"
            align="center"
            justify="center"
            fontWeight="bold"
            color="white"
            fontSize="xs"
            boxShadow="sm"
          >
            VE
          </Flex>
          <Text fontWeight="semibold" color="gray.300" fontSize="sm" letterSpacing="tight">
            {project?.name || 'Vulcanus Editor'}
          </Text>
        </HStack>

        <Box h="6" w="1px" bg="gray.700" />

        <HStack spacing="1">
          <Menu gutter={8}>
            <MenuButton
              as={Button}
              variant="ghost"
              size="xs"
              color="gray.400"
              _active={{ bg: 'gray.700' }}
              fontWeight="medium"
            >
              File
            </MenuButton>
            <MenuList
              bg="editorCanvasBg"
              borderColor="editorBorderLight"
              color="gray.200"
              boxShadow="xl"
              py="1"
              zIndex="50"
            >
              <MenuItem
                bg="transparent"
                _hover={{ bg: 'editorPanelBg' }}
                onClick={handleOpenProject}
              >
                Open Project...
              </MenuItem>
              <MenuItem
                bg="transparent"
                _hover={{ bg: 'editorPanelBg' }}
                onClick={() => void handleSave()}
                isDisabled={!canSaveActiveTab}
              >
                Save
              </MenuItem>
              <MenuItem
                bg="transparent"
                _hover={{ bg: 'editorPanelBg' }}
                onClick={() => void handleSaveAll()}
              >
                Save All
              </MenuItem>
              <MenuDivider borderColor="editorBorderLight" />
              <MenuItem
                bg="transparent"
                _hover={{ bg: 'editorPanelBg' }}
                color="red.400"
                onClick={handleCloseProject}
              >
                Close Project
              </MenuItem>
            </MenuList>
          </Menu>
        </HStack>
      </HStack>

      {activeTab?.document.kind === 'location' ? (
        <MapToolbar />
      ) : activeTab?.document.kind === 'tileset' ? (
        <TilesetToolbar />
      ) : (
        <Box />
      )}

      <HStack spacing="3">
        {activeTab?.document.kind === 'location' && <MapToolbarActions />}
        <IconButton
          aria-label="Open command palette"
          icon={<FiSearch />}
          size="sm"
          variant="ghost"
          onClick={handleOpenCommandPalette}
        />
      </HStack>
    </Flex>
  );
};
