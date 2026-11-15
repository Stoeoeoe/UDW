import React from 'react';
import { StartsQuestBadges } from './StartsQuestBadges';
import {
  Badge,
  Box,
  Button,
  FormControl,
  HStack,
  IconButton,
  Input,
  Select,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import { LuaScriptEditor } from '../scripting/LuaScriptEditor';
import { FieldLabel } from '../../common/Typography.tsx';
import { EmotionSelect } from '../../common/EmotionSelect';
import { NodeIdField } from './DialogueNodeWidgets';
import { ActionLuaValidation } from './dialogueUtils';
import {
  Character,
  DialogueChoiceNode,
  DialogueDocument,
  DialogueNode,
} from '../../../types/schema';

interface BaseSectionProps {
  selectedDialogue: DialogueDocument;
  removeSelectedNode: () => void;
  renameNode: (oldId: string, newId: string) => void;
}

interface LineSectionProps extends BaseSectionProps {
  node: Extract<DialogueNode, { type: 'line' }>;
  characters: Character[];
  duplicateMsgKeys: Set<string>;
  updateSelectedNode: (updater: (node: DialogueNode) => DialogueNode) => void;
}

export const DialogueLineInspectorSection: React.FC<LineSectionProps> = ({
  selectedDialogue,
  node,
  characters,
  duplicateMsgKeys,
  updateSelectedNode,
  renameNode,
  removeSelectedNode,
}) => (
  <VStack align="stretch" spacing={3}>
    <Badge colorScheme="blue" w="fit-content">
      line
    </Badge>

    <NodeIdField
      key={node.id}
      id={node.id}
      nodes={selectedDialogue.nodes}
      onRename={(newId) => renameNode(node.id, newId)}
    />

    <FormControl>
      <FieldLabel>Speaker</FieldLabel>
      <Select
        size="xs"
        value={node.speaker ?? ''}
        onChange={(event) => {
          const characterId = event.target.value || undefined;
          updateSelectedNode((current) => {
            if (current.type !== 'line') return current;
            return {
              ...current,
              speaker: characterId,
            };
          });
        }}
      >
        <option value="">Narrator</option>
        {characters.map((character) => (
          <option key={character.id} value={character.id}>
            {character.name}
          </option>
        ))}
      </Select>
    </FormControl>

    <FormControl>
      <FieldLabel>Emotion</FieldLabel>
      <EmotionSelect
        value={node.emotion}
        onChange={(emotion) =>
          updateSelectedNode((current) => {
            if (current.type !== 'line') return current;
            return { ...current, emotion };
          })
        }
      />
    </FormControl>

    <FormControl>
      <FieldLabel>Message Key</FieldLabel>
      <Input
        size="xs"
        value={node.msgKey}
        onChange={(event) =>
          updateSelectedNode((current) => {
            if (current.type !== 'line') return current;
            return { ...current, msgKey: event.target.value };
          })
        }
      />
      {duplicateMsgKeys.has(node.msgKey.trim()) && node.msgKey.trim() && (
        <Text fontSize="10px" color="orange.300" mt={1}>
          Duplicate msgKey in this dialogue.
        </Text>
      )}
    </FormControl>

    <FormControl>
      <FieldLabel>Text</FieldLabel>
      <Textarea
        minH="110px"
        value={node.text}
        onChange={(event) =>
          updateSelectedNode((current) => {
            if (current.type !== 'line') return current;
            return { ...current, text: event.target.value };
          })
        }
      />
      <Text fontSize="10px" color="gray.500" mt={1}>
        Interpolation tokens: [variable_path]
      </Text>
    </FormControl>

    <Button size="xs" colorScheme="red" variant="outline" onClick={removeSelectedNode}>
      Delete Node
    </Button>
  </VStack>
);

interface ChoiceSectionProps extends BaseSectionProps {
  node: DialogueChoiceNode;
  duplicateMsgKeys: Set<string>;
  dialogueNodeTargets: string[];
  updateChoiceOption: (
    choiceNodeId: string,
    optionId: string,
    updater: (
      option: DialogueChoiceNode['options'][number],
    ) => DialogueChoiceNode['options'][number],
  ) => void;
  moveChoiceOption: (node: DialogueChoiceNode, from: number, direction: -1 | 1) => void;
  removeChoiceOption: (choiceNodeId: string, optionId: string) => void;
  addChoiceOption: (choiceNodeId: string) => void;
  setChoiceOptionTarget: (
    choiceNodeId: string,
    optionId: string,
    targetNodeId: string,
    branchOrder: number,
  ) => void;
}

export const DialogueChoiceInspectorSection: React.FC<ChoiceSectionProps> = ({
  selectedDialogue,
  node,
  duplicateMsgKeys,
  dialogueNodeTargets,
  updateChoiceOption,
  moveChoiceOption,
  removeChoiceOption,
  addChoiceOption,
  setChoiceOptionTarget,
  renameNode,
  removeSelectedNode,
}) => (
  <VStack align="stretch" spacing={3}>
    <Badge colorScheme="purple" w="fit-content">
      choice
    </Badge>

    <NodeIdField
      key={node.id}
      id={node.id}
      nodes={selectedDialogue.nodes}
      onRename={(newId) => renameNode(node.id, newId)}
    />

    {node.options.map((option, index) => (
      <Box key={option.id} p={2} border="1px" borderColor="whiteAlpha.200" borderRadius="md">
        <HStack justify="space-between" mb={2}>
          <Text fontSize="11px" color="gray.200">
            Option {index + 1}
          </Text>
          <HStack spacing={1}>
            <IconButton
              aria-label="Move option up"
              size="xs"
              icon={<Text fontSize="10px">^</Text>}
              onClick={() => moveChoiceOption(node, index, -1)}
            />
            <IconButton
              aria-label="Move option down"
              size="xs"
              icon={<Text fontSize="10px">v</Text>}
              onClick={() => moveChoiceOption(node, index, 1)}
            />
            <IconButton
              aria-label="Delete option"
              size="xs"
              colorScheme="red"
              icon={<DeleteIcon fontSize="10px" />}
              onClick={() => removeChoiceOption(node.id, option.id)}
            />
          </HStack>
        </HStack>

        <VStack align="stretch" spacing={2}>
          <Input
            size="xs"
            value={option.text}
            onChange={(event) =>
              updateChoiceOption(node.id, option.id, (current) => ({
                ...current,
                text: event.target.value,
              }))
            }
            placeholder="Option text"
          />

          <Input
            size="xs"
            value={option.msgKey}
            onChange={(event) =>
              updateChoiceOption(node.id, option.id, (current) => ({
                ...current,
                msgKey: event.target.value,
              }))
            }
            placeholder="msgKey"
          />
          {duplicateMsgKeys.has(option.msgKey.trim()) && option.msgKey.trim() && (
            <Text fontSize="10px" color="orange.300">
              Duplicate msgKey in this dialogue.
            </Text>
          )}

          <Input
            size="xs"
            value={option.condition ?? ''}
            onChange={(event) =>
              updateChoiceOption(node.id, option.id, (current) => ({
                ...current,
                condition: event.target.value || null,
              }))
            }
            placeholder="condition (optional Lua)"
          />

          <Select
            size="xs"
            value={option.targetNodeId}
            onChange={(event) =>
              setChoiceOptionTarget(node.id, option.id, event.target.value, index)
            }
          >
            <option value="">Select target node</option>
            {dialogueNodeTargets.map((nodeId) => (
              <option key={nodeId} value={nodeId}>
                {nodeId}
              </option>
            ))}
          </Select>
        </VStack>
      </Box>
    ))}

    <Button size="xs" leftIcon={<AddIcon />} onClick={() => addChoiceOption(node.id)}>
      Add option
    </Button>

    <Button size="xs" colorScheme="red" variant="outline" onClick={removeSelectedNode}>
      Delete Node
    </Button>
  </VStack>
);

interface ActionSectionProps extends BaseSectionProps {
  node: Extract<DialogueNode, { type: 'action' }>;
  actionLuaValidation: ActionLuaValidation | null;
  updateSelectedNode: (updater: (node: DialogueNode) => DialogueNode) => void;
}

export const DialogueActionInspectorSection: React.FC<ActionSectionProps> = ({
  selectedDialogue,
  node,
  actionLuaValidation,
  updateSelectedNode,
  renameNode,
  removeSelectedNode,
}) => (
  <VStack align="stretch" spacing={3}>
    <Badge colorScheme="green" w="fit-content">
      action
    </Badge>

    <NodeIdField
      key={node.id}
      id={node.id}
      nodes={selectedDialogue.nodes}
      onRename={(newId) => renameNode(node.id, newId)}
    />

    <FormControl>
      <FieldLabel>Lua Script</FieldLabel>
      <Box border="1px" borderColor="editorInlineBorder" borderRadius="md" overflow="hidden">
        <LuaScriptEditor
          documentId={`${selectedDialogue.id}/${node.id}`}
          scope={{ mode: 'script', context: 'dialogue' }}
          value={node.lua}
          height="220px"
          onChange={(value) =>
            updateSelectedNode((current) => {
              if (current.type !== 'action') return current;
              return { ...current, lua: value };
            })
          }
        />
      </Box>
      <Text
        mt={1}
        fontSize="10px"
        color="orange.300"
        minH="16px"
        visibility={actionLuaValidation && !actionLuaValidation.ok ? 'visible' : 'hidden'}
      >
        {actionLuaValidation && !actionLuaValidation.ok
          ? `Lua syntax error: ${actionLuaValidation.error ?? 'Invalid chunk'}`
          : '\u00A0'}
      </Text>
    </FormControl>

    <StartsQuestBadges lua={node.lua} />

    <Button size="xs" colorScheme="red" variant="outline" onClick={removeSelectedNode}>
      Delete Node
    </Button>
  </VStack>
);

interface JumpSectionProps extends BaseSectionProps {
  node: Extract<DialogueNode, { type: 'jump' }>;
  dialogues: Map<string, DialogueDocument>;
  updateSelectedNode: (updater: (node: DialogueNode) => DialogueNode) => void;
}

export const DialogueJumpInspectorSection: React.FC<JumpSectionProps> = ({
  selectedDialogue,
  node,
  dialogues,
  updateSelectedNode,
  renameNode,
  removeSelectedNode,
}) => (
  <VStack align="stretch" spacing={3}>
    <Badge colorScheme="yellow" w="fit-content">
      jump
    </Badge>

    <NodeIdField
      key={node.id}
      id={node.id}
      nodes={selectedDialogue.nodes}
      onRename={(newId) => renameNode(node.id, newId)}
    />

    <FormControl>
      <FieldLabel>Target Dialogue</FieldLabel>
      <Select
        size="xs"
        value={node.targetDialogueId ?? ''}
        onChange={(event) =>
          updateSelectedNode((current) => {
            if (current.type !== 'jump') return current;
            return {
              ...current,
              targetDialogueId: event.target.value || null,
              targetNodeId: '',
            };
          })
        }
      >
        <option value="">Current dialogue</option>
        {Array.from(dialogues.values())
          .filter((dialogue) => dialogue.id !== selectedDialogue.id)
          .map((dialogue) => (
            <option key={dialogue.id} value={dialogue.id}>
              {dialogue.name}
            </option>
          ))}
      </Select>
    </FormControl>

    <FormControl>
      <FieldLabel>Target Node</FieldLabel>
      <Select
        size="xs"
        value={node.targetNodeId}
        onChange={(event) =>
          updateSelectedNode((current) => {
            if (current.type !== 'jump') return current;
            return {
              ...current,
              targetNodeId: event.target.value,
            };
          })
        }
      >
        <option value="">Select target node</option>
        {(dialogues.get(node.targetDialogueId || selectedDialogue.id)?.nodes ?? [])
          .filter((targetNode) => targetNode.type !== 'comment')
          .map((targetNode) => (
            <option key={targetNode.id} value={targetNode.id}>
              {targetNode.id}
            </option>
          ))}
      </Select>
    </FormControl>

    <Button size="xs" colorScheme="red" variant="outline" onClick={removeSelectedNode}>
      Delete Node
    </Button>
  </VStack>
);

interface CommentSectionProps extends BaseSectionProps {
  node: Extract<DialogueNode, { type: 'comment' }>;
  updateSelectedNode: (updater: (node: DialogueNode) => DialogueNode) => void;
}

export const DialogueCommentInspectorSection: React.FC<CommentSectionProps> = ({
  selectedDialogue,
  node,
  updateSelectedNode,
  renameNode,
  removeSelectedNode,
}) => (
  <VStack align="stretch" spacing={3}>
    <Badge colorScheme="gray" w="fit-content">
      comment (editor-only)
    </Badge>

    <NodeIdField
      key={node.id}
      id={node.id}
      nodes={selectedDialogue.nodes}
      onRename={(newId) => renameNode(node.id, newId)}
    />

    <Textarea
      minH="120px"
      value={node.text}
      onChange={(event) =>
        updateSelectedNode((current) => {
          if (current.type !== 'comment') return current;
          return { ...current, text: event.target.value };
        })
      }
    />

    <Button size="xs" colorScheme="red" variant="outline" onClick={removeSelectedNode}>
      Delete Node
    </Button>
  </VStack>
);

interface EndSectionProps extends BaseSectionProps {
  node: Extract<DialogueNode, { type: 'end' }>;
}

export const DialogueEndInspectorSection: React.FC<EndSectionProps> = ({
  selectedDialogue,
  node,
  renameNode,
  removeSelectedNode,
}) => (
  <VStack align="stretch" spacing={3}>
    <Badge colorScheme="red" w="fit-content">
      end
    </Badge>

    <NodeIdField
      key={node.id}
      id={node.id}
      nodes={selectedDialogue.nodes}
      onRename={(newId) => renameNode(node.id, newId)}
    />

    <Text fontSize="11px" color="gray.500">
      Ends the dialogue immediately. Useful for terminating a choice branch early.
    </Text>

    <Button size="xs" colorScheme="red" variant="outline" onClick={removeSelectedNode}>
      Delete Node
    </Button>
  </VStack>
);
