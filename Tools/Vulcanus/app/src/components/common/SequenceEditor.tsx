import React from 'react';
import {
  Flex,
  Box,
  Button,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  VStack,
  useDisclosure,
  type BoxProps,
} from '@chakra-ui/react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/** Shared insertion palette for linear and branching sequence editors. */
export function SequenceTypeMenu<T extends string>({
  trigger,
  options,
  onSelect,
  placement = 'bottom',
}: {
  trigger: React.ReactElement;
  options: readonly { id: T; label: string }[];
  onSelect: (id: T) => void;
  placement?: React.ComponentProps<typeof Popover>['placement'];
}) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  return (
    <Popover isOpen={isOpen} onOpen={onOpen} onClose={onClose} placement={placement} isLazy>
      <PopoverTrigger>{trigger}</PopoverTrigger>
      {isOpen && (
        <PopoverContent w="240px" maxW="90vw" bg="editorPanelBg" borderColor="editorShellBorder">
          <PopoverBody p={1}>
            <VStack align="stretch" spacing={0}>
              {options.map((option) => (
                <Button
                  key={option.id}
                  size="xs"
                  variant="ghost"
                  justifyContent="flex-start"
                  fontWeight="normal"
                  onClick={() => {
                    onSelect(option.id);
                    onClose();
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </VStack>
          </PopoverBody>
        </PopoverContent>
      )}
    </Popover>
  );
}

export const SortableSequenceItem: React.FC<
  React.PropsWithChildren<{ id: string; handleTop?: BoxProps['top'] }>
> = ({ id, handleTop = '6px', children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <Box
      ref={setNodeRef}
      transform={CSS.Transform.toString(transform)}
      transition={transition}
      opacity={isDragging ? 0.4 : 1}
      position="relative"
    >
      <Box
        as="button"
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        position="absolute"
        top={handleTop}
        right="6px"
        zIndex={1}
        cursor="grab"
        color="editorMutedText"
        _hover={{ color: 'editorText' }}
        fontSize="11px"
        lineHeight={1}
        userSelect="none"
      >
        ⠿
      </Box>
      {children}
    </Box>
  );
};

/** Card chrome shared with Dialogue; domain content stays with each editor. */
export const SequenceCard: React.FC<
  React.PropsWithChildren<{
    selected: boolean;
    onClick?: React.MouseEventHandler<HTMLDivElement>;
    accent?: string;
    comment?: boolean;
    muted?: boolean;
    label?: string;
  }>
> = ({ selected, children, onClick, accent, comment = false, muted = false, label }) => (
  <Box
    role="group"
    opacity={muted ? 0.45 : 1}
    aria-label={label}
    tabIndex={onClick ? 0 : undefined}
    onClick={onClick}
    onKeyDown={(event) => {
      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        event.currentTarget.click();
      }
    }}
    border="1px"
    borderColor={selected ? 'blue.300' : 'editorSequenceBorder'}
    borderStyle={comment ? 'dashed' : 'solid'}
    borderLeftWidth="3px"
    borderLeftColor={selected ? 'blue.300' : accent}
    borderRadius="md"
    bg="editorSequenceBg"
    p={3}
    mb={2}
    cursor="pointer"
    boxShadow={selected ? '0 0 0 1px rgba(99, 179, 237, 0.22)' : 'none'}
    _hover={{ borderColor: selected ? 'blue.300' : 'editorSequenceHoverBorder' }}
  >
    {children}
  </Box>
);

/** Shared header geometry for sequence canvases. */
export const SequenceToolbar: React.FC<React.PropsWithChildren> = ({ children }) => (
  <Flex
    px={4}
    py={2}
    bg="editorSectionBg"
    borderBottom="1px"
    borderColor="editorShellBorder"
    align="center"
    gap={2}
    minH="40px"
    flexShrink={0}
  >
    {children}
  </Flex>
);
