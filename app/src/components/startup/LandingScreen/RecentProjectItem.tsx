import React from 'react';
import { Box, VStack, Text } from '@chakra-ui/react';
import { RecentProject } from '../../../lib/recentProjects';

interface RecentProjectItemProps {
    project: RecentProject;
    onClick: (project: RecentProject) => void;
}

export const RecentProjectItem: React.FC<RecentProjectItemProps> = ({ project, onClick }) => (
    <Box
        p={3}
        bg="gray.900"
        rounded="md"
        border="1px"
        borderColor="gray.800"
        cursor="pointer"
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        _hover={{ bg: 'gray.800', borderColor: 'gray.700' }}
        onClick={() => onClick(project)}
    >
        <VStack align="start" spacing={0}>
            <Text color="gray.200" fontSize="sm" fontWeight="medium">{project.name}</Text>
            <Text color="gray.600" fontSize="xs" noOfLines={1}>{project.path}</Text>
        </VStack>
        <Text color="gray.700" fontSize="xs">
            {new Date(project.lastOpened).toLocaleDateString()}
        </Text>
    </Box>
);
