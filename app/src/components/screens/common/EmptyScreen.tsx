import React from 'react';
import { VStack, Text, Center, Button } from '@chakra-ui/react';

export interface EmptyScreenProps {
  icon: string | React.ReactNode;
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
  <Center w="full" h="full" bg="editorCanvasBg">
    <VStack spacing={6}>
      <VStack spacing={2}>
        <Text fontSize="6xl">{icon}</Text>
        <Text color="editorText" fontWeight="bold" fontSize="xl">
          {title}
        </Text>
        <Text color="editorMutedText">{description}</Text>
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
