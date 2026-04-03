import React, { useState } from 'react';
import {
  VStack,
  HStack,
  Box,
  Text,
  IconButton,
  Button,
  Spacer,
  Collapse,
  Heading,
  useDisclosure,
} from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import {
  AddIcon,
  DeleteIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@chakra-ui/icons';
import { MapCreator } from '../../dialogs/MapCreator';
import { LayersPanel } from './LayersPanel';
import { EditorModal } from '../../common/EditorModal';
import PanelHeader from '../../../components/common/PanelHeader';

export const MapsPanel: React.FC = () => {
  const currentMap = useEditorStore((state) => state.currentMap);
  const activeVariationId = useEditorStore((state) => state.activeVariationId);
  const setActiveVariation = useEditorStore(
    (state) => state.setActiveVariation,
  );
  const addVariation = useEditorStore((state) => state.addVariation);
  const removeVariation = useEditorStore((state) => state.removeVariation);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [variationsOpen, setVariationsOpen] = useState(true);

  const handleAddVariation = () => {
    if (!currentMap) return;
    const name = prompt('Enter variation name:');
    if (!name) return;

    const id = name.toLowerCase().replace(/\s+/g, '-');
    addVariation({
      id,
      displayName: name,
      kind: 'generic',
      layerOverrides: {},
      entityOverrides: [],
    });
    setActiveVariation(id);
  };

  return (
    <VStack
      h="full"
      bg="gray.950"
      spacing={0}
      align="stretch"
      borderLeft="1px"
      borderColor="gray.800"
    >
      {/* Header: Map Title */}
      <PanelHeader
        title={currentMap?.name || 'No Map Loaded'}
        actions={
          <IconButton
            aria-label="New Map"
            icon={<AddIcon fontSize="10px" />}
            size="xs"
            colorScheme="blue"
            onClick={onOpen}
          />
        }
      />

      <VStack spacing={0} align="stretch" flex={1} overflow="hidden">
        {/* Variations Section */}
        <Box flex="0 0 auto" borderBottom="1px" borderColor="gray.800">
          <Box
            bg="gray.900"
            px={4}
            py={2}
            cursor="pointer"
            onClick={() => setVariationsOpen(!variationsOpen)}
            _hover={{ bg: 'gray.800' }}
          >
            <HStack>
              <Text
                fontSize="10px"
                fontWeight="black"
                textTransform="uppercase"
                letterSpacing="widest"
                color="gray.400"
              >
                Variations
              </Text>
              <Spacer />
              <IconButton
                aria-label="Add Variation"
                icon={<AddIcon fontSize="10px" />}
                size="xs"
                variant="ghost"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  handleAddVariation();
                }}
              />
              {variationsOpen ? (
                <ChevronUpIcon color="gray.500" />
              ) : (
                <ChevronDownIcon color="gray.500" />
              )}
            </HStack>
          </Box>

          <Collapse in={variationsOpen}>
            <VStack
              align="stretch"
              spacing={1}
              p={2}
              maxH="200px"
              overflowY="auto"
            >
              <Button
                size="xs"
                variant={activeVariationId === null ? 'solid' : 'ghost'}
                colorScheme={activeVariationId === null ? 'blue' : 'gray'}
                justifyContent="start"
                onClick={() => setActiveVariation(null)}
                fontSize="xs"
                h="7"
                isDisabled={!currentMap}
              >
                <Text as="span" opacity={0.5} mr={2}>
                  🌳
                </Text>
                Base Map
              </Button>

              {currentMap?.variations?.map((v) => (
                <HStack key={v.id} spacing={0}>
                  <Button
                    flex={1}
                    size="xs"
                    variant={activeVariationId === v.id ? 'solid' : 'ghost'}
                    colorScheme={activeVariationId === v.id ? 'blue' : 'gray'}
                    justifyContent="start"
                    onClick={() => setActiveVariation(v.id)}
                    fontSize="xs"
                    h="7"
                  >
                    <Text as="span" opacity={0.5} mr={1} ml={2}>
                      ↳
                    </Text>
                    {v.displayName}
                  </Button>
                  <IconButton
                    aria-label="Delete Variation"
                    icon={<DeleteIcon fontSize="10px" />}
                    size="xs"
                    variant="ghost"
                    colorScheme="red"
                    opacity={0.3}
                    _hover={{ opacity: 1 }}
                    onClick={() => removeVariation(v.id)}
                  />
                </HStack>
              ))}
            </VStack>
          </Collapse>
        </Box>

        {/* Layers Section */}
        <Box flex={1} overflow="hidden">
          <LayersPanel />
        </Box>
      </VStack>

      {/* Map Creator Modal */}
      <EditorModal isOpen={isOpen} onClose={onClose}>
        <MapCreator onCreate={onClose} onCancel={onClose} />
      </EditorModal>
    </VStack>
  );
};
