import React from 'react';
import { Badge, Box, Button, Flex, HStack, IconButton, Text, VStack } from '@chakra-ui/react';
import { AddIcon, DeleteIcon, WarningIcon } from '@chakra-ui/icons';
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  SensorDescriptor,
  SensorOptions,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { NodeTypeMenu, SortableGroupWrapper } from './DialogueNodeWidgets';
import { BRANCH_COLORS, branchColor, isBranchNode } from './dialogueUtils';
import {
  DialogueChoiceNode,
  DialogueDocument,
  DialogueNode,
  DialogueNodeType,
} from '../../../types/schema';

interface DialogueTimelineProps {
  selectedDialogue: DialogueDocument | null;
  selectedNodeId: string | null;
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  expandedActionNodeIds: Set<string>;
  setExpandedActionNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  isTimelineHeaderCollapsed: boolean;
  setIsTimelineHeaderCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  brokenReferenceNodeIds: Set<string>;
  duplicateMsgKeys: Set<string>;
  sensors: SensorDescriptor<SensorOptions>[];
  insertNode: (type: DialogueNodeType, index: number) => void;
  appendTopLevelNode: (type: DialogueNodeType) => void;
  appendNodeToBranch: (
    type: DialogueNodeType,
    choiceNodeId: string,
    optionId: string,
    branchOrder: number,
  ) => void;
  removeNode: (nodeId: string) => void;
  handleDragEnd: (event: DragEndEvent) => void;
}

const DIALOGUE_SURFACES = {
  defaultBg: '#242a34',
  defaultBorder: '#3b4658',
  defaultHoverBorder: '#556277',
  selectedBorder: '#63b3ed',
  commentBg: '#20252d',
  commentBorder: '#4a5360',
  actionBg: '#173024',
  actionInnerBg: '#102218',
  jumpBg: '#2a2618',
  jumpLine: '#5c5431',
  jumpChipBg: '#171406',
  endBg: '#2d1b20',
  endLine: '#6b2734',
  choiceBg: '#252c37',
  appendBg: '#202631',
};

