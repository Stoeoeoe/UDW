import React from 'react';
import { VStack, Text, Center, Button } from '@chakra-ui/react';

export interface EmptyScreenProps {
  icon: string;
  title: string;
  description: string;
  buttonLabel?: string;
  onCreate?: () => void;
}

export const EmptyScreen: React.FC<EmptyScreenProps> = ({
  icon,
  title,
  description,
  buttonLabel,
  onCreate,
}) => (
  <Center w="full" h="full" bg="#0a0a0b">
    <VStack spacing={6}>
      <VStack spacing={2}>
        <Text fontSize="6xl">{icon}</Text>
        <Text color="white" fontWeight="bold" fontSize="xl">
          {title}
        </Text>
        <Text color="gray.500">{description}</Text>
      </VStack>
      {buttonLabel && onCreate && (
        <Button colorScheme="blue" size="lg" px={8} onClick={onCreate}>
          {buttonLabel}
        </Button>
      )}
    </VStack>
  </Center>
);

export default EmptyScreen;
