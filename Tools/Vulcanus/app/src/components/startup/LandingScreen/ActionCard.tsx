import React from 'react';
import { Flex, Heading, Text } from '@chakra-ui/react';
import { EditorCard } from '../../common/Surfaces';

interface ActionCardProps {
  onClick: () => void;
  icon: React.ReactNode;
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
  <EditorCard
    p={8}
    rounded="xl"
    cursor="pointer"
    _hover={{ borderColor: hoverColor, transform: 'translateY(-4px)', bg: 'editorHoverBg' }}
    transition="all 0.2s"
    onClick={onClick}
    dropShadow="lg"
  >
    <Flex height={10} alignItems="center" justifyContent="center" mb={4} fontSize="4xl">
      {icon}
    </Flex>
    <Heading size="md" mb={2}>
      {title}
    </Heading>
    <Text color="gray.500" fontSize="sm">
      {description}
    </Text>
  </EditorCard>
);
