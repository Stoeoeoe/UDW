import React from 'react';
import { Badge, Box, Center, HStack, Progress, Spinner, Text, VStack } from '@chakra-ui/react';

export interface WorkspaceLoadingScreenProps {
  projectName: string;
  label?: string | null;
  progress?: number;
}

export const WorkspaceLoadingScreen: React.FC<WorkspaceLoadingScreenProps> = ({
  projectName,
  label,
  progress = 0,
}) => {
  const percent = Math.max(6, Math.min(100, Math.round(progress * 100)));

  return (
    <Center w="full" h="full" bg="editorWorkspaceBg" px="6">
      <Box
        w="full"
        maxW="xl"
        bg="editorPanelBg"
        borderWidth="1px"
        borderColor="editorShellBorder"
        borderRadius="xl"
        boxShadow="2xl"
        overflow="hidden"
      >
        <Box
          px="6"
          py="4"
          bg="editorHeaderBg"
          borderBottomWidth="1px"
          borderColor="editorShellBorder"
        >
          <Text textStyle="panelLabel">Opening Project</Text>
        </Box>

        <VStack align="stretch" spacing="5" px="6" py="6">
          <HStack align="start" spacing="4">
            <Center
              boxSize="12"
              flexShrink={0}
              borderRadius="xl"
              bg="editorSectionBg"
              borderWidth="1px"
              borderColor="editorShellBorder"
            >
              <Spinner size="md" color="blue.400" thickness="3px" speed="0.75s" />
            </Center>

            <VStack align="start" spacing="1" flex={1}>
              <Text fontSize="2xl" fontWeight="bold" color="editorText" lineHeight="short">
                {projectName}
              </Text>
              <Text color="editorMutedText" fontSize="sm">
                {label ?? 'Preparing locations, tilesets, and editor data.'}
              </Text>
            </VStack>
          </HStack>

          <VStack align="stretch" spacing="2">
            <HStack justify="space-between">
              <Text textStyle="panelLabel">Workspace Progress</Text>
              <Text fontSize="xs" color="editorMutedText" fontFamily="mono">
                {percent}%
              </Text>
            </HStack>
            <Progress
              value={percent}
              size="sm"
              colorScheme="blue"
              borderRadius="full"
              bg="editorFieldBg"
            />
          </VStack>

          <HStack spacing="2" flexWrap="wrap">
            <Badge variant="editor">Locations</Badge>
            <Badge variant="editor">Tilesets</Badge>
            <Badge variant="editor">Actors</Badge>
            <Badge variant="editor">Dialogues</Badge>
          </HStack>

          <Text textStyle="helperText">
            The editor is restoring project resources and getting the tab workspace ready.
          </Text>
        </VStack>
      </Box>
    </Center>
  );
};

export default WorkspaceLoadingScreen;
