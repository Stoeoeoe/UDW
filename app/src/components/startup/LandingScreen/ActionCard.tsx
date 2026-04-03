import React from 'react';
import { Box, Heading, Text } from '@chakra-ui/react';

interface ActionCardProps {
  onClick: () => void;
  icon: string;
  title: string;
  description: string;
  hoverColor: string;
}

export const ActionCard: React.FC<ActionCardProps> = ({
  onClick,
  icon,
  title,
  description,
  hoverColor,
}) => (
  <Box
    p={8}
    bg="gray.900"
    border="1px"
    borderColor="gray.800"
    rounded="xl"
    cursor="pointer"
    _hover={{ borderColor: hoverColor, transform: 'translateY(-4px)', bg: 'gray.800' }}
    transition="all 0.2s"
    onClick={onClick}
  >
    <Text fontSize="4xl" mb={4}>
      {icon}
    </Text>
    <Heading size="md" mb={2}>
      {title}
    </Heading>
    <Text color="gray.500" fontSize="sm">
      {description}
    </Text>
  </Box>
);
