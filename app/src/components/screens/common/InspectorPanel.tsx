import React from 'react';
import { Box, VStack, Text, Divider, Flex } from '@chakra-ui/react';
import PanelHeader from '../../../components/common/PanelHeader';

/**
 * InspectorPanel - A reusable right-side panel for viewing/editing properties.
 * Provides consistent header styling and section organization.
 */

export interface InspectorSection {
  title?: string;
  content: React.ReactNode;
}

export interface InspectorPanelProps {
  title: string;
  subtitle?: string;
  sections?: InspectorSection[];
  children?: React.ReactNode;
  emptyState?: React.ReactNode;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  title,
  subtitle,
  sections,
  children,
  emptyState,
}) => {
  const hasContent = children || (sections && sections.length > 0);

  return (
    <Flex direction="column" h="full" overflow="hidden">
      {/* Header */}
      <PanelHeader label="Inspector" title={title} subtitle={subtitle} />

      {/* Content */}
      <Box flex={1} overflowY="auto" p={4}>
        {!hasContent && emptyState ? (
          emptyState
        ) : (
          <VStack align="stretch" spacing={4}>
            {sections?.map((section, idx) => (
              <VStack key={idx} align="stretch" spacing={3}>
                {section.title && (
                  <Text
                    fontSize="10px"
                    fontWeight="black"
                    textTransform="uppercase"
                    letterSpacing="widest"
                    color="gray.500"
                  >
                    {section.title}
                  </Text>
                )}
                {section.content}
                {idx < sections.length - 1 && <Divider borderColor="#071018" />}
              </VStack>
            ))}
            {children}
          </VStack>
        )}
      </Box>
    </Flex>
  );
};

/** Empty state component for when nothing is selected */
export const InspectorEmptyState: React.FC<{
  icon?: string;
  message: string;
  hint?: string;
}> = ({ icon = '🔍', message, hint }) => (
  <VStack mt={10} spacing={2} textAlign="center" opacity={0.4}>
    <Text fontSize="4xl">{icon}</Text>
    <Text color="gray.500" fontSize="sm">
      {message}
    </Text>
    {hint && (
      <Text fontSize="10px" color="gray.600">
        {hint}
      </Text>
    )}
  </VStack>
);

export default InspectorPanel;
