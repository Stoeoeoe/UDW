import React from 'react';
import { Center, VStack, Text, Button, useDisclosure } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import { EditorMode } from '../../../types/editor';
import { MapViewportPixi } from '../map/MapViewportPixi';
import { TilesetEditor } from '../tileset/TilesetEditor';
import { ViewportShell } from '../../common/ViewportShell';
import { useEditorStore } from '../../../store/useEditorStore';
import { MapCreator } from '../../dialogs/MapCreator';
import { EditorModal } from '../../common/EditorModal';

interface MainViewportProps {
  mode: EditorMode;
}

export const MainViewport: React.FC<MainViewportProps> = ({ mode }) => {
  const currentMap = useEditorStore((state) => state.currentMap);
  const { isOpen, onOpen, onClose } = useDisclosure();

  switch (mode) {
    case 'maps':
      if (!currentMap) {
        return (
          <Center w="full" h="full" bg="gray.950">
            <VStack spacing={6}>
              <VStack spacing={2}>
                <Text fontSize="6xl">🗺️</Text>
                <Text color="white" fontWeight="bold" fontSize="xl">
                  No Map Active
                </Text>
                <Text color="gray.500">Create a new map to start building your world.</Text>
              </VStack>
              <Button leftIcon={<AddIcon />} colorScheme="blue" size="lg" onClick={onOpen} px={8}>
                Create First Map
              </Button>
            </VStack>

            <EditorModal isOpen={isOpen} onClose={onClose}>
              <MapCreator onCreate={onClose} onCancel={onClose} />
            </EditorModal>
          </Center>
        );
      }
      return (
        <ViewportShell title={currentMap.name || 'Map'}>
          <MapViewportPixi />
        </ViewportShell>
      );

    case 'tilesets':
      return <TilesetEditor />;

    case 'project':
    case 'entities':
      return (
        <Center w="full" h="full" color="gray.600">
          <VStack>
            <Text fontSize="4xl">⚙️</Text>
            <Text>Editor view coming soon</Text>
          </VStack>
        </Center>
      );
    default:
      return null;
  }
};
