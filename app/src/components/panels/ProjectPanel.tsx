import React from 'react';
import { Box, Heading, VStack, HStack, Flex, Text, useToast } from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { ProjectSettingsEditor } from '../dialogs/ProjectSettingsEditor';
import { Project } from '../../types/schema';

export const ProjectPanel: React.FC = () => {
    const project = useEditorStore(state => state.project);
    const updateProject = useEditorStore(state => state.updateProject);
    const toast = useToast();

    if (!project) return null;

    const handleSave = async (updatedProject: Project) => {
        try {
            await updateProject(updatedProject);
            toast({
                title: "Project saved",
                description: "Settings have been updated successfully.",
                status: "success",
                duration: 3000,
            });
        } catch (e) {
            console.error(e);
            toast({
                title: "Save failed",
                description: (e as Error).message,
                status: "error",
                duration: 5000,
            });
        }
    };

    return (
        <Box
            h="full"
            w="full"
            bg="gray.950"
            position="relative"
            overflow="hidden"
        >
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

            <Box
                maxW="1100px"
                mx="auto"
                px={12}
                py={16}
                position="relative"
                zIndex="1"
            >
                <VStack align="start" spacing={12} w="full">
                    {/* High-Contrast Header */}
                    <VStack align="start" spacing={3}>
                        <HStack spacing={4}>
                            <Flex
                                w="14"
                                h="14"
                                bg="blue.600"
                                rounded="2xl"
                                align="center"
                                justify="center"
                                shadow="0 0 30px rgba(49, 130, 206, 0.4)"
                                border="1px"
                                borderColor="blue.400"
                            >
                                <Text fontSize="3xl">🚀</Text>
                            </Flex>
                            <VStack align="start" spacing={0}>
                                <Heading size="2xl" color="white" fontWeight="900" letterSpacing="tight">
                                    {project.name}
                                </Heading>
                                <Text color="gray.400" fontSize="lg" fontWeight="medium">
                                    General Configuration & Core Settings
                                </Text>
                            </VStack>
                        </HStack>
                    </VStack>

                    {/* Dashboard Main Card */}
                    <Box
                        w="full"
                        maxW="800px"
                        bg="gray.900"
                        rounded="2xl"
                        border="2px"
                        borderColor="gray.800"
                        p={0}
                        overflow="hidden"
                        shadow="dark-lg"
                    >
                        <Box bg="gray.800" px={8} py={5} borderBottom="2px" borderColor="gray.700">
                            <Text color="white" fontWeight="900" fontSize="xs" textTransform="uppercase" letterSpacing="0.2em">
                                General Configuration
                            </Text>
                        </Box>

                        <Box p={10}>
                            <ProjectSettingsEditor
                                initialProject={project}
                                onSave={handleSave}
                                onCancel={() => { }}
                            />
                        </Box>
                    </Box>

                    {/* Stats/Quick Info Grid */}
                    <HStack spacing={6} w="full" maxW="800px">
                        {[
                            { label: "Compiler", value: "v1.0.0-alpha", color: "blue.400" },
                            { label: "Data Format", value: "Standard JSON", color: "purple.400" },
                            { label: "Rendering", value: "Tile-Grid", color: "green.400" }
                        ].map((stat, i) => (
                            <Box
                                key={i}
                                flex={1}
                                bg="gray.900"
                                p={8}
                                rounded="2xl"
                                border="2px"
                                borderColor="gray.800"
                                _hover={{ borderColor: stat.color }}
                                transition="all 0.2s"
                            >
                                <Text color="gray.500" fontSize="xs" fontWeight="black" mb={2} textTransform="uppercase" letterSpacing="widest">
                                    {stat.label}
                                </Text>
                                <Text color="white" fontSize="xl" fontWeight="bold">
                                    {stat.value}
                                </Text>
                            </Box>
                        ))}
                    </HStack>
                </VStack>
            </Box>
        </Box>
    );
};
