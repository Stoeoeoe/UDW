import React from 'react';
import { Box, VStack, Text, Divider, Flex, HStack, Button, Icon } from '@chakra-ui/react';
import { DeleteIcon } from '@chakra-ui/icons';
import { IconType } from 'react-icons';
import PanelHeader from '../../../components/common/PanelHeader';
import { SectionLabel } from '../../../components/common/Typography.tsx';

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
  footerActions?: React.ReactNode;
  onDelete?: () => void;
  deleteLabel?: string;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  title,
  subtitle,
  sections,
  children,
  emptyState,
  footerActions,
  onDelete,
  deleteLabel = 'Delete',
}) => {
  const hasContent = children || (sections && sections.length > 0);
  const hasFooter = Boolean(footerActions) || Boolean(onDelete);

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
                  <SectionLabel textStyle="inspectorSectionLabel">{section.title}</SectionLabel>
                )}
                {section.content}
                {idx < sections.length - 1 && <Divider borderColor="#071018" />}
              </VStack>
            ))}
            {children}
          </VStack>
        )}
      </Box>

      {hasFooter && (
        <Box borderTop="1px" borderColor="editor.border" p={3}>
          <HStack justify="flex-end" spacing={2}>
            {footerActions}
            {onDelete && (
              <Button
                size="xs"
                colorScheme="red"
                variant="outline"
                leftIcon={<DeleteIcon fontSize="10px" />}
                onClick={onDelete}
              >
                {deleteLabel}
              </Button>
            )}
          </HStack>
        </Box>
      )}
    </Flex>
  );
};

/** Empty state component for when nothing is selected */
export const InspectorEmptyState: React.FC<{
  icon?: IconType;
  message: string;
  hint?: string;
}> = ({ icon, message, hint }) => (
  <VStack mt={10} spacing={2} textAlign="center" opacity={0.4}>
    {icon && <Icon as={icon} boxSize={8} />}
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
