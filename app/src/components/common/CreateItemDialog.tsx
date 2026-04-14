import React from 'react';
import { useForm } from '@tanstack/react-form';
import { FormControl, FormErrorMessage, FormHelperText, Input, VStack } from '@chakra-ui/react';
import { EntityFormDialog } from '../screens/common/EntityFormDialog';
import { FormLabel } from './FormLabel';
import EditorModal from './EditorModal';

interface CreateItemDialogProps {
  title: string;
  itemType: string; // e.g., "Actor", "Entity Type"
  existingIds: string[];
  defaultName?: string;
  onSubmit: (data: { id: string; name: string }) => void;
  onClose: () => void;
  additionalFields?: React.ReactNode;
  deriveId?: (name: string) => string;
  /** When provided the dialog wraps itself in an EditorModal */
  isOpen?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

// Default ID derivation function
const defaultDeriveId = (val: string) =>
  val
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

export const CreateItemDialog: React.FC<CreateItemDialogProps> = ({
  title,
  itemType,
  existingIds,
  defaultName = '',
  onSubmit,
  onClose,
  additionalFields,
  deriveId = defaultDeriveId,
  isOpen,
  size = 'xl',
}) => {
  const form = useForm({
    defaultValues: {
      name: defaultName,
      customId: '',
    },
    onSubmit: async ({ value }) => {
      const name = value.name.trim(); // use from values
      const customId = value.customId.trim();

      const derivedId = deriveId(name);
      const finalId = customId || derivedId;

      onSubmit({ id: finalId, name });
    },
  });

  const card = (
    <EntityFormDialog
      title={title}
      onCancel={onClose}
      onSubmit={() => {
        form.handleSubmit();
      }}
      submitLabel={`Create ${itemType}`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <VStack spacing={4} align="stretch" mt={3}>
          <form.Field
            name="name"
            validators={{
              onChange: ({ value }) => (!value.trim() ? 'Name is required' : undefined),
            }}
          >
            {(field) => {
              const derivedId = deriveId(field.state.value);

              return (
                <FormControl isRequired isInvalid={field.state.meta.errors.length > 0}>
                  <FormLabel>Name</FormLabel>
                  <Input
                    size="sm"
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder={`e.g. My ${itemType}`}
                    bg="gray.800"
                    color="white"
                    autoFocus
                  />
                  {field.state.meta.errors.length > 0 ? (
                    <FormErrorMessage>{field.state.meta.errors.join(', ')}</FormErrorMessage>
                  ) : null}
                  <FormHelperText>
                    Will generate ID <strong>{derivedId}</strong>
                  </FormHelperText>
                </FormControl>
              );
            }}
          </form.Field>

          <form.Field
            name="customId"
            validators={{
              onChangeAsyncDebounceMs: 100,
              onChange: ({ value, fieldApi }) => {
                const name = fieldApi.form.getFieldValue('name');
                const derivedId = deriveId(name);

                const idToCheck = value.trim() || derivedId;
                if (existingIds.includes(idToCheck)) {
                  return 'This ID is already in use.';
                }
                return undefined;
              },
            }}
          >
            {(field) => (
              <FormControl isInvalid={field.state.meta.errors.length > 0}>
                <FormLabel>Custom ID (Optional)</FormLabel>
                <Input
                  size="sm"
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Override derived ID..."
                  fontFamily="mono"
                  bg="gray.800"
                  color="white"
                  fontSize="sm"
                />
                {field.state.meta.errors.length > 0 ? (
                  <FormErrorMessage>{field.state.meta.errors.join(', ')}</FormErrorMessage>
                ) : (
                  <FormHelperText>Leave blank to use the auto-generated ID.</FormHelperText>
                )}
              </FormControl>
            )}
          </form.Field>

          {additionalFields}
        </VStack>
      </form>
    </EntityFormDialog>
  );

  if (isOpen !== undefined) {
    return (
      <EditorModal isOpen={isOpen} onClose={onClose} size={size}>
        {card}
      </EditorModal>
    );
  }
  return card;
};
