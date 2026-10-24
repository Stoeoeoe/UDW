import { DEFAULT_ID_PREFIX, ID_PREFIX_PATTERN } from '../../lib/resourceIds';
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Button,
  FormControl,
  Input,
  FormErrorMessage,
  FormHelperText,
  SimpleGrid,
  Textarea,
  VStack,
  HStack,
  Divider,
} from '@chakra-ui/react';
import { Project } from '../../types/schema';
import { FormLabel } from '../common/FormLabel';

interface ProjectSettingsEditorProps {
  initialProject?: Project;
  onSave: (project: Project) => void;
  onCancel?: () => void;
}

const DEFAULT_PROJECT: Project = {
  id: 'my-project',
  idPrefix: DEFAULT_ID_PREFIX,
  version: '1.0',
  name: 'New Project',
  tileSize: 16,
  defaultMapWidth: 32,
  defaultMapHeight: 32,
  metadata: {
    author: '',
    description: '',
  },
};

// Validation Schema
const schema = z.object({
  idPrefix: z
    .string()
    .regex(ID_PREFIX_PATTERN, 'Use lowercase letters, numbers, underscores or hyphens.'),
  id: z
    .string()
    .min(2, 'ID must be at least 2 characters')
    .regex(/^[a-z0-9-]+$/, 'ID must be lowercase and can include hyphens'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  tileSize: z
    .number()
    .min(8, 'Minimum tile size is 8px')
    .max(128, 'Max tile size is 128px')
    .refine((val) => (val & (val - 1)) === 0, {
      message: 'Tile size should be power of 2 (e.g. 16, 32)',
    }),
  defaultMapWidth: z.number().min(1, 'Must be at least 1').max(1024, 'Maximum is 1024'),
  defaultMapHeight: z.number().min(1, 'Must be at least 1').max(1024, 'Maximum is 1024'),
  metadata: z.object({
    author: z.string(),
    description: z.string(),
  }),
});

type FormData = z.infer<typeof schema>;

export const ProjectSettingsEditor: React.FC<ProjectSettingsEditorProps> = ({
  initialProject,
  onSave,
  onCancel,
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      id: initialProject?.id || `project-${Date.now()}`,
      idPrefix: initialProject?.idPrefix ?? DEFAULT_ID_PREFIX,
      name: initialProject?.name || DEFAULT_PROJECT.name,
      tileSize: initialProject?.tileSize || DEFAULT_PROJECT.tileSize,
      defaultMapWidth: initialProject?.defaultMapWidth || DEFAULT_PROJECT.defaultMapWidth,
      defaultMapHeight: initialProject?.defaultMapHeight || DEFAULT_PROJECT.defaultMapHeight,
      metadata: {
        author: initialProject?.metadata?.author || '',
        description: initialProject?.metadata?.description || '',
      },
    },
    mode: 'onSubmit',
  });

  const onSubmit = (data: FormData) => {
    const project: Project = {
      ...initialProject,
      version: initialProject?.version || '1.0',
      ...data,
    };
    onSave(project);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ width: '100%' }}>
      <VStack spacing="6" align="stretch">
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
          {/* Left Column: Core Info */}
          <VStack spacing={4} align="stretch">
            <FormControl isInvalid={!!errors.name}>
              <FormLabel>Project Name</FormLabel>
              <Input
                bg="gray.950"
                borderColor="editorBorderLight"
                _hover={{ borderColor: 'blue.500' }}
                _focus={{ borderColor: 'blue.500', ring: 1, ringColor: 'blue.500' }}
                placeholder="e.g. My Awesome Game"
                {...register('name')}
              />
              <FormErrorMessage>{errors.name?.message}</FormErrorMessage>
            </FormControl>
            <FormControl isInvalid={!!errors.id}>
              <FormLabel>Project ID</FormLabel>
              <Input
                bg="gray.950"
                borderColor="editorBorderLight"
                _hover={{ borderColor: 'blue.500' }}
                _focus={{ borderColor: 'blue.500', ring: 1, ringColor: 'blue.500' }}
                placeholder="e.g. my-awesome-game"
                {...register('id', { setValueAs: (value: string) => value.toLowerCase() })}
              />
              <FormErrorMessage>{errors.id?.message}</FormErrorMessage>
            </FormControl>
            <FormControl isInvalid={!!errors.idPrefix}>
              <FormLabel>ID Prefix</FormLabel>
              <Input
                {...register('idPrefix', { setValueAs: (value: string) => value.toLowerCase() })}
                isReadOnly={!!initialProject}
                placeholder="base"
              />
              <FormErrorMessage>{errors.idPrefix?.message}</FormErrorMessage>
              <FormHelperText>
                Resources use IDs such as base:myactor. The prefix is fixed after project creation.
              </FormHelperText>
            </FormControl>
            <SimpleGrid columns={2} spacing={4}>
              <FormControl isInvalid={!!errors.tileSize}>
                <FormLabel>Tile Size (px)</FormLabel>
                <Input
                  bg="gray.950"
                  borderColor="editorBorderLight"
                  type="number"
                  {...register('tileSize', {
                    setValueAs: (v) => (v === '' ? 0 : Number(v)),
                  })}
                />
                <FormErrorMessage>{errors.tileSize?.message}</FormErrorMessage>
              </FormControl>

              <FormControl isReadOnly>
                <FormLabel>Version</FormLabel>
                <Input
                  bg="gray.800"
                  borderColor="editorBorderLight"
                  disabled={true}
                  value={initialProject?.version || '1.0'}
                />
              </FormControl>
            </SimpleGrid>

            <SimpleGrid columns={2} spacing={4}>
              <FormControl isInvalid={!!errors.defaultMapWidth}>
                <FormLabel>Default Width</FormLabel>
                <Input
                  bg="gray.950"
                  borderColor="editorBorderLight"
                  type="number"
                  {...register('defaultMapWidth', {
                    setValueAs: (v) => (v === '' ? 0 : Number(v)),
                  })}
                />
                <FormErrorMessage>{errors.defaultMapWidth?.message}</FormErrorMessage>
              </FormControl>

              <FormControl isInvalid={!!errors.defaultMapHeight}>
                <FormLabel>Default Height</FormLabel>
                <Input
                  bg="gray.950"
                  borderColor="editorBorderLight"
                  type="number"
                  {...register('defaultMapHeight', {
                    setValueAs: (v) => (v === '' ? 0 : Number(v)),
                  })}
                />
                <FormErrorMessage>{errors.defaultMapHeight?.message}</FormErrorMessage>
              </FormControl>
            </SimpleGrid>
          </VStack>

          {/* Right Column: Metadata */}
          <VStack spacing={4} align="stretch">
            <FormControl isInvalid={!!errors.metadata?.author}>
              <FormLabel>Author</FormLabel>
              <Input
                bg="gray.950"
                borderColor="editorBorderLight"
                {...register('metadata.author')}
              />
              <FormErrorMessage>{errors.metadata?.author?.message}</FormErrorMessage>
            </FormControl>

            <FormControl
              isInvalid={!!errors.metadata?.description}
              flex={1}
              display="flex"
              flexDirection="column"
            >
              <FormLabel>Description</FormLabel>
              <Textarea
                flex={1}
                bg="gray.950"
                borderColor="editorBorderLight"
                rows={6}
                resize="none"
                {...register('metadata.description')}
              />
              <FormErrorMessage>{errors.metadata?.description?.message}</FormErrorMessage>
            </FormControl>
          </VStack>
        </SimpleGrid>

        <Divider borderColor="editorBorderSubtle" />

        <HStack justify="flex-end" spacing="3">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            colorScheme="blue"
            px={8}
            fontWeight="bold"
            shadow="0 4px 12px rgba(49, 130, 206, 0.3)"
          >
            {initialProject ? 'Save Project' : 'Create Project'}
          </Button>
        </HStack>
      </VStack>
    </form>
  );
};
