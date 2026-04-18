import React from 'react';
import { Box, Heading, VStack, HStack, Flex, Text, useToast } from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { ProjectSettingsEditor } from '../dialogs/ProjectSettingsEditor';
import { Project } from '../../types/schema';
import { EditorCard, SurfaceSectionHeader } from '../common/Surfaces';
import { Image } from '@chakra-ui/react';

export const ProjectPanel: React.FC = () => {
  const project = useEditorStore((state) => state.project);
  const updateProject = useEditorStore((state) => state.updateProject);
  const toast = useToast();

  if (!project) return null;

  const handleSave = async (updatedProject: Project) => {
    try {
      await updateProject(updatedProject);
      toast({
        title: 'Project saved',
        description: 'Settings have been updated successfully.',
        status: 'success',
        duration: 3000,
      });
    } catch (e) {
      console.error(e);
      toast({
        title: 'Save failed',
        description: (e as Error).message,
        status: 'error',
        duration: 5000,
      });
    }
  };

  return (
    <Box h="full" w="full" bg="editorPanelBg" position="relative" overflow="hidden">
      {/* Focused Ambient Glow */}
      <Box
        position="absolute"
        top="-5%"
        left="25%"
        w="1000px"
        h="500px"
        bg="blue.800"
        filter="blur(120px)"
        opacity="0.2"
        zIndex="0"
        pointerEvents="none"
      />

      <Box maxW="1100px" mx="auto" px={12} py={16} position="relative" zIndex="1">
        <VStack align="start" spacing={12} w="full">
          {/* High-Contrast Header */}
          <VStack align="start" spacing={3}>
            <HStack spacing={4}>
              <Image
                src="vulcanus-project-icon.png"
                alt="Project Icon"
                boxSize="6"
                width={128}
                height={128}
                borderRadius={20}
              />
              <VStack align="start" spacing={0}>
                <Heading
                  size="2xl"
                  color="white"
                  fontWeight="900"
                  letterSpacing="tight"
                  marginBottom={1}
                >
                  {project.name}
                </Heading>
                <Text color="gray.400" fontSize="lg" fontWeight="medium">
                  General Configuration & Core Settings
                </Text>
              </VStack>
            </HStack>
          </VStack>

          {/* Dashboard Main Card */}
          <EditorCard w="full" maxW="800px" border="2px" p={0} overflow="hidden" shadow="dark-lg">
            <SurfaceSectionHeader
              title="General Configuration"
              bg="editorCanvasBg"
              borderBottom="2px"
              borderColor="editorBorderLight"
              px={8}
              py={5}
            />

            <Box p={10}>
              <ProjectSettingsEditor initialProject={project} onSave={handleSave} />
            </Box>
          </EditorCard>
        </VStack>
      </Box>
    </Box>
  );
};
