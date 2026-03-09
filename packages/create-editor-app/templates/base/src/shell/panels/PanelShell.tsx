import React from 'react';
import { Box, VStack, Heading, Text } from '@chakra-ui/react';

export interface PanelShellProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export const PanelShell: React.FC<PanelShellProps> = ({
  title,
  subtitle,
  children,
}) => (
  <VStack h="full" w="full" align="stretch" spacing={0} bg="editor.panelBg">
    <Box
      bg="editor.headerBg"
      borderBottom="1px"
      borderColor="editor.border"
      px={4}
      py={3}
    >
      <VStack align="start" spacing={0}>
        {title && (
          <Heading size="xs" color="white">
            {title}
          </Heading>
        )}
        {subtitle && (
          <Text fontSize="10px" color="gray.500">
            {subtitle}
          </Text>
        )}
      </VStack>
    </Box>
    <Box p={4} overflowY="auto" flex={1}>
      {children}
    </Box>
  </VStack>
);
