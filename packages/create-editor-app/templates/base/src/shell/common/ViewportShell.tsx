import React from 'react';
import { Box, HStack, VStack, Heading, Text } from '@chakra-ui/react';

export interface ViewportShellProps { title?: string; subtitle?: string; children?: React.ReactNode; }

export const ViewportShell: React.FC<ViewportShellProps> = ({ title, subtitle, children }) => (
  <VStack h="full" w="full" align="stretch" spacing={0}>
    <HStack px={6} py={3} bg="editor.border" borderBottom="1px" borderColor="editor.inputBorder" justify="space-between" h="14" position="relative" zIndex={2}>
      <VStack align="start" spacing={0}>
        {title && <Heading size="xs" color="white" textTransform="uppercase" letterSpacing="widest">{title}</Heading>}
        {subtitle && <Text fontSize="10px" color="gray.500" fontWeight="bold">{subtitle}</Text>}
      </VStack>
    </HStack>
    <Box flex={1} position="relative" bg="editor.viewportBg" overflow="hidden">{children}</Box>
  </VStack>
);
