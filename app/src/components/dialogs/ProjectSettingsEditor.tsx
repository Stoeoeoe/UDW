import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
    Box,
    Button,
    FormControl,
    FormLabel,
    Input,
    FormErrorMessage,
    SimpleGrid,
    Textarea,
    VStack,
    HStack,
    Divider,
    Heading,
} from '@chakra-ui/react';
import { Project } from '../../types/schema';

interface ProjectSettingsEditorProps {
    initialProject?: Project;
    onSave: (project: Project) => void;
    onCancel: () => void;
}

const DEFAULT_PROJECT: Project = {
    version: "1.0",
    name: "New Project",
    tileSize: 16,
    defaultMapWidth: 32,
    defaultMapHeight: 32,
    metadata: {
        author: "",
        description: ""
    }
};

// Validation Schema
const schema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    tileSize: z.number().min(8, "Minimum tile size is 8px")
        .max(128, "Max tile size is 128px")
        .refine(val => (val & (val - 1)) === 0, {
            message: 'Tile size should be power of 2 (e.g. 16, 32)'
        }),
    defaultMapWidth: z.number().min(1, "Must be at least 1")
        .max(1024, "Maximum is 1024"),
    defaultMapHeight: z.number().min(1, "Must be at least 1")
        .max(1024, "Maximum is 1024"),
    metadata: z.object({
        author: z.string(),
        description: z.string()
    })
});

type FormData = z.infer<typeof schema>;

export const ProjectSettingsEditor: React.FC<ProjectSettingsEditorProps> = ({
    initialProject,
    onSave,
    onCancel
}) => {
    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            name: initialProject?.name || DEFAULT_PROJECT.name,
            tileSize: initialProject?.tileSize || DEFAULT_PROJECT.tileSize,
            defaultMapWidth: initialProject?.defaultMapWidth || DEFAULT_PROJECT.defaultMapWidth,
            defaultMapHeight: initialProject?.defaultMapHeight || DEFAULT_PROJECT.defaultMapHeight,
            metadata: {
                author: initialProject?.metadata?.author || "",
                description: initialProject?.metadata?.description || ""
            }
        },
        mode: 'onSubmit'
    });

    const onSubmit = (data: FormData) => {
        const project: Project = {
            version: initialProject?.version || "1.0",
            ...data
        };
        onSave(project);
    };

    return (
        <Box
            bg="gray.900"
            border="1px"
            borderColor="gray.700"
            rounded="lg"
            shadow="2xl"
            w="full"
            maxW="500px"
            overflow="hidden"
        >
            <Box bg="gray.800" px="4" py="3" borderBottom="1px" borderColor="gray.700">
                <Heading size="sm">Project Settings</Heading>
            </Box>

            <form onSubmit={handleSubmit(onSubmit)}>
                <VStack p="4" spacing="4" align="stretch">
                    {/* Project Name */}
                    <FormControl isInvalid={!!errors.name}>
                        <FormLabel>Project Name</FormLabel>
                        <Input
                            placeholder="e.g. My Awesome Game"
                            {...register('name')}
                        />
                        <FormErrorMessage>{errors.name?.message}</FormErrorMessage>
                    </FormControl>

                    <SimpleGrid columns={2} spacing={4}>
                        <FormControl isInvalid={!!errors.tileSize}>
                            <FormLabel>Tile Size (px)</FormLabel>
                            <Input
                                type="number"
                                {...register('tileSize', {
                                    setValueAs: v => v === '' ? 0 : Number(v)
                                })}
                            />
                            <FormErrorMessage>{errors.tileSize?.message}</FormErrorMessage>
                        </FormControl>

                        <FormControl isReadOnly>
                            <FormLabel>Version</FormLabel>
                            <Input
                                disabled={true}
                                value={initialProject?.version || "1.0"}
                            />
                        </FormControl>
                    </SimpleGrid>

                    <SimpleGrid columns={2} spacing={4}>
                        <FormControl isInvalid={!!errors.defaultMapWidth}>
                            <FormLabel>Default Width</FormLabel>
                            <Input
                                type="number"
                                {...register('defaultMapWidth', {
                                    setValueAs: v => v === '' ? 0 : Number(v)
                                })}
                            />
                            <FormErrorMessage>{errors.defaultMapWidth?.message}</FormErrorMessage>
                        </FormControl>

                        <FormControl isInvalid={!!errors.defaultMapHeight}>
                            <FormLabel>Default Height</FormLabel>
                            <Input
                                type="number"
                                {...register('defaultMapHeight', {
                                    setValueAs: v => v === '' ? 0 : Number(v)
                                })}
                            />
                            <FormErrorMessage>{errors.defaultMapHeight?.message}</FormErrorMessage>
                        </FormControl>
                    </SimpleGrid>

                    <Divider />

                    {/* Metadata */}
                    <VStack spacing="3" align="stretch">
                        <FormControl isInvalid={!!errors.metadata?.author}>
                            <FormLabel>Author</FormLabel>
                            <Input
                                {...register('metadata.author')}
                            />
                            <FormErrorMessage>{errors.metadata?.author?.message}</FormErrorMessage>
                        </FormControl>

                        <FormControl isInvalid={!!errors.metadata?.description}>
                            <FormLabel>Description</FormLabel>
                            <Textarea
                                rows={3}
                                resize="none"
                                {...register('metadata.description')}
                            />
                            <FormErrorMessage>{errors.metadata?.description?.message}</FormErrorMessage>
                        </FormControl>
                    </VStack>

                    <HStack justify="flex-end" spacing="3" pt="4" borderTop="1px" borderColor="gray.800">
                        <Button
                            variant="ghost"
                            onClick={onCancel}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            colorScheme="blue"
                            fontWeight="bold"
                        >
                            Save Project
                        </Button>
                    </HStack>
                </VStack>
            </form>
        </Box>
    );
};
