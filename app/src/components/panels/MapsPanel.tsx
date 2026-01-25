import React from 'react';
import { Box, Flex, Text, IconButton } from '@chakra-ui/react';
import { LayersPanel } from './LayersPanel';

export const MapsPanel: React.FC = () => {
    return (
        <Flex direction="column" h="full">
            {/* Map List Area */}
            <Box p="3" borderBottom="1px" borderColor="gray.800">
                <Flex justify="space-between" align="center" mb="2">
                    <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="wider" color="gray.500">Maps</Text>
                    <IconButton
                        aria-label="Add Map"
                        icon={<Text fontSize="md">+</Text>}
                        size="xs"
                        variant="ghost"
                        color="gray.500"
                        _hover={{ color: 'white' }}
                    />
                </Flex>
                <Text fontSize="xs" color="gray.600">No maps yet</Text>
            </Box>

            {/* Layers for active map */}
            <Box flex={1} overflow="hidden">
                <LayersPanel />
            </Box>
        </Flex>
    );
};
