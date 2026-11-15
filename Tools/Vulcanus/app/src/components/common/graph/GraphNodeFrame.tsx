import type { ReactNode } from 'react';
import { Badge, Box, HStack, IconButton, Text, Textarea } from '@chakra-ui/react';
import { FiMessageSquare, FiX } from 'react-icons/fi';
import { Handle, Position } from '@xyflow/react';

const categories = {
  'quest-step': { label: 'Quest step', color: 'orange' },
  action: { label: 'Action', color: 'green' },
  script: { label: 'Lua script', color: 'purple' },
  flow: { label: 'Flow', color: 'gray' },
  value: { label: 'Value', color: 'cyan' },
} as const;

/** Shared graph card chrome. Content editors supply only their fields and ports. */
export function GraphNodeFrame({
  title,
  subtitle,
  category,
  selected,
  pure,
  annotation,
  comment,
  onCommentChange,
  children,
}: {
  title: string;
  subtitle?: string;
  category?: keyof typeof categories;
  selected?: boolean;
  pure?: boolean;
  annotation?: boolean;
  comment?: string;
  onCommentChange?: (comment: string | undefined) => void;
  children?: ReactNode;
}) {
  return (
    <Box
      className={`cutscene-graph-node ${pure ? 'pure' : ''} ${annotation ? 'cutscene-graph-note' : ''} ${selected ? 'selected' : ''}`}
      data-node-category={category}
    >
      <Box className="cutscene-graph-node-title">
        {category && (
          <Badge colorScheme={categories[category].color} variant="subtle" fontSize="9px" mb={1}>
            {categories[category].label}
          </Badge>
        )}
        <HStack justify="space-between">
          <Text fontWeight="semibold" fontSize="sm">
            {pure ? 'ƒ ' : ''}
            {title}
          </Text>
          {!annotation && onCommentChange && (
            <IconButton
              className="nodrag"
              size="xs"
              variant="ghost"
              aria-label={comment === undefined ? 'Add node comment' : 'Remove node comment'}
              title={comment === undefined ? 'Add comment' : 'Remove comment'}
              icon={comment === undefined ? <FiMessageSquare /> : <FiX />}
              onClick={() => onCommentChange(comment === undefined ? '' : undefined)}
            />
          )}
        </HStack>
        {subtitle && (
          <Text fontSize="9px" color="editorMutedText">
            {subtitle}
          </Text>
        )}
      </Box>
      {(annotation || comment !== undefined) && (
        <Textarea
          className="nodrag nowheel nopan cutscene-graph-comment-text"
          aria-label={annotation ? 'Canvas comment' : `${title} comment`}
          placeholder="Write a comment…"
          size="xs"
          value={comment ?? ''}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => onCommentChange!(e.target.value)}
        />
      )}
      {children}
    </Box>
  );
}

export function GraphExecutionPort({
  direction,
  id,
  label,
}: {
  direction: 'source' | 'target';
  id: string;
  label: string;
}) {
  return (
    <Box className={`cutscene-graph-port exec ${direction}`}>
      <Handle
        type={direction}
        position={direction === 'source' ? Position.Right : Position.Left}
        id={`exec:${id}`}
        className="cutscene-exec-pin"
      />
      <Text fontSize="10px">{label}</Text>
    </Box>
  );
}
