import React from 'react';
import { Box, VStack, Heading, Text, Divider, Flex } from '@chakra-ui/react';
import type { InspectorSection } from '../types';

export interface InspectorPanelProps {
  title: string; subtitle?: string; sections?: InspectorSection[]; children?: React.ReactNode; emptyState?: React.ReactNode;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({ title, subtitle, sections, children, emptyState }) => {
  const hasContent = children || (sections && sections.length > 0);
  return (
    <Flex direction="column" h="full" overflow="hidden">
      <Box bg="editor.headerBg" borderBottom="1px" borderColor="editor.border" px={4} py={3} flexShrink={0}>
        <VStack align="start" spacing={0}>
          <Text fontSize="9px" fontWeight="black" textTransform="uppercase" letterSpacing="widest" color="gray.500">Inspector</Text>
          <Heading size="xs" color="white">{title}</Heading>
          {subtitle && <Text fontSize="10px" color="gray.500" mt={0.5}>{subtitle}</Text>}
        </VStack>
      </Box>
      <Box flex={1} overflowY="auto" p={4}>
        {!hasContent && emptyState ? emptyState : (
          <VStack align="stretch" spacing={4}>
            {sections?.map((section, idx) => (
              <VStack key={idx} align="stretch" spacing={3}>
                {section.title && <Text fontSize="10px" fontWeight="black" textTransform="uppercase" letterSpacing="widest" color="gray.500">{section.title}</Text>}
                {section.content}
                {idx < sections.length - 1 && <Divider borderColor="editor.border" />}
              </VStack>
            ))}
            {children}
          </VStack>
        )}
      </Box>
    </Flex>
  );
};

export const InspectorEmptyState: React.FC<{ icon?: string; message: string; hint?: string }> = ({ icon = '🔍', message, hint }) => (
  <VStack mt={10} spacing={2} textAlign="center" opacity={0.4}>
    <Text fontSize="4xl">{icon}</Text>
    <Text color="gray.500" fontSize="sm">{message}</Text>
    {hint && <Text fontSize="10px" color="gray.600">{hint}</Text>}
  </VStack>
);
