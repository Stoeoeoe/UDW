import { qualifyResourceId } from '../../../lib/resourceIds';
import { resourceFileKey, resourceRegistry } from '../../../lib/resourceRegistry';
import { fileSystem } from '../../../lib/fileSystem';
import { saveDialogueImmediate } from '../../../lib/saveManager';
import { useEditorStore } from '../../../store/useEditorStore';
import type { DialogueDocument } from '../../../types/schema';
import {
  buildI18nExport,
  createEmptyDialogue,
  nextDialogueId,
  slugify,
  toRuntimeDialogue,
  type MetadataDraft,
} from './dialogueUtils';

/**
 * Creates an empty dialogue with its source, runtime and translation files, as the explorer does. Opening it is
 * up to the caller.
 */
export async function createDialogue(
  values: MetadataDraft,
  folderPath: string,
): Promise<DialogueDocument> {
  const state = useEditorStore.getState();
  const derived = slugify(values.name);
  const candidateId = qualifyResourceId(
    derived ? `dlg_${derived}` : nextDialogueId(state.dialogues.values()),
    state.project?.idPrefix,
  );
  const dialogueId = state.dialogues.has(candidateId)
    ? qualifyResourceId(nextDialogueId(state.dialogues.values()), state.project?.idPrefix)
    : candidateId;
  const dialogue = createEmptyDialogue(
    dialogueId,
    values.name.trim(),
    values.oneShot,
    values.dialogueTypeId,
  );
  dialogue.folderPath = folderPath || undefined;

  useEditorStore.setState((draft) => {
    draft.dialogues.set(dialogue.id, dialogue);
  });

  await saveDialogueImmediate(dialogue);
  await fileSystem.saveJson(
    resourceRegistry.dialogue.folder,
    resourceFileKey('dialogue-runtime', dialogue.id),
    toRuntimeDialogue(dialogue),
  );
  await fileSystem.saveJson(
    resourceRegistry.dialogue.folder,
    resourceFileKey('dialogue-i18n', dialogue.id),
    buildI18nExport(dialogue),
  );
  return dialogue;
}
