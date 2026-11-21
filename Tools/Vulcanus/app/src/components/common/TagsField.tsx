import { useState } from 'react';
import { Tag, TagCloseButton, TagLabel, VStack, Wrap, WrapItem } from '@chakra-ui/react';
import { ComboboxInput } from './ComboboxInput';

/**
 * Free-text tags: type one and press Enter to add it; the input suggests tags already used elsewhere.
 */
export function TagsField({
  value,
  suggestions,
  onChange,
  label = 'Tags',
}: {
  value: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
  label?: string;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const tag = draft.trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft('');
  };
  return (
    <VStack align="stretch" spacing={2}>
      {value.length > 0 && (
        <Wrap spacing={1}>
          {value.map((tag) => (
            <WrapItem key={tag}>
              <Tag size="sm" variant="subtle" colorScheme="green">
                <TagLabel>{tag}</TagLabel>
                <TagCloseButton
                  aria-label={`Remove tag ${tag}`}
                  onClick={() => onChange(value.filter((entry) => entry !== tag))}
                />
              </Tag>
            </WrapItem>
          ))}
        </Wrap>
      )}
      <ComboboxInput
        size="sm"
        aria-label={label}
        placeholder="Add a tag and press Enter"
        value={draft}
        options={suggestions.filter((tag) => !value.includes(tag))}
        onChange={setDraft}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          add();
        }}
        onBlur={add}
      />
    </VStack>
  );
}
