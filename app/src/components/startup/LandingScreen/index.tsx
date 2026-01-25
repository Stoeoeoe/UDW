import React from 'react';
import {
    Box,
    VStack,
    Heading,
    Text,
    SimpleGrid,
    useDisclosure,
    Modal,
    ModalOverlay,
    ModalContent,
    useToast,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { fileSystem } from '../../../lib/fileSystem';
import { ProjectSettingsEditor } from '../../dialogs/ProjectSettingsEditor';
import { Project } from '../../../types/schema';
import { recentProjects, RecentProject } from '../../../lib/recentProjects';
import { ActionCard } from './ActionCard';
import { RecentProjectItem } from './RecentProjectItem';

export const LandingScreen: React.FC = () => {
    const loadProject = useEditorStore(state => state.loadProject);
    const loadProjectResources = useEditorStore(state => state.loadProjectResources);
    const { isOpen, onOpen, onClose } = useDisclosure();
    const toast = useToast();

    const recents = recentProjects.get();

    const handleOpenProject = async () => {
        try {
            const { project, path } = await fileSystem.openProject();
            await loadProject(path, project);
            await loadProjectResources();
            toast({
                title: "Project Opened",
                description: `Successfully loaded ${project.name}`,
                status: "success",
                duration: 3000,
            });
        } catch (e) {
            if ((e as Error).message !== "Open project cancelled.") {
                console.error(e);
                toast({
                    title: "Error",
                    description: (e as Error).message,
                    status: "error",
                    duration: 5000,
                });
            }
        }
    };

    const handleOpenRecent = async (recent: RecentProject) => {
        try {
            const { project, path } = await fileSystem.loadProjectByPath(recent.path);
            await loadProject(path, project);
            await loadProjectResources();
        } catch (e) {
            console.error(e);
            recentProjects.remove(recent.path);
            toast({
                title: "Failed to open recent project",
                description: "The project may have been moved or deleted.",
                status: "error",
                duration: 5000,
            });
        }
    };

    const handleCreateProject = async (projectConfig: Project) => {
        try {
            const result = await fileSystem.createProject(projectConfig);
            await loadProject(result.path, projectConfig);
            await loadProjectResources();
            onClose();
            toast({
                title: "Project Created",
                description: `Project ${projectConfig.name} initialized successfully.`,
                status: "success",
                duration: 3000,
            });
        } catch (e) {
            if ((e as Error).message !== "Create project cancelled.") {
                console.error(e);
                toast({
                    title: "Creation Failed",
                    description: (e as Error).message,
                    status: "error",
                    duration: 5000,
                });
            }
        }
    };

    return (
        <Box h="100vh" w="100vw" bg="gray.900" display="flex" alignItems="center" justifyContent="center">
            <VStack spacing={12} maxW="container.md" textAlign="center" w="full" px={4}>
                <Box>
                    <Heading size="2xl" color="white" mb={2}>Map Editor</Heading>
                    <Text color="gray.500" fontSize="lg">Advanced Engine-Agnostic Map & World Design Tool</Text>
                </Box>

                <VStack spacing={8} w="full">
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} w="full">
                        <ActionCard
                            onClick={handleOpenProject}
                            icon="📂"
                            title="Open Project"
                            description="Select a project.json file to open an existing project."
                            hoverColor="blue.500"
                        />

                        <ActionCard
                            onClick={onOpen}
                            icon="✨"
                            title="New Project"
                            description="Start from scratch and create a new project directory."
                            hoverColor="green.500"
                        />
                    </SimpleGrid>

                    {recents.length > 0 && (
                        <VStack align="stretch" w="full" spacing={3}>
                            <Text color="gray.500" fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="widest" textAlign="left" px={1}>
                                Recent Projects
                            </Text>
                            <VStack align="stretch" spacing={2} maxH="48" overflowY="auto" pr={2}>
                                {recents.map(project => (
                                    <RecentProjectItem
                                        key={project.path}
                                        project={project}
                                        onClick={handleOpenRecent}
                                    />
                                ))}
                            </VStack>
                        </VStack>
                    )}
                </VStack>

                <Text fontSize="xs" color="gray.700">
                    Map Editor v1.0.0-alpha • Powered by Chakra UI & React
                </Text>
            </VStack>

            {/* New Project Dialog */}
            <Modal isOpen={isOpen} onClose={onClose} size="xl" isCentered>
                <ModalOverlay backdropFilter="blur(8px)" bg="blackAlpha.800" />
                <ModalContent bg="transparent" border="none" boxShadow="none">
                    <ProjectSettingsEditor
                        onSave={handleCreateProject}
                        onCancel={onClose}
                    />
                </ModalContent>
            </Modal>
        </Box>
    );
};
