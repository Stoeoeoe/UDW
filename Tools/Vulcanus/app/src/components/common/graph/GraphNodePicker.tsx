import { Box, Button, HStack, Input, Select, Text } from '@chakra-ui/react';
import { useState } from 'react';

export interface GraphChoice {
  id: string;
  label: string;
  category: string;
  pin?: string;
}
export function GraphNodePicker<T extends GraphChoice>({
  x,
  y,
  choices,
  onInsert,
  onClose,
}: {
  x: number;
  y: number;
  choices: T[];
  onInsert: (choice: T) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const visible = choices
    .filter(
      (c) =>
        (!category || c.category === category) &&
        `${c.category} ${c.label}`.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => a.label.localeCompare(b.label));
  return (
    <Box
      className="cutscene-graph-picker"
      style={{ left: x, top: y }}
      role="dialog"
      aria-label="Choose graph node"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <HStack mb={2}>
        <Input
          autoFocus
          size="sm"
          placeholder="Search nodes…"
          aria-label="Search graph nodes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button size="xs" aria-label="Close node suggestions" onClick={onClose}>
          ×
        </Button>
      </HStack>
      <Select
        size="xs"
        mb={2}
        aria-label="Node category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        <option value="">All categories</option>
        {[...new Set(choices.map((c) => c.category))].sort().map((c) => (
          <option key={c}>{c}</option>
        ))}
      </Select>
      <Box className="cutscene-graph-picker-results">
        {visible.map((c) => (
          <Button
            key={c.id}
            size="xs"
            variant="ghost"
            w="full"
            justifyContent="start"
            fontWeight="normal"
            onClick={() => onInsert(c)}
          >
            {c.label}
            {c.pin ? ` → ${c.pin}` : ''}
          </Button>
        ))}
        {!visible.length && (
          <Text fontSize="xs" p={2}>
            No compatible functions or values.
          </Text>
        )}
      </Box>
    </Box>
  );
}
