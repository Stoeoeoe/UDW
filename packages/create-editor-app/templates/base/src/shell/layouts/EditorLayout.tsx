import React from 'react';
import { Box, Flex, VStack, Heading, Text, HStack } from '@chakra-ui/react';

export interface EditorLayoutProps {
  header?: { title?: string; subtitle?: string; actions?: React.ReactNode };
  content: React.ReactNode;
  leftPanel?: React.ReactNode;
  rightPanel?: React.ReactNode;
  bottomPanel?: React.ReactNode;
  leftWidth?: string | number;
  rightWidth?: string | number;
  bottomHeight?: string | number;
  viewportBackground?: boolean;
}

export const EditorLayout: React.FC<EditorLayoutProps> = ({
  header, content, leftPanel, rightPanel, bottomPanel,
  leftWidth = '280px', rightWidth = '280px', bottomHeight = '200px',
  viewportBackground = true,
}) => {
  const hasHeader = header?.title || header?.subtitle || header?.actions;
  return (
    <Flex direction="column" h="full" w="full" overflow="hidden">
      {hasHeader && (
        <HStack px={6} py={3} bg="editor.border" borderBottom="1px" borderColor="editor.inputBorder" justify="space-between" h="14" flexShrink={0}>
          <VStack align="start" spacing={0}>
            {header?.title && <Heading size="xs" color="white" textTransform="uppercase" letterSpacing="widest">{header.title}</Heading>}
            {header?.subtitle && <Text fontSize="10px" color="gray.500" fontWeight="bold">{header.subtitle}</Text>}
          </VStack>
          {header?.actions && <HStack spacing={2}>{header.actions}</HStack>}
        </HStack>
      )}
      <Flex flex={1} overflow="hidden" minH={0}>
        {leftPanel && <Box w={leftWidth} flexShrink={0} bg="editor.panelBg" borderRight="1px" borderColor="editor.border" overflow="hidden">{leftPanel}</Box>}
        <Flex direction="column" flex={1} overflow="hidden">
          <Box flex={1} position="relative" bg={viewportBackground ? 'editor.viewportBg' : 'transparent'} overflow="hidden">{content}</Box>
          {bottomPanel && <Box h={bottomHeight} flexShrink={0} bg="editor.panelBg" borderTop="1px" borderColor="editor.border" overflow="hidden">{bottomPanel}</Box>}
        </Flex>
        {rightPanel && <Box w={rightWidth} flexShrink={0} bg="editor.panelBg" borderLeft="1px" borderColor="editor.border" overflow="hidden">{rightPanel}</Box>}
      </Flex>
    </Flex>
  );
};
