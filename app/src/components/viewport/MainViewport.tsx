import React from 'react';
import { Center, VStack, Text } from '@chakra-ui/react';
import { EditorMode } from '../../types/editor';
import { MapViewport } from './MapViewport';
import { TilesetWorkspace } from '../tileset/TilesetWorkspace';

interface MainViewportProps {
    mode: EditorMode;
}

export const MainViewport: React.FC<MainViewportProps> = ({ mode }) => {
    switch (mode) {
        case 'maps':
            return <MapViewport />;
        case 'tilesets':
            return <TilesetWorkspace />;
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
