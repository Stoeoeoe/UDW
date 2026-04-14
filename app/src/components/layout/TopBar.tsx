import React from 'react';
import {
  Box,
  Flex,
  HStack,
  Text,
  Button,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  useToast,
} from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { fileSystem } from '../../lib/fileSystem';
import { convertLayerDataToStrings } from '../../lib/tileRef';
import { TilesetToolbar } from '../screens/tileset/TilesetToolbar';
import { MapToolbar, MapToolbarActions } from './MapToolbar';
import { SaveIndicator } from '../common/SaveIndicator';

export const TopBar: React.FC = () => {
  const mode = useEditorStore((state) => state.mode);
  const closeProject = useEditorStore((state) => state.closeProject);
  const loadProject = useEditorStore((state) => state.loadProject);
  const loadProjectResources = useEditorStore((state) => state.loadProjectResources);
  const updateProject = useEditorStore((state) => state.updateProject);
  const maps = useEditorStore((state) => state.maps);
  const tilesets = useEditorStore((state) => state.tilesets);
  const project = useEditorStore((state) => state.project);
  const toast = useToast();

  // Handlers
  const handleCloseProject = () => {
    if (confirm('Are you sure you want to close the project? Unsaved changes may be lost.')) {
      closeProject();
    }
  };

  const handleOpenProject = async () => {
    try {
      const { project: nextProject, path } = await fileSystem.openProject();
      await loadProject(path, nextProject);
      await loadProjectResources();
      toast({
        title: 'Project Changed',
        description: `Switched to ${nextProject.name}`,
        status: 'success',
        duration: 3000,
      });
    } catch (e: unknown) {
      if (e instanceof Error && e.message !== 'Open project cancelled.') {
        console.error(e);
        toast({
          title: 'Failed to open project',
          description: e.message,
          status: 'error',
          duration: 5000,
        });
      }
    }
  };

  const handleSaveProject = async () => {
    if (!project) return;
    try {
      await updateProject(project);
      toast({
        title: 'Project saved',
        status: 'success',
        duration: 2000,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      toast({
        title: 'Failed to save project',
        description: message,
        status: 'error',
        duration: 5000,
      });
    }
  };

  const handleExport = async () => {
    if (!project) return;

    try {
      const exportedMaps = maps.map((map) => ({
        ...map,
        layers: map.layers.map((layer) => {
          if (!layer.data || typeof layer.data[0]?.[0] !== 'number') {
            return layer;
          }

          return {
            ...layer,
            data: convertLayerDataToStrings(layer.data as (number | null)[][], map.tilesetRefs),
          };
        }),
      }));

      const bundle = {
        version: 1,
        format: 'unity-export-bundle',
        exportedAt: new Date().toISOString(),
        project,
        maps: exportedMaps,
        tilesets: Array.from(tilesets.values()),
      };

      await fileSystem.saveJson('', 'unity-export.bundle.json', bundle);
      toast({
        title: 'Export complete',
        description: 'Wrote unity-export.bundle.json to the project root.',
        status: 'success',
        duration: 4000,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      toast({
        title: 'Export failed',
        description: message,
        status: 'error',
        duration: 5000,
      });
    }
  };

  return (
    <Flex align="center" justify="space-between" h="full" px="4" userSelect="none">
      {/* Left: Branding & Menus */}
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
            ED
          </Flex>
          <Text fontWeight="semibold" color="gray.300" fontSize="sm" letterSpacing="tight">
            {project?.name || 'PixelEditor'}
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
                onClick={handleSaveProject}
              >
                Save Project
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
              <MenuItem bg="transparent" _hover={{ bg: 'editorPanelBg' }}>
                Exit Control Panel
              </MenuItem>
            </MenuList>
          </Menu>

          <Button variant="ghost" size="xs" color="gray.400" fontWeight="medium">
            Edit
          </Button>
          <Button variant="ghost" size="xs" color="gray.400" fontWeight="medium">
            View
          </Button>
          <Button variant="ghost" size="xs" color="gray.400" fontWeight="medium">
            Window
          </Button>
        </HStack>
      </HStack>

      {/* Center: Toolbar (Map or Tileset) */}
      {mode === 'maps' ? <MapToolbar /> : mode === 'tilesets' ? <TilesetToolbar /> : <Box />}

      {/* Right: Save Status & Actions */}
      <HStack spacing="3">
        {mode === 'maps' && <MapToolbarActions />}
        <SaveIndicator />
        <Button
          colorScheme="blue"
          size="xs"
          fontWeight="medium"
          boxShadow="sm"
          onClick={handleExport}
        >
          Export
        </Button>
      </HStack>
    </Flex>
  );
};
