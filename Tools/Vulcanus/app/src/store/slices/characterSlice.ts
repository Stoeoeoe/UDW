import {
  resourceFileKey,
  resourceRegistry,
  resourceSchemaPath,
  normalizeResourceDocument,
} from '../../lib/resourceRegistry';
import { assertUniqueResourceIds } from '../../lib/resourceIds';
import { castDraft } from 'immer';
import { StateCreator } from 'zustand';
import { Character } from '../../types/schema';
import { fileSystem } from '../../lib/fileSystem';
import type { EditorStore } from '../useEditorStore';

type ImmerStateCreator<T> = StateCreator<
  EditorStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  T
>;

export interface CharacterSlice {
  characters: Character[];
  selectedCharacterId: string | null;

  setSelectedCharacter: (id: string | null) => void;
  addCharacter: (character: Character) => Promise<void>;
  updateCharacter: (id: string, updates: Partial<Character>) => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;
}

export const createCharacterSlice: ImmerStateCreator<CharacterSlice> = (set, get) => ({
  characters: [],
  selectedCharacterId: null,

  setSelectedCharacter: (id) =>
    set((state) => {
      state.selectedCharacterId = id;
    }),

  addCharacter: async (character) => {
    character = normalizeResourceDocument(character, 'character', get().project?.idPrefix);
    assertUniqueResourceIds([...get().characters, character]);
    set((state) => {
      state.characters.push(castDraft(character));
    });
    await fileSystem.saveJson(
      resourceRegistry.character.folder,
      resourceFileKey('character', character.id),
      {
        $schema: resourceSchemaPath('character'),
        ...character,
      },
    );
  },

  updateCharacter: async (id, updates) => {
    let updatedCharacter: Character | null = null;
    set((state) => {
      const characterIndex = state.characters.findIndex((entry) => entry.id === id);
      if (characterIndex < 0) return;
      const merged = normalizeResourceDocument(
        {
          ...state.characters[characterIndex],
          ...updates,
          id: state.characters[characterIndex].id,
        } as Character,
        'character',
        get().project?.idPrefix,
      );
      updatedCharacter = merged;
      state.characters[characterIndex] = castDraft(merged);
    });
    const character = updatedCharacter ?? get().characters.find((entry) => entry.id === id);
    if (character) {
      await fileSystem.saveJson(
        resourceRegistry.character.folder,
        resourceFileKey('character', character.id),
        {
          $schema: resourceSchemaPath('character'),
          ...character,
        },
      );
    }
  },

  deleteCharacter: async (id) => {
    set((state) => {
      state.characters = state.characters.filter((a) => a.id !== id);
      if (state.selectedCharacterId === id) state.selectedCharacterId = null;
    });
    await fileSystem.deleteJson(
      resourceRegistry.character.folder,
      resourceFileKey('character', id),
    );
  },
});
