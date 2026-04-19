import React from 'react';
import {
  Badge,
  Box,
  Button,
  FormControl,
  HStack,
  IconButton,
  Input,
  Select,
  Switch,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import { LuaScriptEditor } from '../scripting/LuaScriptEditor';
import { ConditionEditor } from '../scripting/ConditionEditor';
import { InspectorEmptyState, InspectorPanel } from '../common';
import { FieldLabel } from '../../common/Typography.tsx';
import { NodeIdField } from './DialogueNodeWidgets';
import {
  assignBranchMetaToNode,
  nextOptionId,
  parseTags,
  suggestMsgKey,
  ActionLuaValidation,
} from './dialogueUtils';
import {
  Actor,
  DialogueChoiceNode,
  DialogueChoiceOption,
  DialogueDocument,
  DialogueNode,
  GameVariable,
  ScriptContextType,
  ScriptFunction,
  ScriptNamespace,
  ScriptTable,
} from '../../../types/schema';

interface DialogueNodeInspectorProps {
  selectedDialogue: DialogueDocument | null;
  selectedNode: DialogueNode | null;
  actors: Actor[];
  gameVariables: GameVariable[];
  scriptTables: ScriptTable[];
  scriptFunctions: ScriptFunction[];
  scriptNamespaces: ScriptNamespace[];
  activeContextType: ScriptContextType | undefined;
  duplicateMsgKeys: Set<string>;
  dialogueNodeTargets: string[];
  dialogues: Map<string, DialogueDocument>;
  actionLuaValidation: ActionLuaValidation | null;
  updateDialogue: (id: string, updater: (d: DialogueDocument) => DialogueDocument) => void;
  updateSelectedNode: (updater: (node: DialogueNode) => DialogueNode) => void;
  updateChoiceOption: (
    choiceNodeId: string,
    optionId: string,
    updater: (o: DialogueChoiceOption) => DialogueChoiceOption,
  ) => void;
  moveChoiceOption: (node: DialogueChoiceNode, from: number, direction: -1 | 1) => void;
  renameNode: (oldId: string, newId: string) => void;
  removeSelectedNode: () => void;
}

export const DialogueNodeInspector: React.FC<DialogueNodeInspectorProps> = ({
  selectedDialogue,
  selectedNode,
  actors,
  gameVariables,
  scriptTables,
  scriptFunctions,
  scriptNamespaces,
  activeContextType,
  duplicateMsgKeys,
  dialogueNodeTargets,
  dialogues,
  actionLuaValidation,
  updateDialogue,
  updateSelectedNode,
  updateChoiceOption,
  moveChoiceOption,
  renameNode,
  removeSelectedNode,
}) => {
  return (
    <InspectorPanel
      title={selectedDialogue?.name || 'Dialogue'}
      subtitle={selectedDialogue ? selectedDialogue.id : undefined}
      emptyState={
        <InspectorEmptyState message="No dialogue selected" hint="Create or pick a dialogue" />
      }
    >
      {!selectedDialogue && null}

      {selectedDialogue && !selectedNode && (
        <VStack align="stretch" spacing={4}>
          <Text fontSize="12px" color="gray.500" fontStyle="italic">
            Click a node to inspect it.
          </Text>
          <Text fontSize="10px" color="gray.500" textTransform="uppercase" fontWeight="bold">
            Dialogue Metadata
          </Text>

          <FormControl>
            <FieldLabel>Name</FieldLabel>
            <Input
              size="xs"
              value={selectedDialogue.name}
              onChange={(event) =>
                updateDialogue(selectedDialogue.id, (dialogue) => ({
                  ...dialogue,
                  name: event.target.value,
                }))
              }
            />
          </FormControl>

          <FormControl display="flex" alignItems="center" justifyContent="space-between">
            <FieldLabel mb={0}>One-shot</FieldLabel>
            <Switch
              size="sm"
              isChecked={selectedDialogue.oneShot}
              onChange={(event) =>
                updateDialogue(selectedDialogue.id, (dialogue) => ({
                  ...dialogue,
                  oneShot: event.target.checked,
                }))
              }
            />
          </FormControl>

          <FormControl>
            <FieldLabel>Tags (comma separated)</FieldLabel>
            <Input
              size="xs"
              value={selectedDialogue.tags.join(', ')}
              onChange={(event) =>
                updateDialogue(selectedDialogue.id, (dialogue) => ({
                  ...dialogue,
                  tags: parseTags(event.target.value),
                }))
              }
            />
          </FormControl>

          <Text fontSize="10px" color="gray.500" textTransform="uppercase" fontWeight="bold">
            Entry Condition (Lua)
          </Text>

          <ConditionEditor
            value={selectedDialogue.entryCondition ?? ''}
            onChange={(expr) =>
              updateDialogue(selectedDialogue.id, (dialogue) => ({
                ...dialogue,
                entryCondition: expr.trim() ? expr : undefined,
              }))
            }
            variables={gameVariables}
            tables={scriptTables}
            functions={scriptFunctions}
            namespaces={scriptNamespaces}
            activeContextType={activeContextType}
          />
        </VStack>
      )}

      {selectedDialogue && selectedNode?.type === 'line' && (
        <VStack align="stretch" spacing={3}>
          <Badge colorScheme="blue" w="fit-content">
            line
          </Badge>

          <NodeIdField
            key={selectedNode.id}
            id={selectedNode.id}
            nodes={selectedDialogue.nodes}
            onRename={(newId) => renameNode(selectedNode.id, newId)}
          />

          <FormControl>
            <FieldLabel>Speaker</FieldLabel>
            <Select
              size="xs"
              value={selectedNode.speaker ?? ''}
              onChange={(event) => {
                const actorId = event.target.value || undefined;
                const actor = actors.find((item) => item.id === actorId);
                updateSelectedNode((node) => {
                  if (node.type !== 'line') return node;
                  return {
                    ...node,
                    speaker: actorId,
                    emotion: actor?.emotions?.[0] ?? undefined,
                  };
                });
              }}
            >
              <option value="">Narrator</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name}
                </option>
              ))}
            </Select>
          </FormControl>

          <FormControl>
            <FieldLabel>Emotion</FieldLabel>
            <Select
              size="xs"
              value={selectedNode.emotion ?? ''}
              onChange={(event) =>
                updateSelectedNode((node) => {
                  if (node.type !== 'line') return node;
                  return {
                    ...node,
                    emotion: event.target.value || undefined,
                  };
                })
              }
            >
              <option value="">None</option>
              {(actors.find((actor) => actor.id === selectedNode.speaker)?.emotions ?? []).map(
                (emotion) => (
                  <option key={emotion} value={emotion}>
                    {emotion}
                  </option>
                ),
              )}
            </Select>
          </FormControl>

          <FormControl>
            <FieldLabel>Message Key</FieldLabel>
            <Input
              size="xs"
              value={selectedNode.msgKey}
              onChange={(event) =>
                updateSelectedNode((node) => {
                  if (node.type !== 'line') return node;
                  return { ...node, msgKey: event.target.value };
                })
              }
            />
            {duplicateMsgKeys.has(selectedNode.msgKey.trim()) && selectedNode.msgKey.trim() && (
              <Text fontSize="10px" color="orange.300" mt={1}>
                Duplicate msgKey in this dialogue.
              </Text>
            )}
          </FormControl>

          <FormControl>
            <FieldLabel>Text</FieldLabel>
            <Textarea
              minH="110px"
              value={selectedNode.text}
              onChange={(event) =>
                updateSelectedNode((node) => {
                  if (node.type !== 'line') return node;
                  return { ...node, text: event.target.value };
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
      )}

      {selectedDialogue && selectedNode?.type === 'choice' && (
        <VStack align="stretch" spacing={3}>
          <Badge colorScheme="purple" w="fit-content">
            choice
          </Badge>

          <NodeIdField
            key={selectedNode.id}
            id={selectedNode.id}
            nodes={selectedDialogue.nodes}
            onRename={(newId) => renameNode(selectedNode.id, newId)}
          />

          {selectedNode.options.map((option, index) => {
            const currentBranchId = `${selectedNode.id}:${option.id}`;
            return (
              <Box
                key={option.id}
                p={2}
                border="1px"
                borderColor="whiteAlpha.200"
                borderRadius="md"
              >
                <HStack justify="space-between" mb={2}>
                  <Text fontSize="11px" color="gray.200">
                    Option {index + 1}
                  </Text>
                  <HStack spacing={1}>
                    <IconButton
                      aria-label="Move option up"
                      size="xs"
                      icon={<Text fontSize="10px">^</Text>}
                      onClick={() => moveChoiceOption(selectedNode, index, -1)}
                    />
                    <IconButton
                      aria-label="Move option down"
                      size="xs"
                      icon={<Text fontSize="10px">v</Text>}
                      onClick={() => moveChoiceOption(selectedNode, index, 1)}
                    />
                    <IconButton
                      aria-label="Delete option"
                      size="xs"
                      colorScheme="red"
                      icon={<DeleteIcon fontSize="10px" />}
                      onClick={() => {
                        updateDialogue(selectedDialogue.id, (dialogue) => ({
                          ...dialogue,
                          nodes: dialogue.nodes.map((node) => {
                            if (node.id !== selectedNode.id || node.type !== 'choice') return node;
                            if (node.options.length <= 1) return node;
                            return {
                              ...node,
                              options: node.options.filter((item) => item.id !== option.id),
                            };
                          }),
                        }));
                      }}
                    />
                  </HStack>
                </HStack>

                <VStack align="stretch" spacing={2}>
                  <Input
                    size="xs"
                    value={option.text}
                    onChange={(event) =>
                      updateChoiceOption(selectedNode.id, option.id, (item) => ({
                        ...item,
                        text: event.target.value,
                      }))
                    }
                    placeholder="Option text"
                  />

                  <Input
                    size="xs"
                    value={option.msgKey}
                    onChange={(event) =>
                      updateChoiceOption(selectedNode.id, option.id, (item) => ({
                        ...item,
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
                      updateChoiceOption(selectedNode.id, option.id, (item) => ({
                        ...item,
                        condition: event.target.value || null,
                      }))
                    }
                    placeholder="condition (optional Lua)"
                  />

                  <Select
                    size="xs"
                    value={option.targetNodeId}
                    onChange={(event) => {
                      const targetNodeId = event.target.value;
                      updateChoiceOption(selectedNode.id, option.id, (item) => ({
                        ...item,
                        targetNodeId,
                      }));

                      updateDialogue(selectedDialogue.id, (dialogue) => ({
                        ...dialogue,
                        nodes: assignBranchMetaToNode(dialogue.nodes, targetNodeId, {
                          branchId: currentBranchId,
                          parentChoiceNodeId: selectedNode.id,
                          parentOptionId: option.id,
                          branchOrder: index,
                        }),
                      }));
                    }}
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
            );
          })}

          <Button
            size="xs"
            leftIcon={<AddIcon />}
            onClick={() => {
              updateDialogue(selectedDialogue.id, (dialogue) => ({
                ...dialogue,
                nodes: dialogue.nodes.map((node) => {
                  if (node.id !== selectedNode.id || node.type !== 'choice') return node;
                  const id = nextOptionId(node.options);
                  return {
                    ...node,
                    options: [
                      ...node.options,
                      {
                        id,
                        text: `Option ${node.options.length + 1}`,
                        msgKey: suggestMsgKey(
                          dialogue.id,
                          dialogue.nodes,
                          `c${node.options.length + 1}`,
                        ),
                        condition: null,
                        targetNodeId: '',
                      },
                    ],
                  };
                }),
              }));
            }}
          >
            Add option
          </Button>

          <Button size="xs" colorScheme="red" variant="outline" onClick={removeSelectedNode}>
            Delete Node
          </Button>
        </VStack>
      )}

      {selectedDialogue && selectedNode?.type === 'action' && (
        <VStack align="stretch" spacing={3}>
          <Badge colorScheme="green" w="fit-content">
            action
          </Badge>

          <NodeIdField
            key={selectedNode.id}
            id={selectedNode.id}
            nodes={selectedDialogue.nodes}
            onRename={(newId) => renameNode(selectedNode.id, newId)}
          />

          <FormControl>
            <FieldLabel>Lua Script</FieldLabel>
            <Box border="1px" borderColor="editorInlineBorder" borderRadius="md" overflow="hidden">
              <LuaScriptEditor
                value={selectedNode.lua}
                height="220px"
                onChange={(value) =>
                  updateSelectedNode((node) => {
                    if (node.type !== 'action') return node;
                    return { ...node, lua: value };
                  })
                }
                gameVariables={gameVariables}
                scriptTables={scriptTables}
                scriptFunctions={scriptFunctions}
                scriptNamespaces={scriptNamespaces}
                activeContextType={activeContextType}
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

          <Button size="xs" colorScheme="red" variant="outline" onClick={removeSelectedNode}>
            Delete Node
          </Button>
        </VStack>
      )}

      {selectedDialogue && selectedNode?.type === 'jump' && (
        <VStack align="stretch" spacing={3}>
          <Badge colorScheme="yellow" w="fit-content">
            jump
          </Badge>

          <NodeIdField
            key={selectedNode.id}
            id={selectedNode.id}
            nodes={selectedDialogue.nodes}
            onRename={(newId) => renameNode(selectedNode.id, newId)}
          />

          <FormControl>
            <FieldLabel>Target Dialogue</FieldLabel>
            <Select
              size="xs"
              value={selectedNode.targetDialogueId ?? ''}
              onChange={(event) =>
                updateSelectedNode((node) => {
                  if (node.type !== 'jump') return node;
                  return {
                    ...node,
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
              value={selectedNode.targetNodeId}
              onChange={(event) =>
                updateSelectedNode((node) => {
                  if (node.type !== 'jump') return node;
                  return {
                    ...node,
                    targetNodeId: event.target.value,
                  };
                })
              }
            >
              <option value="">Select target node</option>
              {(dialogues.get(selectedNode.targetDialogueId || selectedDialogue.id)?.nodes ?? [])
                .filter((node) => node.type !== 'comment')
                .map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.id}
                  </option>
                ))}
            </Select>
          </FormControl>

          <Button size="xs" colorScheme="red" variant="outline" onClick={removeSelectedNode}>
            Delete Node
          </Button>
        </VStack>
      )}

      {selectedDialogue && selectedNode?.type === 'comment' && (
        <VStack align="stretch" spacing={3}>
          <Badge colorScheme="gray" w="fit-content">
            comment (editor-only)
          </Badge>

          <NodeIdField
            key={selectedNode.id}
            id={selectedNode.id}
            nodes={selectedDialogue.nodes}
            onRename={(newId) => renameNode(selectedNode.id, newId)}
          />

          <Textarea
            minH="120px"
            value={selectedNode.text}
            onChange={(event) =>
              updateSelectedNode((node) => {
                if (node.type !== 'comment') return node;
                return { ...node, text: event.target.value };
              })
            }
          />
          <Button size="xs" colorScheme="red" variant="outline" onClick={removeSelectedNode}>
            Delete Node
          </Button>
        </VStack>
      )}

      {selectedDialogue && selectedNode?.type === 'end' && (
        <VStack align="stretch" spacing={3}>
          <Badge colorScheme="red" w="fit-content">
            end
          </Badge>

          <NodeIdField
            key={selectedNode.id}
            id={selectedNode.id}
            nodes={selectedDialogue.nodes}
            onRename={(newId) => renameNode(selectedNode.id, newId)}
          />

          <Text fontSize="11px" color="gray.500">
            Ends the dialogue immediately. Useful for terminating a choice branch early.
          </Text>

          <Button size="xs" colorScheme="red" variant="outline" onClick={removeSelectedNode}>
            Delete Node
          </Button>
        </VStack>
      )}
    </InspectorPanel>
  );
};
