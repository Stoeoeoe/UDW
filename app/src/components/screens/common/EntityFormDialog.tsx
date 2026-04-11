import React from 'react';
import { Box, VStack, Text, HStack, Button } from '@chakra-ui/react';

export interface EntityFormDialogProps {
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  isSubmitDisabled?: boolean;
  cancelLabel?: string;
  minWidth?: string;
}

/**
 * EntityFormDialog - Shared shell for create/edit entity-like modal forms.
 * Keeps modal card styling and action layout consistent across editors.
 */
export const EntityFormDialog: React.FC<EntityFormDialogProps> = ({
  title,
  children,
  onCancel,
  onSubmit,
  submitLabel,
  isSubmitDisabled = false,
  cancelLabel = 'Cancel',
  minWidth = '380px',
}) => {
  return (
    <Box p={6} minW={minWidth} bg="gray.900" border="1px" borderColor="gray.700" borderRadius="md">
      <VStack spacing={5} align="stretch">
        <Text fontWeight="bold" fontSize="lg" color="white">
          {title}
        </Text>

        {children}

        <HStack justify="flex-end" spacing={3} pt={2}>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button size="sm" colorScheme="blue" isDisabled={isSubmitDisabled} onClick={onSubmit}>
            {submitLabel}
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
};

export default EntityFormDialog;
