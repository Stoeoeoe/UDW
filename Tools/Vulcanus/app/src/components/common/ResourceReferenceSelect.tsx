import React, { useMemo } from 'react';
import { Select, type SelectProps } from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';
import { useMusicStore } from '../../store/useMusicStore';
import { buildAllResourceDescriptors } from '../../lib/resourceAdapters';
import type { EditorResourceTypeId } from '../../types/editorResource';

/** Picks one of the project's resources of a type, such as a music cue. A value that no longer exists is kept visible. */
export const ResourceReferenceSelect: React.FC<
  { type: EditorResourceTypeId; value: string; onChange: (id: string) => void } & Omit<
    SelectProps,
    'value' | 'onChange'
  >
> = ({ type, value, onChange, ...props }) => {
  const maps = useEditorStore((state) => state.maps);
  const tilesets = useEditorStore((state) => state.tilesets);
  const characters = useEditorStore((state) => state.characters);
  const entityTypes = useEditorStore((state) => state.entityTypes);
  const items = useEditorStore((state) => state.items);
  const shops = useEditorStore((state) => state.shops);
  const quests = useEditorStore((state) => state.quests);
  const routines = useEditorStore((state) => state.routines);
  const dialogues = useEditorStore((state) => state.dialogues);
  const cutscenes = useEditorStore((state) => state.cutscenes);
  const musicCues = useMusicStore((state) => state.cues);

  const options = useMemo(
    () =>
      Object.values(
        buildAllResourceDescriptors({
          maps,
          tilesets,
          characters,
          entityTypes,
          items,
          shops,
          quests,
          routines,
          dialogues,
          cutscenes,
          musicCues,
        }),
      )
        .flat()
        .filter((descriptor) => descriptor.type === type)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [
      maps,
      tilesets,
      characters,
      entityTypes,
      items,
      shops,
      quests,
      routines,
      dialogues,
      cutscenes,
      musicCues,
      type,
    ],
  );

  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)} {...props}>
      <option value="">None</option>
      {value && !options.some((option) => option.id === value) && (
        <option value={value}>Missing: {value}</option>
      )}
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name} — {option.id}
        </option>
      ))}
    </Select>
  );
};
