import React from 'react';
import { Select } from '@chakra-ui/react';
import { useEditorStore } from '../../store/useEditorStore';

interface EmotionSelectProps {
  value: string | undefined;
  onChange: (emotionId: string | undefined) => void;
  /** Emotions that cannot be picked, for example because they are already taken. */
  excludeIds?: string[];
  placeholder?: string;
}

/** Dropdown over the project's Emotions, for any field that takes an emotion. */
export const EmotionSelect: React.FC<EmotionSelectProps> = ({
  value,
  onChange,
  excludeIds = [],
  placeholder = 'None',
}) => {
  const emotions = useEditorStore((state) => state.emotions);
  return (
    <Select
      size="xs"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || undefined)}
    >
      <option value="">{placeholder}</option>
      {emotions
        .filter((emotion) => emotion.id === value || !excludeIds.includes(emotion.id))
        .map((emotion) => (
          <option key={emotion.id} value={emotion.id}>
            {emotion.name}
          </option>
        ))}
    </Select>
  );
};
