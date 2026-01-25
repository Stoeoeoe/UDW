import React from 'react';
import { Center, VStack, Text } from '@chakra-ui/react';
import { EditorMode } from '../../types/editor';
import { MapViewport } from './MapViewport';

interface MainViewportProps {
    mode: EditorMode;
}

export const MainViewport: React.FC<MainViewportProps> = ({ mode }) => {
    switch (mode) {
        case 'maps':
            return <MapViewport />;
        case 'tilesets':
            return (
                <Center w="full" h="full" color="gray.600">
                    <VStack>
                        <Text fontSize="4xl">🎨</Text>
                        <Text>Select a tileset to preview</Text>
                    </VStack>
                </Center>
            );
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
