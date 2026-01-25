import React from 'react';
import {
    Box,
    Flex,
    HStack,
    Text,
    Button,
    Menu,
    MenuButton,
    MenuList,
    MenuItem,
    MenuDivider,
    useToast,
} from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { fileSystem } from '../../lib/fileSystem';

import { MapToolbar } from './MapToolbar';

export const TopBar: React.FC = () => {
    const mode = useEditorStore(state => state.mode);
    const closeProject = useEditorStore(state => state.closeProject);
    const loadProject = useEditorStore(state => state.loadProject);
    const loadProjectResources = useEditorStore(state => state.loadProjectResources);
    const project = useEditorStore(state => state.project);
    const toast = useToast();

    // Handlers
    const handleCloseProject = () => {
        if (confirm("Are you sure you want to close the project? Unsaved changes may be lost.")) {
            closeProject();
        }
    };

    const handleOpenProject = async () => {
        try {
            const { project: nextProject, path } = await fileSystem.openProject();
            await loadProject(path, nextProject);
            await loadProjectResources();
            toast({
                title: "Project Changed",
                description: `Switched to ${nextProject.name}`,
                status: "success",
                duration: 3000,
            });
        } catch (e: any) {
            if (e.message !== "Open project cancelled.") {
                console.error(e);
                toast({
                    title: "Failed to open project",
                    description: e.message,
                    status: "error",
                    duration: 5000,
                });
            }
        }
    };

    return (
        <Flex align="center" justify="space-between" h="full" px="4" userSelect="none">
            {/* Left: Branding & Menus */}
            <HStack spacing="6">
                <HStack spacing="2">
                    <Flex
                        w="6"
                        h="6"
                        bg="blue.600"
                        rounded="md"
                        align="center"
                        justify="center"
                        fontWeight="bold"
                        color="white"
                        fontSize="xs"
                        boxShadow="sm"
                    >
                        ED
                    </Flex>
                    <Text fontWeight="semibold" color="gray.300" fontSize="sm" letterSpacing="tight">
                        {project?.name || 'PixelEditor'}
                    </Text>
                </HStack>

                <Box h="6" w="1px" bg="gray.700" />

                <HStack spacing="1">
                    <Menu gutter={8}>
                        <MenuButton
                            as={Button}
                            variant="ghost"
                            size="xs"
                            color="gray.400"
                            _hover={{ color: 'white', bg: 'gray.800' }}
                            _active={{ bg: 'gray.700' }}
                            fontWeight="medium"
                        >
                            File
                        </MenuButton>
                        <MenuList bg="gray.800" borderColor="gray.700" color="gray.200" boxShadow="xl" py="1" zIndex="50">
                            <MenuItem bg="transparent" _hover={{ bg: 'gray.700' }} onClick={handleOpenProject}>Open Project...</MenuItem>
                            <MenuItem bg="transparent" _hover={{ bg: 'gray.700' }}>Save Project</MenuItem>
                            <MenuDivider borderColor="gray.700" />
                            <MenuItem bg="transparent" _hover={{ bg: 'gray.700' }} color="red.400" onClick={handleCloseProject}>Close Project</MenuItem>
                            <MenuItem bg="transparent" _hover={{ bg: 'gray.700' }}>Exit Control Panel</MenuItem>
                        </MenuList>
                    </Menu>

                    <Button variant="ghost" size="xs" color="gray.400" _hover={{ color: 'white', bg: 'gray.800' }} fontWeight="medium">
                        Edit
                    </Button>
                    <Button variant="ghost" size="xs" color="gray.400" _hover={{ color: 'white', bg: 'gray.800' }} fontWeight="medium">
                        View
                    </Button>
                    <Button variant="ghost" size="xs" color="gray.400" _hover={{ color: 'white', bg: 'gray.800' }} fontWeight="medium">
                        Window
                    </Button>
                </HStack>
            </HStack>

            {/* Center: Toolbar (Only in Map Mode) */}
            {mode === 'maps' ? <MapToolbar /> : <Box />}

            {/* Right: Actions */}
            <HStack spacing="3">
                <Button colorScheme="blue" size="xs" fontWeight="medium" boxShadow="sm">
                    Export
                </Button>
            </HStack>
        </Flex>
    );
};
