import React from 'react';
import { Box, Heading, Text } from '@chakra-ui/react';

export const ProjectPanel: React.FC = () => {
    return (
        <Box p="4" color="gray.400" fontSize="sm">
            <Heading size="xs" color="gray.300" mb="2" textTransform="uppercase">Project Settings</Heading>
            <Text>Project editor coming soon...</Text>
        </Box>
    );
};
