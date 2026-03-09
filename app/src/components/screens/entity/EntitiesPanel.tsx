import React from 'react';
import { VStack, Box, Text, Heading, HStack, Circle } from '@chakra-ui/react';
import { useEditorStore } from '../../../store/useEditorStore';

export const EntitiesPanel: React.FC = () => {
  const selectedEntityTypeId = useEditorStore(
    (state) => state.selectedEntityTypeId,
  );
  const setSelectedEntityType = useEditorStore(
    (state) => state.setSelectedEntityType,
  );
  const entityTypes = useEditorStore((state) => state.entityTypes);

  return (
    <VStack
      h="full"
      bg="gray.950"
      spacing={0}
      align="stretch"
      borderLeft="1px"
      borderColor="gray.800"
    >
      {/* Header */}
      <Box
        bg="gray.900"
        borderBottom="1px"
        borderColor="gray.800"
        px={4}
        py={3}
      >
        <VStack align="start" spacing={0}>
          <Text
            fontSize="xs"
            fontWeight="black"
            textTransform="uppercase"
            letterSpacing="widest"
            color="gray.500"
          >
            Library
          </Text>
          <Heading size="xs" color="white">
            Blueprint Entities
          </Heading>
        </VStack>
      </Box>

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
              bg={selectedEntityTypeId === type.id ? 'blue.900' : 'gray.900'}
              border="1px"
              borderColor={
                selectedEntityTypeId === type.id ? 'blue.500' : 'gray.800'
              }
              _hover={{
                bg: selectedEntityTypeId === type.id ? 'blue.900' : 'gray.800',
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
                  <Text fontSize="10px" color="gray.500">
                    {type.category.toUpperCase()}
                  </Text>
                </VStack>
              </HStack>
            </Box>
          ))}
        </VStack>

        <Box
          mt={6}
          p={4}
          bg="blue.900"
          rounded="md"
          border="1px"
          borderColor="blue.800"
        >
          <VStack spacing={1} align="start">
            <Text
              fontSize="9px"
              fontWeight="black"
              color="blue.200"
              textTransform="uppercase"
            >
              Placement Help
            </Text>
            <Text fontSize="9px" color="blue.100" lineHeight="tight">
              Select an entity above, then click on the map to place it.
              Entities can be moved and edited using the Select tool.
            </Text>
          </VStack>
        </Box>
      </Box>
    </VStack>
  );
};
