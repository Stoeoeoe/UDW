import React, { useMemo, useState } from 'react';
import { HStack, Tooltip, useToast } from '@chakra-ui/react';
import { FiExternalLink } from 'react-icons/fi';
import { useEditorStore } from '../../../store/useEditorStore';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { createEditorResourceDocument } from '../../../lib/editorResourceTypes';
import { CompactSelect } from '../../common/Fields';
import { GhostIconButton } from '../../common/IconButtons';
import { CreateDialogueDialog } from '../dialogue/CreateDialogueDialog';
import { createDialogue } from '../dialogue/createDialogue';
import type { MetadataDraft } from '../dialogue/dialogueUtils';

const NEW_DIALOGUE = '__new__';

const openDialogue = (id: string, name: string) =>
  useWorkspaceStore
    .getState()
    .openDocument(createEditorResourceDocument({ type: 'dialogue', id, name }), { pin: true });

/**
 * Picks a dialogue by ID, creates a new one for this spot, or opens the chosen one in its own tab. When empty,
 * `inherited` names the dialogue that stays in effect, so the author can see what the character says without
 * setting anything.
 */
export const DialogueSelect: React.FC<{
  label: string;
  value: string | undefined;
  inherited: string | null;
  emptyLabel?: string;
  onChange: (id: string | undefined) => void;
  /** Name suggested for a dialogue created here, such as "Fabia – market". */
  newName: string;
  /** Explorer folder for dialogues created here, such as the character's name. */
  newFolder: string;
}> = ({ label, value, inherited, onChange, newName, newFolder, emptyLabel }) => {
  const dialogues = useEditorStore((state) => state.dialogues);
  const dialogueTypes = useEditorStore((state) => state.project?.dialogueTypes) ?? [];
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const initialValues = useMemo<MetadataDraft>(
    () => ({ name: newName, oneShot: false, dialogueTypeId: '' }),
    [newName],
  );
  const name = (id: string) => dialogues.get(id)?.name ?? id;
  const known = !value || dialogues.has(value);

  const create = async (values: MetadataDraft, open: boolean) => {
    try {
      const dialogue = await createDialogue(values, newFolder);
      onChange(dialogue.id);
      setCreating(false);
      if (open) openDialogue(dialogue.id, dialogue.name);
    } catch (error) {
      toast({
        title: 'Could not create the dialogue',
        description: error instanceof Error ? error.message : String(error),
        status: 'error',
      });
    }
  };

  return (
    <HStack spacing={1} flex={1} minW={0}>
      <CompactSelect
        aria-label={label}
        value={value ?? ''}
        isInvalid={!known}
        onChange={(event) => {
          if (event.target.value === NEW_DIALOGUE) setCreating(true);
          else onChange(event.target.value || undefined);
        }}
      >
        <option value="">
          {inherited ? `keeps ${name(inherited)}` : (emptyLabel ?? 'nothing to say')}
        </option>
        {!known && <option value={value}>{value}</option>}
        {[...dialogues.values()]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((dialogue) => (
            <option key={dialogue.id} value={dialogue.id}>
              {dialogue.name}
            </option>
          ))}
        <option value={NEW_DIALOGUE}>New dialogue…</option>
      </CompactSelect>
      <Tooltip hasArrow label="Open this dialogue">
        <GhostIconButton
          aria-label={`Open ${label.toLowerCase()}`}
          icon={<FiExternalLink />}
          size="xs"
          isDisabled={!value || !known}
          onClick={() => value && openDialogue(value, name(value))}
        />
      </Tooltip>
      <CreateDialogueDialog
        isOpen={creating}
        onClose={() => setCreating(false)}
        mode="create"
        initialValues={initialValues}
        onApply={(values) => void create(values, false)}
        onApplyAndOpen={(values) => void create(values, true)}
        dialogueTypes={dialogueTypes}
      />
    </HStack>
  );
};
