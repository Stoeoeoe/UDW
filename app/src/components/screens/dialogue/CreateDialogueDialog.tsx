import React, { useEffect, useState } from 'react';
import { FormControl, FormLabel, Input, Switch, Text } from '@chakra-ui/react';
import { EntityFormDialog } from '../common';
import { EditorModal } from '../../common/EditorModal';
import { ConditionEditor } from '../scripting/ConditionEditor';
import {
  GameVariable,
  ScriptContextType,
  ScriptFunction,
  ScriptNamespace,
  ScriptTable,
} from '../../../types/schema';
import { MetadataDraft } from './dialogueUtils';

interface CreateDialogueDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  initialValues: MetadataDraft;
  onApply: (values: MetadataDraft) => void;
  gameVariables: GameVariable[];
  scriptTables: ScriptTable[];
  scriptFunctions: ScriptFunction[];
  scriptNamespaces: ScriptNamespace[];
  activeContextType: ScriptContextType | undefined;
}

export const CreateDialogueDialog: React.FC<CreateDialogueDialogProps> = ({
  isOpen,
  onClose,
  mode,
  initialValues,
  onApply,
  gameVariables,
  scriptTables,
  scriptFunctions,
  scriptNamespaces,
  activeContextType,
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
      >
        <FormControl isRequired>
          <FormLabel fontSize="xs" color="gray.400">
            Name
          </FormLabel>
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
          <FormLabel fontSize="xs" color="gray.400" mb={0}>
            One-shot dialogue
          </FormLabel>
          <Switch
            size="sm"
            isChecked={draft.oneShot}
            onChange={(e) => setDraft((cur) => ({ ...cur, oneShot: e.target.checked }))}
          />
        </FormControl>

        <Text fontSize="xs" color="gray.400" fontWeight="bold" textTransform="uppercase">
          Entry Condition (Lua, optional)
        </Text>

        <ConditionEditor
          value={draft.entryCondition}
          onChange={(expr) => setDraft((cur) => ({ ...cur, entryCondition: expr }))}
          variables={gameVariables}
          tables={scriptTables}
          functions={scriptFunctions}
          namespaces={scriptNamespaces}
          activeContextType={activeContextType}
        />
      </EntityFormDialog>
    </EditorModal>
  );
};
