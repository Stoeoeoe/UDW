import React, { useEffect, useState } from 'react';
import { FormControl, Input, Select, Switch } from '@chakra-ui/react';
import { EntityFormDialog } from '../common';
import { EditorModal } from '../../common/EditorModal';
import { FormLabel } from '../../common/FormLabel';
import { DialogueType } from '../../../types/schema';
import { MetadataDraft } from './dialogueUtils';

interface CreateDialogueDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  initialValues: MetadataDraft;
  onApply: (values: MetadataDraft) => void;
  /** When set, offers "Create and open" next to "Create". */
  onApplyAndOpen?: (values: MetadataDraft) => void;
  dialogueTypes: DialogueType[];
}

export const CreateDialogueDialog: React.FC<CreateDialogueDialogProps> = ({
  isOpen,
  onClose,
  mode,
  initialValues,
  onApply,
  onApplyAndOpen,
  dialogueTypes,
}) => {
  const [draft, setDraft] = useState<MetadataDraft>(initialValues);

  useEffect(() => {
    if (isOpen) {
      setDraft(initialValues);
    }
  }, [isOpen, initialValues]);

  const handleSubmit = () => {
    onApply(draft);
  };

  return (
    <EditorModal isOpen={isOpen} onClose={onClose} size="md">
      <EntityFormDialog
        title={mode === 'create' ? 'Create Dialogue' : 'Edit Dialogue'}
        onCancel={onClose}
        onSubmit={handleSubmit}
        submitLabel={mode === 'create' ? 'Create' : 'Save'}
        isSubmitDisabled={!draft.name.trim()}
        minWidth="420px"
        secondaryAction={
          mode === 'create' && onApplyAndOpen
            ? { label: 'Create and open', onClick: () => onApplyAndOpen(draft) }
            : undefined
        }
      >
        <FormControl isRequired>
          <FormLabel>Name</FormLabel>
          <Input
            size="sm"
            bg="gray.800"
            color="white"
            value={draft.name}
            onChange={(e) => setDraft((cur) => ({ ...cur, name: e.target.value }))}
            autoFocus
          />
        </FormControl>

        <FormControl display="flex" alignItems="center" justifyContent="space-between">
          <FormLabel mb={0}>One-shot dialogue</FormLabel>
          <Switch
            size="sm"
            isChecked={draft.oneShot}
            onChange={(e) => setDraft((cur) => ({ ...cur, oneShot: e.target.checked }))}
          />
        </FormControl>

        <FormControl>
          <FormLabel>Dialogue Type</FormLabel>
          <Select
            size="sm"
            bg="gray.800"
            color="white"
            value={draft.dialogueTypeId}
            onChange={(e) => setDraft((cur) => ({ ...cur, dialogueTypeId: e.target.value }))}
          >
            <option value="">Project default</option>
            {dialogueTypes.map((dialogueType) => (
              <option key={dialogueType.id} value={dialogueType.id}>
                {dialogueType.name}
              </option>
            ))}
          </Select>
        </FormControl>
      </EntityFormDialog>
    </EditorModal>
  );
};
