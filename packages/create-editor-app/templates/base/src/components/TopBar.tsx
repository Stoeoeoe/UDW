import React from 'react';
import { Flex, HStack, Text, Box, Button } from '@chakra-ui/react';

interface TopBarProps {
  title: string;
}

/**
 * TopBar - Application top bar with branding and menu placeholders.
 * Customize this for your own app.
 */
export const TopBar: React.FC<TopBarProps> = ({ title }) => {
  return (
    <Flex align="center" justify="space-between" h="full" px="4" userSelect="none">
      <HStack spacing="6">
        <HStack spacing="2">
          <Flex w="6" h="6" bg="blue.600" rounded="md" align="center" justify="center" fontWeight="bold" color="white" fontSize="xs" boxShadow="sm">
            ED
          </Flex>
          <Text fontWeight="semibold" color="gray.300" fontSize="sm" letterSpacing="tight">
            {title}
          </Text>
        </HStack>

        <Box h="6" w="1px" bg="gray.700" />

        <HStack spacing="1">
          <Button variant="ghost" size="xs" color="gray.400" _hover={{ color: 'white', bg: 'gray.800' }} fontWeight="medium">
            File
          </Button>
          <Button variant="ghost" size="xs" color="gray.400" _hover={{ color: 'white', bg: 'gray.800' }} fontWeight="medium">
            Edit
          </Button>
          <Button variant="ghost" size="xs" color="gray.400" _hover={{ color: 'white', bg: 'gray.800' }} fontWeight="medium">
            View
          </Button>
        </HStack>
      </HStack>

      <HStack spacing="3">
        <Button colorScheme="blue" size="xs" fontWeight="medium" boxShadow="sm">
          Export
        </Button>
      </HStack>
    </Flex>
  );
};
