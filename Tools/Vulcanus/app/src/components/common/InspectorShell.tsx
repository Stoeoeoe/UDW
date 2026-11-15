import React from 'react';
import { Box, Button, Divider, Flex, HStack, Icon, Text, VStack } from '@chakra-ui/react';
import { DeleteIcon } from '@chakra-ui/icons';
import { IconType } from 'react-icons';
import PanelHeader from './PanelHeader';
import { SectionLabel } from './Typography.tsx';

export interface InspectorSectionData {
  title?: string;
  content: React.ReactNode;
}

export interface InspectorShellProps {
  title: string;
  subtitle?: string;
  sections?: InspectorSectionData[];
  children?: React.ReactNode;
  emptyState?: React.ReactNode;
  footerActions?: React.ReactNode;
  onDelete?: () => void;
  deleteLabel?: string;
}

export const InspectorShell: React.FC<InspectorShellProps> = ({
  title,
  subtitle,
  sections,
  children,
  emptyState,
  footerActions,
  onDelete,
  deleteLabel = 'Delete',
}) => {
  const hasContent = React.Children.toArray(children).length > 0 || Boolean(sections?.length);
  const hasFooter = Boolean(footerActions) || Boolean(onDelete);

  return (
    <Flex direction="column" h="full" overflow="hidden">
      <PanelHeader label="Inspector" title={title} subtitle={subtitle} />

      <Box flex={1} overflowY="auto" p={4}>
        {!hasContent && emptyState ? (
          emptyState
        ) : (
          <VStack align="stretch" spacing={4}>
            {sections?.map((section, idx) => (
              <VStack key={idx} align="stretch" spacing={3}>
                {section.title ? (
                  <SectionLabel textStyle="inspectorSectionLabel">{section.title}</SectionLabel>
                ) : null}
                {section.content}
                {idx < sections.length - 1 ? <Divider /> : null}
              </VStack>
            ))}
            {children}
          </VStack>
        )}
      </Box>

      {hasFooter ? (
        <Box borderTop="1px" borderColor="editorShellBorder" p={3}>
          <HStack justify="flex-end" spacing={2}>
            {footerActions}
            {onDelete ? (
              <Button
                size="xs"
                colorScheme="red"
                variant="outline"
                leftIcon={<DeleteIcon fontSize="10px" />}
                onClick={onDelete}
              >
                {deleteLabel}
              </Button>
            ) : null}
          </HStack>
        </Box>
      ) : null}
    </Flex>
  );
};

export const InspectorEmptyState: React.FC<{
  icon?: IconType;
  message: string;
  hint?: string;
}> = ({ icon, message, hint }) => (
  <VStack mt={10} spacing={2} textAlign="center" opacity={0.5}>
    {icon ? <Icon as={icon} boxSize={8} /> : null}
    <Text color="editorMutedText" fontSize="sm">
      {message}
    </Text>
    {hint ? <Text textStyle="helperText">{hint}</Text> : null}
  </VStack>
);

export default InspectorShell;
