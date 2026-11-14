import React from 'react';
import { Box, HStack, VStack, Text } from '@chakra-ui/react';
import { SectionLabel } from './Typography.tsx';

interface ViewportShellProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export const ViewportShell: React.FC<ViewportShellProps> = ({ title, subtitle, children }) => {
  return (
    <VStack h="full" w="full" align="stretch" spacing={0}>
      <HStack
        px={6}
        py={3}
        bg="editorHeaderBg"
        borderBottom="1px"
        borderColor="editorShellBorder"
        justify="space-between"
        h="14"
        position="relative"
        zIndex={2}
      >
        <VStack align="start" spacing={0}>
          {title && <SectionLabel textStyle="panelLabel">{title}</SectionLabel>}
          {subtitle && (
            <Text fontSize="10px" color="gray.500" fontWeight="bold">
              {subtitle}
            </Text>
          )}
        </VStack>
      </HStack>
      <Box flex={1} position="relative" bg="editorCanvasBg" overflow="hidden">
        {children}
      </Box>
    </VStack>
  );
};

export default ViewportShell;
