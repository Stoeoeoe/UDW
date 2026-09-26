import React, { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  FormControl,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Select,
  useToast,
  Icon,
} from '@chakra-ui/react';
import { FiGrid } from 'react-icons/fi';
import { useEditorStore } from '../../store/useEditorStore';
import { FormLabel } from '../common/FormLabel';
import { CaptionText } from '../common/Typography.tsx';
import { EntityFormDialog } from '../screens/common/EntityFormDialog';

interface MapCreatorProps {
  onCreate?: () => void;
  onCancel?: () => void;
  folderPath?: string;
  onCreatedMapId?: (mapId: string) => void;
  onRequestCreateTileset?: () => void;
}

export const MapCreator: React.FC<MapCreatorProps> = ({
  onCreate,
  onCancel,
  folderPath,
  onCreatedMapId,
  onRequestCreateTileset,
}) => {
  const tilesets = Array.from(useEditorStore((state) => state.tilesets).values());
  const createNewMap = useEditorStore((state) => state.createNewMap);
  const toast = useToast();

  const [name, setName] = useState('New Map');
  const [width, setWidth] = useState(32);
  const [height, setHeight] = useState(32);
  const [tilesetId, setTilesetId] = useState(tilesets[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const needsTileset = tilesets.length === 0;

  React.useEffect(() => {
    if (!tilesetId && tilesets[0]) {
      setTilesetId(tilesets[0].id);
    }
  }, [tilesetId, tilesets]);

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
      await createNewMap(name, width, height, tilesetId, folderPath);
      onCreatedMapId?.(name.toLowerCase().replace(/\s+/g, '-'));
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
    <EntityFormDialog
      title="Create Map"
      description="Define the dimensions and base style of your new world."
      onCancel={onCancel ?? (() => undefined)}
      onSubmit={needsTileset ? onRequestCreateTileset : handleCreate}
      submitLabel={needsTileset ? 'Import Tileset' : isSubmitting ? 'Creating...' : 'Create Map'}
      isSubmitDisabled={(needsTileset && !onRequestCreateTileset) || isSubmitting}
      minWidth="512px"
    >
      {needsTileset ? (
        <Box
          bg="editorSectionBg"
          border="1px"
          borderColor="editorBorderSubtle"
          borderRadius="lg"
          p={5}
        >
          <HStack align="start" spacing={4}>
            <Box bg="blue.900" color="blue.200" borderRadius="md" p={3} flexShrink={0}>
              <Icon as={FiGrid} boxSize={5} />
            </Box>
            <VStack align="start" spacing={1}>
              <Text color="editorText" fontWeight="semibold">
                Create a tileset first
              </Text>
              <CaptionText fontSize="sm" color="editorMutedText">
                Maps use a tileset for their grid and artwork. Import a sprite sheet, then
                you&apos;ll return here to create your map.
              </CaptionText>
            </VStack>
          </HStack>
        </Box>
      ) : (
        <>
          <VStack spacing={4}>
            <FormControl isRequired>
              <FormLabel>Map Name</FormLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </FormControl>

            <HStack spacing={4} w="full">
              <FormControl isRequired>
                <FormLabel>Width (Tiles)</FormLabel>
                <NumberInput value={width} min={1} max={256} onChange={(_, v) => setWidth(v)}>
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper border="none" color="gray.600" />
                    <NumberDecrementStepper border="none" color="gray.600" />
                  </NumberInputStepper>
                </NumberInput>
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Height (Tiles)</FormLabel>
                <NumberInput value={height} min={1} max={256} onChange={(_, v) => setHeight(v)}>
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper border="none" color="gray.600" />
                    <NumberDecrementStepper border="none" color="gray.600" />
                  </NumberInputStepper>
                </NumberInput>
              </FormControl>
            </HStack>

            <FormControl isRequired>
              <FormLabel>Base Tileset</FormLabel>
              <Select value={tilesetId} onChange={(e) => setTilesetId(e.target.value)}>
                {tilesets.map((ts) => (
                  <option key={ts.id} value={ts.id}>
                    {ts.name}
                  </option>
                ))}
              </Select>
            </FormControl>
          </VStack>
        </>
      )}
    </EntityFormDialog>
  );
};
