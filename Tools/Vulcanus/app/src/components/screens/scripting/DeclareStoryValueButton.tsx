import React, { useState } from 'react';
import {
  Button,
  HStack,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Text,
  VStack,
  useDisclosure,
} from '@chakra-ui/react';
import { CompactInput, CompactSelect } from '../../common/Fields';
import { useEditorStore } from '../../../store/useEditorStore';
import { saveStoryValueDeclarations } from '../../../store/storyValues';
import type { StoryValueDefinition } from '../../../types/schema';

const TYPES: StoryValueDefinition['type'][] = ['boolean', 'long', 'double', 'string', 'object'];

/**
 * Declares a story key in Data from wherever a script uses it, starting from the type the script implies.
 * The declaration is the same as one made in Data; it does not create a runtime value.
 */
export const DeclareStoryValueButton: React.FC<{ suggestion: StoryValueDefinition }> = ({
  suggestion,
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [type, setType] = useState(suggestion.type);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    setType(suggestion.type);
    setDescription('');
    setError(null);
    onOpen();
  };
  const declare = () => {
    const values = useEditorStore.getState().project?.storyValues ?? [];
    try {
      saveStoryValueDeclarations([
        ...values,
        { key: suggestion.key, type, ...(description.trim() ? { description } : {}) },
      ]);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Popover isOpen={isOpen} onOpen={open} onClose={onClose} placement="bottom-end" isLazy>
      <PopoverTrigger>
        <Button size="xs" variant="link" fontSize="9px" colorScheme="orange" flexShrink={0}>
          Declare
        </Button>
      </PopoverTrigger>
      <PopoverContent w="260px" bg="editorPanelBg" borderColor="editorShellBorder">
        <PopoverBody>
          <VStack align="stretch" spacing={2}>
            <Text fontSize="xs">
              Declare{' '}
              <Text as="span" fontFamily="mono">
                {suggestion.key}
              </Text>{' '}
              in Data
            </Text>
            <CompactSelect
              aria-label="Story value type"
              value={type}
              onChange={(event) => setType(event.target.value as StoryValueDefinition['type'])}
            >
              {TYPES.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </CompactSelect>
            <CompactInput
              aria-label="Story value description"
              placeholder="Description (optional)"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') declare();
              }}
            />
            {error && (
              <Text fontSize="xs" color="editorDangerText">
                {error}
              </Text>
            )}
            <HStack justify="end">
              <Button size="xs" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button size="xs" colorScheme="blue" onClick={declare}>
                Add to Data
              </Button>
            </HStack>
          </VStack>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};
