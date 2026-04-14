import React from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Text,
  VStack,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  useDisclosure,
} from '@chakra-ui/react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DialogueNode, DialogueNodeType } from '../../../types/schema';

// ── NodeTypeMenu ──────────────────────────────────────────────────────────────

const NODE_TYPES_MENU: Array<[DialogueNodeType, string]> = [
  ['line', 'Line'],
  ['choice', 'Choice'],
  ['action', 'Action'],
  ['jump', 'Jump'],
  ['comment', 'Comment'],
  ['end', 'End'],
];

export const NodeTypeMenu: React.FC<{
  trigger: React.ReactElement;
  onSelect: (type: DialogueNodeType) => void;
  placement?: React.ComponentProps<typeof Popover>['placement'];
}> = ({ trigger, onSelect, placement = 'bottom' }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  return (
    <Popover isOpen={isOpen} onOpen={onOpen} onClose={onClose} placement={placement} isLazy>
      <PopoverTrigger>{trigger}</PopoverTrigger>
      <PopoverContent w="150px" bg="#1e1e24" borderColor="#333">
        <PopoverBody p={1}>
          <VStack align="stretch" spacing={0}>
            {NODE_TYPES_MENU.map(([type, label]) => (
              <Button
                key={type}
                size="xs"
                variant="ghost"
                justifyContent="flex-start"
                fontWeight="normal"
                onClick={() => {
                  onSelect(type);
                  onClose();
                }}
              >
                {label}
              </Button>
            ))}
          </VStack>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};

// ── SortableGroupWrapper ──────────────────────────────────────────────────────

export const SortableGroupWrapper: React.FC<{ id: string; children: React.ReactNode }> = ({
  id,
  children,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <Box
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      position="relative"
    >
      <Box
        {...attributes}
        {...listeners}
        position="absolute"
        top="6px"
        right="6px"
        zIndex={1}
        cursor="grab"
        color="gray.600"
        _hover={{ color: 'gray.400' }}
        fontSize="11px"
        lineHeight={1}
        userSelect="none"
        title="Drag to reorder"
      >
        ⠿
      </Box>
      {children}
    </Box>
  );
};

// ── NodeIdField ───────────────────────────────────────────────────────────────

export const NodeIdField: React.FC<{
  id: string;
  nodes: DialogueNode[];
  onRename: (newId: string) => void;
}> = ({ id, nodes, onRename }) => {
  const [draft, setDraft] = React.useState(id);
  React.useEffect(() => {
    setDraft(id);
  }, [id]);

  const isDuplicate = draft.trim() !== id && nodes.some((n) => n.id === draft.trim());

  return (
    <FormControl>
      <FormLabel fontSize="10px" color="gray.500" textTransform="uppercase" mb={1}>
        Node ID
      </FormLabel>
      <Input
        size="xs"
        bg="#0a0a0b"
        borderColor={isDuplicate ? 'red.500' : '#1a1a2e'}
        color="white"
        fontFamily="mono"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (!isDuplicate && draft.trim()) onRename(draft.trim());
          else setDraft(id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isDuplicate && draft.trim()) onRename(draft.trim());
          if (e.key === 'Escape') setDraft(id);
        }}
      />
      {isDuplicate && (
        <Text fontSize="10px" color="red.400" mt={1}>
          ID already in use.
        </Text>
      )}
    </FormControl>
  );
};
