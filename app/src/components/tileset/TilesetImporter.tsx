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
    VStack,
    HStack,
    Text,
    Heading,
    Image,
} from '@chakra-ui/react';
import { Tileset } from '../../types/schema';

interface TilesetImporterProps {
    onSave: (tilesetConfig: Tileset, file: File) => void;
    onCancel: () => void;
}

const schema = z.object({
    id: z.string().min(2, "ID is required").regex(/^[a-z0-9-_]+$/, "ID must be kebab-case (lowercase, numbers, dashes)"),
    name: z.string().min(2, "Name is required"),
    tileWidth: z.number().min(8).max(128),
    tileHeight: z.number().min(8).max(128),
});

type FormData = z.infer<typeof schema>;

export const TilesetImporter: React.FC<TilesetImporterProps> = ({ onSave, onCancel }) => {
    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            tileWidth: 16,
            tileHeight: 16
        }
    });

    const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const onSubmit = (data: FormData) => {
        if (!selectedFile) {
            alert("Please select a sprite sheet image.");
            return;
        }

        const newTileset: Tileset = {
            version: 1,
            id: data.id,
            name: data.name,
            spriteSheet: `assets/${selectedFile.name}`, // Virtual path
            tileWidth: data.tileWidth,
            tileHeight: data.tileHeight,
            columns: 0, // Placeholder
            tileCount: 0, // Placeholder
            tiles: []
        };

        onSave(newTileset, selectedFile);
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
            display="flex"
            flexDirection="column"
            maxH="90vh"
        >
            <Box bg="gray.800" px="4" py="3" borderBottom="1px" borderColor="gray.700">
                <Heading size="sm">Import Tileset</Heading>
            </Box>

            <Box flex={1} overflowY="auto" p="4">
                <form id="tileset-form" onSubmit={handleSubmit(onSubmit)}>
                    <VStack spacing="4" align="stretch">
                        <SimpleGrid columns={2} spacing={4}>
                            <FormControl isInvalid={!!errors.id}>
                                <FormLabel>Tileset ID</FormLabel>
                                <Input
                                    placeholder="e.g. dungeon-base"
                                    {...register('id')}
                                />
                                <FormErrorMessage>{errors.id?.message}</FormErrorMessage>
                            </FormControl>
                            <FormControl isInvalid={!!errors.name}>
                                <FormLabel>Display Name</FormLabel>
                                <Input
                                    placeholder="e.g. Dungeon Base"
                                    {...register('name')}
                                />
                                <FormErrorMessage>{errors.name?.message}</FormErrorMessage>
                            </FormControl>
                        </SimpleGrid>

                        <SimpleGrid columns={2} spacing={4}>
                            <FormControl isInvalid={!!errors.tileWidth}>
                                <FormLabel>Tile Width</FormLabel>
                                <Input
                                    type="number"
                                    {...register('tileWidth', { valueAsNumber: true })}
                                />
                                <FormErrorMessage>{errors.tileWidth?.message}</FormErrorMessage>
                            </FormControl>
                            <FormControl isInvalid={!!errors.tileHeight}>
                                <FormLabel>Tile Height</FormLabel>
                                <Input
                                    type="number"
                                    {...register('tileHeight', { valueAsNumber: true })}
                                />
                                <FormErrorMessage>{errors.tileHeight?.message}</FormErrorMessage>
                            </FormControl>
                        </SimpleGrid>

                        <FormControl>
                            <FormLabel>Sprite Sheet (PNG)</FormLabel>
                            <Box
                                border="2px"
                                borderStyle="dashed"
                                borderColor="gray.700"
                                rounded="lg"
                                p="4"
                                textAlign="center"
                                position="relative"
                                _hover={{ bg: 'gray.800', borderColor: 'gray.600' }}
                                transition="all 0.2s"
                            >
                                <Input
                                    type="file"
                                    accept="image/png"
                                    onChange={handleFileChange}
                                    position="absolute"
                                    top="0"
                                    left="0"
                                    w="100%"
                                    h="100%"
                                    opacity="0"
                                    cursor="pointer"
                                />
                                <Text fontSize="sm" color="gray.400">
                                    {selectedFile ? selectedFile.name : "Click or drag to upload PNG"}
                                </Text>
                            </Box>
                        </FormControl>

                        {/* Preview */}
                        {previewUrl && (
                            <Box
                                border="1px"
                                borderColor="gray.700"
                                rounded="md"
                                bg="gray.950"
                                p="2"
                                overflow="auto"
                                maxH="48"
                                display="flex"
                                justifyContent="center"
                            >
                                <Image
                                    src={previewUrl}
                                    alt="Preview"
                                    maxW="full"
                                    objectFit="contain"
                                    style={{ imageRendering: 'pixelated' }}
                                />
                            </Box>
                        )}
                    </VStack>
                </form>
            </Box>

            <HStack justify="flex-end" spacing="3" p="4" borderTop="1px" borderColor="gray.800" bg="gray.900">
                <Button
                    variant="ghost"
                    onClick={onCancel}
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    form="tileset-form"
                    colorScheme="blue"
                    isDisabled={!selectedFile}
                >
                    Import
                </Button>
            </HStack>
        </Box>
    );
};
