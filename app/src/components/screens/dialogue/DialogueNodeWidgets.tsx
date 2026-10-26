import React from 'react';
import { FormControl, Input, Text } from '@chakra-ui/react';
import { DialogueNode, DialogueNodeType } from '../../../types/schema';
import { FieldLabel } from '../../common/Typography.tsx';
import { SequenceTypeMenu } from '../../common/SequenceEditor';
export { SortableSequenceItem as SortableGroupWrapper } from '../../common/SequenceEditor';

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
  placement?: React.ComponentProps<typeof SequenceTypeMenu>['placement'];
}> = ({ trigger, onSelect, placement }) => (
  <SequenceTypeMenu
    trigger={trigger}
    options={NODE_TYPES_MENU.map(([id, label]) => ({ id, label }))}
    onSelect={onSelect}
    placement={placement}
  />
);

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
      <FieldLabel>Node ID</FieldLabel>
      <Input
        size="xs"
        bg="editorInlineBg"
        borderColor={isDuplicate ? 'red.500' : 'editorInlineBorder'}
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
