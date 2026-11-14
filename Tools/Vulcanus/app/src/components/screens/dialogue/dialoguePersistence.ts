import {
  resourceFileKey,
  resourceRegistry,
  resourceSchemaPath,
} from '../../../lib/resourceRegistry';
import { fileSystem } from '../../../lib/fileSystem';
import { DialogueDocument } from '../../../types/schema';
import { buildI18nExport, toRuntimeDialogue } from './dialogueUtils';

export async function loadSortedDialogues(): Promise<DialogueDocument[]> {
  const loadedDialogues = await fileSystem.loadAllDialogues();
  return [...loadedDialogues].sort((left, right) => left.name.localeCompare(right.name));
}

export async function saveDialogueArtifacts(dialogue: DialogueDocument): Promise<void> {
  await fileSystem.saveJson(
    resourceRegistry.dialogue.folder,
    resourceFileKey('dialogue', dialogue.id),
    {
      $schema: resourceSchemaPath('dialogue'),
      ...dialogue,
    },
  );

  await fileSystem.saveJson(
    resourceRegistry.dialogue.folder,
    resourceFileKey('dialogue-runtime', dialogue.id),
    {
      ...toRuntimeDialogue(dialogue),
    },
  );

  await fileSystem.saveJson(
    resourceRegistry.dialogue.folder,
    resourceFileKey('dialogue-i18n', dialogue.id),
    buildI18nExport(dialogue),
  );
}