export const DialogueTimeline: React.FC<DialogueTimelineProps> = ({
  selectedDialogue,
  selectedNodeId,
  setSelectedNodeId,
  expandedActionNodeIds,
  setExpandedActionNodeIds,
  isTimelineHeaderCollapsed,
  setIsTimelineHeaderCollapsed,
  brokenReferenceNodeIds,
  duplicateMsgKeys,
  sensors,
  insertNode,
  appendTopLevelNode,
  appendNodeToBranch,
  removeNode,
  handleDragEnd,
}) => {
  if (!selectedDialogue) {
    return (
      <Box p={5}>
        <Text color="gray.400">Create a dialogue to start authoring timeline beats.</Text>
      </Box>
    );
  }

  type RenderGroup =
    | { kind: 'single'; node: DialogueNode; flatIndex: number }
    | {
        kind: 'choice';
        choiceNode: DialogueChoiceNode;
        flatIndex: number;
        branches: Array<{
          optionId: string;
          nodes: Array<{ node: DialogueNode; flatIndex: number }>;
        }>;
      };

  const groups: RenderGroup[] = [];
  let i = 0;
  while (i < selectedDialogue.nodes.length) {
    const node = selectedDialogue.nodes[i];
    if (isBranchNode(node)) {
      i++;
      continue;
    }
    if (node.type !== 'choice') {
      groups.push({ kind: 'single', node, flatIndex: i });
      i++;
      continue;
    }

    const choiceNode = node as DialogueChoiceNode;
    const branchMap = new Map<string, Array<{ node: DialogueNode; flatIndex: number }>>();
    for (const option of choiceNode.options) branchMap.set(option.id, []);

    let inner = i + 1;
    while (inner < selectedDialogue.nodes.length) {
      const child = selectedDialogue.nodes[inner];
      if (child.editor?.parentChoiceNodeId !== choiceNode.id) break;
      const optionId = child.editor?.parentOptionId;
      if (optionId && branchMap.has(optionId)) {
        branchMap.get(optionId)!.push({ node: child, flatIndex: inner });
      }
      inner++;
    }

    groups.push({
      kind: 'choice',
      choiceNode,
      flatIndex: i,
      branches: choiceNode.options.map((option) => ({
        optionId: option.id,
        nodes: branchMap.get(option.id) ?? [],
      })),
    });
    i = inner;
  }

  const groupIds = groups.map((group) =>
    group.kind === 'single' ? group.node.id : group.choiceNode.id,
  );

  const renderNodeCard = (node: DialogueNode) => {
    const selected = selectedNodeId === node.id;
    const missingMsgKey =
      (node.type === 'line' && (!node.msgKey.trim() || duplicateMsgKeys.has(node.msgKey))) ||
      (node.type === 'choice' && node.options.some((option) => !option.msgKey.trim()));
    const brokenRef = brokenReferenceNodeIds.has(node.id);
    const branchMeta = node.editor;
    const isComment = node.type === 'comment';
    const isJump = node.type === 'jump';
    const isAction = node.type === 'action';
    const isEnd = node.type === 'end';

    const typeColor =
      node.type === 'line'
        ? 'blue.300'
        : node.type === 'choice'
          ? 'purple.300'
          : node.type === 'action'
            ? 'green.300'
            : node.type === 'jump'
              ? 'yellow.300'
              : node.type === 'comment'
                ? 'gray.400'
                : 'red.300';

    const cardBg = isComment
      ? DIALOGUE_SURFACES.commentBg
      : isAction
        ? DIALOGUE_SURFACES.actionBg
        : isEnd
          ? DIALOGUE_SURFACES.endBg
          : isJump
            ? DIALOGUE_SURFACES.jumpBg
            : DIALOGUE_SURFACES.defaultBg;

    return (
      <Box
        key={node.id}
        role="group"
        onClick={(event) => {
          event.stopPropagation();
          setSelectedNodeId(node.id);
          if (isAction) {
            setExpandedActionNodeIds((current) => {
              const next = new Set(current);
              next.has(node.id) ? next.delete(node.id) : next.add(node.id);
              return next;
            });
          }
        }}
        border="1px"
        borderStyle={isComment ? 'dashed' : 'solid'}
        borderColor={
          selected
            ? DIALOGUE_SURFACES.selectedBorder
            : isComment
              ? DIALOGUE_SURFACES.commentBorder
              : DIALOGUE_SURFACES.defaultBorder
        }
        borderLeftWidth={branchMeta?.branchId ? '3px' : isComment ? '0px' : '3px'}
        borderLeftColor={
          branchMeta?.branchId
            ? branchColor(branchMeta.branchOrder)
            : isComment
              ? undefined
              : typeColor
        }
        borderRadius="md"
        bg={cardBg}
        p={isComment ? 2 : 3}
        mb={2}
        cursor="pointer"
        opacity={isComment ? 0.92 : 1}
        boxShadow={selected ? '0 0 0 1px rgba(99, 179, 237, 0.22)' : 'none'}
        _hover={{
          borderColor: selected
            ? DIALOGUE_SURFACES.selectedBorder
            : DIALOGUE_SURFACES.defaultHoverBorder,
        }}
      >
        <Flex align="center" gap={2} mb={isComment ? 1 : 2}>
          <Text
            fontSize="9px"
            fontWeight="bold"
            textTransform="uppercase"
            letterSpacing="0.1em"
            color={typeColor}
            flexShrink={0}
          >
            {node.type}
          </Text>
          <Text fontSize="11px" color="gray.300" fontFamily="mono">
            {node.id}
          </Text>
          {missingMsgKey && <WarningIcon color="orange.300" boxSize="10px" />}
          {brokenRef && (
            <Badge colorScheme="red" fontSize="8px">
              broken ref
            </Badge>
          )}
          <IconButton
            aria-label="Delete node"
            icon={<DeleteIcon fontSize="9px" />}
            size="xs"
            variant="ghost"
            color="gray.600"
            _hover={{ color: 'red.400', bg: 'transparent' }}
            opacity={0}
            _groupHover={{ opacity: 1 }}
            ml="auto"
            h="auto"
            minW="auto"
            p="2px"
            onClick={(event) => {
              event.stopPropagation();
              removeNode(node.id);
              setSelectedNodeId(null);
            }}
          />
        </Flex>

        {node.type === 'line' && (
          <VStack align="stretch" spacing={1}>
            {(node.speaker || node.emotion) && (
              <HStack spacing={2}>
                {node.speaker && (
                  <Badge colorScheme="blue" fontSize="9px">
                    {node.speaker}
                  </Badge>
                )}
                {node.emotion && (
                  <Badge colorScheme="cyan" variant="subtle" fontSize="9px">
                    {node.emotion}
                  </Badge>
                )}
                {!!node.msgKey.trim() && (
                  <Text fontSize="9px" color="gray.400" fontFamily="mono" noOfLines={1} ml="auto">
                    {node.msgKey}
                  </Text>
                )}
              </HStack>
            )}
            <Text fontSize="12px" color="gray.100" noOfLines={3} lineHeight="1.5">
              {node.text || (
                <Text as="span" color="gray.400" fontStyle="italic">
                  (empty line)
                </Text>
              )}
            </Text>
          </VStack>
        )}

        {isAction && (
          <Box
            bg={DIALOGUE_SURFACES.actionInnerBg}
            borderRadius="sm"
            px={2}
            py={1}
            border="1px solid"
            borderColor="green.900"
            fontFamily="mono"
            fontSize="11px"
          >
            {expandedActionNodeIds.has(node.id) ? (
              <Text color="green.100" whiteSpace="pre-wrap" noOfLines={8}>
                {node.lua || '(empty)'}
              </Text>
            ) : (
              <Text color="green.200" noOfLines={1}>
                {node.lua ? node.lua.split('\n')[0] : '(empty)'}
              </Text>
            )}
          </Box>
        )}

        {isJump &&
          (() => {
            const isExternal = Boolean(node.targetDialogueId);
            const label = isExternal
              ? `${node.targetDialogueId} > ${node.targetNodeId || '?'}`
              : node.targetNodeId || null;
            const canNavigate = !isExternal && !!node.targetNodeId;
            return (
              <Flex align="center" gap={2} mt={1}>
                <Box flex={1} h="1px" bg={DIALOGUE_SURFACES.jumpLine} />
                <Box
                  px={3}
                  py={1}
                  border="1px solid"
                  borderColor="yellow.400"
                  borderRadius="full"
                  bg={DIALOGUE_SURFACES.jumpChipBg}
                  flexShrink={0}
                  cursor={canNavigate ? 'pointer' : 'default'}
                  _hover={canNavigate ? { bg: '#26210c' } : {}}
                  onClick={(event) => {
                    if (!canNavigate) return;
                    event.stopPropagation();
                    setSelectedNodeId(node.targetNodeId);
                  }}
                  title={canNavigate ? `Go to ${node.targetNodeId}` : undefined}
                >
                  <Flex align="center" gap={2}>
                    <Text fontSize="11px" color="yellow.300" fontFamily="mono" fontWeight="bold">
                      {'->'}
                    </Text>
                    {label ? (
                      <Text fontSize="11px" color="yellow.100" fontFamily="mono">
                        {label}
                      </Text>
                    ) : (
                      <Text fontSize="11px" color="gray.400" fontStyle="italic">
                        no target
                      </Text>
                    )}
                    {isExternal && (
                      <Badge fontSize="8px" colorScheme="orange" ml={1}>
                        ext
                      </Badge>
                    )}
                  </Flex>
                </Box>
                <Box flex={1} h="1px" bg={DIALOGUE_SURFACES.jumpLine} />
              </Flex>
            );
          })()}

        {isComment && (
          <Text fontSize="11px" color="gray.300" fontStyle="italic" noOfLines={3}>
            {node.text || '(empty comment)'}
          </Text>
        )}

        {isEnd && (
          <Flex align="center" gap={2}>
            <Box w="full" h="1px" bg={DIALOGUE_SURFACES.endLine} />
            <Text fontSize="10px" color="red.300" flexShrink={0} fontFamily="mono">
              END
            </Text>
            <Box w="full" h="1px" bg={DIALOGUE_SURFACES.endLine} />
          </Flex>
        )}
      </Box>
    );
  };

  const renderInsertGap = (flatIndex: number) => (
    <Box key={`gap-${flatIndex}`} py="2px">
      <NodeTypeMenu
        placement="top"
        trigger={
          <Button
            size="xs"
            variant="ghost"
            w="full"
            h="16px"
            opacity={0.28}
            _hover={{ opacity: 1, color: 'gray.100', bg: 'editorHoverBg' }}
            fontSize="10px"
            color="gray.400"
          >
            + insert
          </Button>
        }
        onSelect={(type) => insertNode(type, flatIndex)}
      />
    </Box>
  );

  return (
    <VStack align="stretch" spacing={0} h="full" overflow="hidden" bg="editorWorkspaceBg">
      <Flex
        px={4}
        py={2}
        bg="editorSectionBg"
        borderBottom="1px"
        borderColor="editorShellBorder"
        align="center"
        gap={2}
        minH="40px"
      >
        <Text fontSize="13px" color="gray.50" fontWeight="semibold" flexShrink={0}>
          {selectedDialogue.name}
        </Text>
        <Badge colorScheme={selectedDialogue.oneShot ? 'purple' : 'green'} flexShrink={0}>
          {selectedDialogue.oneShot ? 'one-shot' : 'repeatable'}
        </Badge>
        {!isTimelineHeaderCollapsed && selectedDialogue.dialogueTypeId?.trim() && (
          <Badge colorScheme="cyan" variant="subtle" fontFamily="mono" maxW="160px" isTruncated>
            {selectedDialogue.dialogueTypeId}
          </Badge>
        )}
        {!isTimelineHeaderCollapsed && !!selectedDialogue.tags.length && (
          <Text fontSize="11px" color="gray.500" noOfLines={1} flexShrink={1} minW={0}>
            {selectedDialogue.tags.join(', ')}
          </Text>
        )}

        <HStack spacing={1} ml="auto" flexShrink={0}>
          <NodeTypeMenu
            placement="bottom-end"
            trigger={
              <Button size="xs" variant="outline" leftIcon={<AddIcon fontSize="9px" />}>
                Add Node
              </Button>
            }
            onSelect={(type) => {
              const index = selectedNodeId
                ? Math.max(
                    0,
                    selectedDialogue.nodes.findIndex((node) => node.id === selectedNodeId) + 1,
                  )
                : selectedDialogue.nodes.length;
              insertNode(type, index);
            }}
          />

          <Button
            size="xs"
            variant="ghost"
            color="gray.500"
            onClick={() => setIsTimelineHeaderCollapsed((collapsed) => !collapsed)}
            title={isTimelineHeaderCollapsed ? 'Show metadata' : 'Hide metadata'}
          >
            {isTimelineHeaderCollapsed ? '> info' : 'v info'}
          </Button>
        </HStack>
      </Flex>

      <Box
        flex={1}
        overflowY="auto"
        p={3}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelectedNodeId(null);
        }}
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
            {groups.map((group) => {
              if (group.kind === 'single') {
                return (
                  <SortableGroupWrapper key={group.node.id} id={group.node.id}>
                    {renderInsertGap(group.flatIndex)}
                    {renderNodeCard(group.node)}
                  </SortableGroupWrapper>
                );
              }

              const { choiceNode, flatIndex, branches } = group;
              const choiceSelected = selectedNodeId === choiceNode.id;
              const brokenRef = brokenReferenceNodeIds.has(choiceNode.id);
              const missingMsgKey = choiceNode.options.some((option) => !option.msgKey.trim());

              return (
                <SortableGroupWrapper key={choiceNode.id} id={choiceNode.id}>
                  {renderInsertGap(flatIndex)}
                  <Box
                    role="group"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedNodeId(choiceNode.id);
                    }}
                    border="1px solid"
                    borderColor={
                      choiceSelected
                        ? DIALOGUE_SURFACES.selectedBorder
                        : DIALOGUE_SURFACES.defaultBorder
                    }
                    borderLeftWidth="3px"
                    borderLeftColor="purple.300"
                    borderRadius="md"
                    bg={DIALOGUE_SURFACES.choiceBg}
                    p={3}
                    mb={0}
                    cursor="pointer"
                    boxShadow={choiceSelected ? '0 0 0 1px rgba(99, 179, 237, 0.22)' : 'none'}
                    _hover={{
                      borderColor: choiceSelected
                        ? DIALOGUE_SURFACES.selectedBorder
                        : DIALOGUE_SURFACES.defaultHoverBorder,
                    }}
                  >
                    <Flex align="center" gap={2} mb={1}>
                      <Text
                        fontSize="9px"
                        fontWeight="bold"
                        textTransform="uppercase"
                        letterSpacing="0.1em"
                        color="purple.300"
                        flexShrink={0}
                      >
                        choice
                      </Text>
                      <Text fontSize="11px" color="gray.300" fontFamily="mono">
                        {choiceNode.id}
                      </Text>
                      {missingMsgKey && <WarningIcon color="orange.300" boxSize="10px" />}
                      {brokenRef && (
                        <Badge colorScheme="red" fontSize="8px">
                          broken ref
                        </Badge>
                      )}
                      <IconButton
                        aria-label="Delete node"
                        icon={<DeleteIcon fontSize="9px" />}
                        size="xs"
                        variant="ghost"
                        color="gray.600"
                        _hover={{ color: 'red.400', bg: 'transparent' }}
                        opacity={0}
                        _groupHover={{ opacity: 1 }}
                        ml="auto"
                        h="auto"
                        minW="auto"
                        p="2px"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeNode(choiceNode.id);
                          setSelectedNodeId(null);
                        }}
                      />
                    </Flex>
                    <Flex gap={2}>
                      {choiceNode.options.map((option, optionIndex) => {
                        const color = BRANCH_COLORS[optionIndex % BRANCH_COLORS.length];
                        return (
                          <Box
                            key={option.id}
                            flex={1}
                            minW={0}
                            borderTop="2px solid"
                            borderColor={color}
                            pt={1}
                          >
                            <Text fontSize="11px" color="gray.100" noOfLines={1}>
                              {option.text || (
                                <Text as="span" color="gray.400" fontStyle="italic">
                                  (empty)
                                </Text>
                              )}
                            </Text>
                            {option.condition?.trim() && (
                              <Badge fontSize="8px" colorScheme="yellow" mt="2px">
                                if
                              </Badge>
                            )}
                          </Box>
                        );
                      })}
                    </Flex>
                  </Box>
                  <Flex gap={2} mb={2} align="flex-start">
                    {branches.map((branch, branchIndex) => {
                      const color = BRANCH_COLORS[branchIndex % BRANCH_COLORS.length];
                      const option = choiceNode.options[branchIndex];
                      return (
                        <Box
                          key={branch.optionId}
                          flex={1}
                          minW={0}
                          borderLeft="2px solid"
                          borderColor={color}
                          pl={2}
                          pt={1}
                        >
                          {branch.nodes.map(({ node }) => renderNodeCard(node))}
                          <NodeTypeMenu
                            placement="bottom"
                            trigger={
                              <Button
                                size="xs"
                                variant="ghost"
                                w="full"
                                h="18px"
                                fontSize="9px"
                                color="gray.300"
                                bg={DIALOGUE_SURFACES.appendBg}
                                borderColor={color}
                                borderWidth="1px"
                                borderStyle="dashed"
                                borderRadius="sm"
                                _hover={{
                                  color: 'gray.50',
                                  opacity: 1,
                                  bg: DIALOGUE_SURFACES.choiceBg,
                                }}
                                opacity={0.78}
                              >
                                + append
                              </Button>
                            }
                            onSelect={(type) =>
                              appendNodeToBranch(type, choiceNode.id, option.id, branchIndex)
                            }
                          />
                        </Box>
                      );
                    })}
                  </Flex>
                </SortableGroupWrapper>
              );
            })}
          </SortableContext>
        </DndContext>

        <Box py={1}>
          <NodeTypeMenu
            placement="top"
            trigger={
              <Button
                size="xs"
                variant="outline"
                w="full"
                h="24px"
                fontSize="10px"
                color="gray.300"
                borderColor="whiteAlpha.200"
                borderStyle="dashed"
                _hover={{ color: 'gray.50', borderColor: 'whiteAlpha.400', bg: 'editorHoverBg' }}
              >
                + append node
              </Button>
            }
            onSelect={(type) => appendTopLevelNode(type)}
          />
        </Box>
      </Box>
    </VStack>
  );
};
