import React from 'react';
import { VStack, Box, Text, Heading, HStack, Circle } from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';
import { CaptionText } from '../../common/Typography.tsx';
import { SurfaceSectionHeader } from '../../common/Surfaces';

export const EntitiesPanel: React.FC = () => {
  const selectedEntityTypeId = useEditorStore((state) => state.selectedEntityTypeId);
  const setSelectedEntityType = useEditorStore((state) => state.setSelectedEntityType);
  const entityTypes = useEditorStore((state) => state.entityTypes);

  return (
    <VStack
      h="full"
      bg="editorPanelBg"
      spacing={0}
      align="stretch"
      borderLeft="1px"
      borderColor="editorBorderSubtle"
    >
      {/* Header */}
      <SurfaceSectionHeader title="Library" py={3}>
        <VStack align="start" spacing={0}>
          <Heading size="xs" color="white">
            Blueprint Entities
          </Heading>
        </VStack>
      </SurfaceSectionHeader>

      {/* List */}
      <Box flex={1} overflowY="auto" p={3}>
        <VStack spacing={2} align="stretch">
          {entityTypes.map((type) => (
            <Box
              key={type.id}
              px={3}
              py={3}
              rounded="md"
              cursor="pointer"
              bg={selectedEntityTypeId === type.id ? 'blue.900' : 'editorChromeBg'}
              border="1px"
              borderColor={selectedEntityTypeId === type.id ? 'blue.500' : 'editorBorderSubtle'}
              _hover={{
                bg: selectedEntityTypeId === type.id ? 'blue.900' : 'editorHoverBg',
              }}
              onClick={() => setSelectedEntityType(type.id)}
              transition="all 0.1s"
            >
              <HStack spacing={3}>
                <Circle size="10px" bg={type.placeholderColor} />
                <VStack align="start" spacing={0} flex={1}>
                  <Text fontSize="xs" fontWeight="bold" color="white">
                    {type.displayName}
                  </Text>
                  <CaptionText color="gray.500">{type.category.toUpperCase()}</CaptionText>
                </VStack>
              </HStack>
            </Box>
          ))}
        </VStack>

        <Box mt={6} p={4} bg="blue.900" rounded="md" border="1px" borderColor="blue.800">
          <VStack spacing={1} align="start">
            <Text fontSize="9px" fontWeight="black" color="blue.200" textTransform="uppercase">
              Placement Help
            </Text>
            <Text fontSize="9px" color="blue.100" lineHeight="tight">
              Select an entity above, then click on the map to place it. Entities can be moved and
              edited using the Select tool.
            </Text>
          </VStack>
        </Box>
      </Box>
    </VStack>
  );
};
