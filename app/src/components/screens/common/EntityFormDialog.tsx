import React from 'react';
import { Box, VStack, Text, HStack, Button, Divider } from '@chakra-ui/react';

export interface EntityFormDialogProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** When omitted a plain Close button is rendered instead of Cancel + Submit */
  onSubmit?: () => void;
  onCancel: () => void;
  submitLabel?: string;
  isSubmitDisabled?: boolean;
  cancelLabel?: string;
  minWidth?: string;
  /** Allow the content area to scroll when the dialog is tall */
  scrollable?: boolean;
}

/**
 * EntityFormDialog – Unified shell for every modal form in the editor.
 *
 * - Consistent card: gray.900 background, gray.800 border, rounded-xl
 * - Title + optional description header
 * - Scrollable content area (opt-in via `scrollable`)
 * - Footer: Cancel (ghost) + Submit (blue), or a single Close when onSubmit is omitted
 */
export const EntityFormDialog: React.FC<EntityFormDialogProps> = ({
  title,
  description,
  children,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  isSubmitDisabled = false,
  cancelLabel = 'Cancel',
  minWidth = '380px',
  scrollable = false,
}) => {
  return (
    <Box
      bg="gray.900"
      border="1px"
      borderColor="gray.800"
      borderRadius="xl"
      minW={minWidth}
      overflow="hidden"
      display="flex"
      flexDirection="column"
      maxH={scrollable ? '85vh' : undefined}
    >
      {/* Header */}
      <Box px={6} pt={6} pb={description ? 3 : 5} flexShrink={0}>
        <Text fontWeight="bold" fontSize="lg" color="white" lineHeight="short">
          {title}
        </Text>
        {description && (
          <Text fontSize="sm" color="gray.500" mt={1}>
            {description}
          </Text>
        )}
      </Box>

      <Divider />

      {/* Content */}
      <VStack
        spacing={4}
        align="stretch"
        px={6}
        py={5}
        flex={1}
        overflowY={scrollable ? 'auto' : undefined}
      >
        {children}
      </VStack>

      <Divider />

      {/* Footer */}
      <HStack justify="flex-end" spacing={3} px={6} py={4} flexShrink={0}>
        <Button variant="ghost" onClick={onCancel}>
          {onSubmit ? cancelLabel : 'Close'}
        </Button>
        {onSubmit && (
          <Button colorScheme="blue" isDisabled={isSubmitDisabled} onClick={onSubmit}>
            {submitLabel}
          </Button>
        )}
      </HStack>
    </Box>
  );
};

export default EntityFormDialog;
