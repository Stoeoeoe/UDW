import React, { useState } from 'react';
import {
  VStack,
  HStack,
  Text,
  Button,
  Input,
  FormControl,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Select,
  useToast,
  Heading,
} from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { FormLabel } from '../common/FormLabel';
import { EditorCard } from '../common/Surfaces';
import { CaptionText } from '../common/Typography.tsx';

interface MapCreatorProps {
  onCreate?: () => void;
  onCancel?: () => void;
}

export const MapCreator: React.FC<MapCreatorProps> = ({ onCreate, onCancel }) => {
  const tilesets = Array.from(useEditorStore((state) => state.tilesets).values());
  const createNewMap = useEditorStore((state) => state.createNewMap);
  const toast = useToast();

  const [name, setName] = useState('New Map');
  const [width, setWidth] = useState(32);
  const [height, setHeight] = useState(32);
  const [tilesetId, setTilesetId] = useState(tilesets[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name || !tilesetId) {
      toast({
        title: 'Validation Error',
        description: 'Please provide a name and select a base tileset.',
        status: 'warning',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await createNewMap(name, width, height, tilesetId);
      toast({
        title: 'Map created',
        status: 'success',
        duration: 2000,
      });
      onCreate?.();
    } catch (err: unknown) {
      toast({
        title: 'Error creating map',
        description: err instanceof Error ? err.message : 'Unknown error',
        status: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <EditorCard p={8} w="lg">
      <VStack spacing={6} align="stretch">
        <VStack align="start" spacing={1}>
          <Heading size="md" color="white">
            Create New Map
          </Heading>
          <Text color="gray.500" fontSize="sm">
            Define the dimensions and base style of your new world.
          </Text>
        </VStack>

        <VStack spacing={4}>
          <FormControl isRequired>
            <FormLabel>Map Name</FormLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              bg="editorPanelBg"
              borderColor="editorBorderSubtle"
              _focus={{ borderColor: 'blue.500' }}
              color="white"
            />
          </FormControl>

          <HStack spacing={4} w="full">
            <FormControl isRequired>
              <FormLabel>Width (Tiles)</FormLabel>
              <NumberInput
                value={width}
                min={1}
                max={256}
                onChange={(_, v) => setWidth(v)}
                color="white"
              >
                <NumberInputField bg="editorPanelBg" borderColor="editorBorderSubtle" />
                <NumberInputStepper>
                  <NumberIncrementStepper border="none" color="gray.600" />
                  <NumberDecrementStepper border="none" color="gray.600" />
                </NumberInputStepper>
              </NumberInput>
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Height (Tiles)</FormLabel>
              <NumberInput
                value={height}
                min={1}
                max={256}
                onChange={(_, v) => setHeight(v)}
                color="white"
              >
                <NumberInputField bg="editorPanelBg" borderColor="editorBorderSubtle" />
                <NumberInputStepper>
                  <NumberIncrementStepper border="none" color="gray.600" />
                  <NumberDecrementStepper border="none" color="gray.600" />
                </NumberInputStepper>
              </NumberInput>
            </FormControl>
          </HStack>

          <FormControl isRequired>
            <FormLabel>Base Tileset</FormLabel>
            <Select
              value={tilesetId}
              onChange={(e) => setTilesetId(e.target.value)}
              bg="editorPanelBg"
              borderColor="editorBorderSubtle"
              _focus={{ borderColor: 'blue.500' }}
              color="white"
            >
              {tilesets.map((ts) => (
                <option key={ts.id} value={ts.id} style={{ background: '#1a202c' }}>
                  {ts.name}
                </option>
              ))}
            </Select>
            {tilesets.length === 0 && (
              <CaptionText color="red.400" mt={1}>
                No tilesets found. Please import a tileset first.
              </CaptionText>
            )}
          </FormControl>
        </VStack>

        <HStack spacing={3} pt={4}>
          <Button variant="ghost" flex={1} onClick={onCancel} color="gray.400">
            Cancel
          </Button>
          <Button
            colorScheme="blue"
            flex={2}
            onClick={handleCreate}
            isLoading={isSubmitting}
            isDisabled={tilesets.length === 0}
          >
            Create Map
          </Button>
        </HStack>
      </VStack>
    </EditorCard>
  );
};
