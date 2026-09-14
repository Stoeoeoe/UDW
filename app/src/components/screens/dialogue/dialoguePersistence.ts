import { fileSystem } from '../../../lib/fileSystem';
import { DialogueDocument } from '../../../types/schema';
import { buildI18nExport, toRuntimeDialogue } from './dialogueUtils';

export async function loadSortedDialogues(): Promise<DialogueDocument[]> {
  const loadedDialogues = await fileSystem.loadAllDialogues();
  return [...loadedDialogues].sort((left, right) => left.name.localeCompare(right.name));
}

export async function saveDialogueArtifacts(dialogue: DialogueDocument): Promise<void> {
  await fileSystem.saveJson('dialogues', `${dialogue.id}.dialogue.json`, {
    $schema: '../../schemas/dialogue.schema.json',
    ...dialogue,
  });

  await fileSystem.saveJson('dialogues', `${dialogue.id}.runtime.dialogue.json`, {
    ...toRuntimeDialogue(dialogue),
  });

  await fileSystem.saveJson('dialogues', `${dialogue.id}.i18n.json`, buildI18nExport(dialogue));
}
