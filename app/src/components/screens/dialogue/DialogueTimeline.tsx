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
import {
  BRANCH_COLORS,
  branchColor,
  createNodeByType,
  isBranchNode,
  relinkLinearFlow,
  removeNodesWithCleanup,
} from './dialogueUtils';
import {
  DialogueChoiceNode,
  DialogueDocument,
  DialogueNode,
  DialogueNodeType,
} from '../../../types/schema';

interface DialogueTimelineProps {
  selectedDialogue: DialogueDocument | null;
  selectedDialogueId: string | null;
  selectedNodeId: string | null;
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  expandedActionNodeIds: Set<string>;
  setExpandedActionNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  isTimelineHeaderCollapsed: boolean;
  setIsTimelineHeaderCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  brokenReferenceNodeIds: Set<string>;
  duplicateMsgKeys: Set<string>;
  sensors: SensorDescriptor<SensorOptions>[];
  updateDialogue: (id: string, updater: (d: DialogueDocument) => DialogueDocument) => void;
  insertNode: (type: DialogueNodeType, index: number) => void;
  appendNodeToBranch: (
    type: DialogueNodeType,
    choiceNodeId: string,
    optionId: string,
    branchOrder: number,
  ) => void;
  handleDragEnd: (event: DragEndEvent) => void;
}

export const DialogueTimeline: React.FC<DialogueTimelineProps> = ({
  selectedDialogue,
  selectedDialogueId,
  selectedNodeId,
  setSelectedNodeId,
  expandedActionNodeIds,
  setExpandedActionNodeIds,
  isTimelineHeaderCollapsed,
  setIsTimelineHeaderCollapsed,
  brokenReferenceNodeIds,
  duplicateMsgKeys,
  sensors,
  updateDialogue,
  insertNode,
  appendNodeToBranch,
  handleDragEnd,
}) => {
  const appendTopLevelNode = (nodeType: DialogueNodeType) => {
    if (!selectedDialogueId || !selectedDialogue) return;
    updateDialogue(selectedDialogueId, (dialogue) => {
      const created = createNodeByType(nodeType, dialogue, undefined);
      const nextNodes = [...dialogue.nodes, created];
      const relinked = relinkLinearFlow(nextNodes);
      return { ...dialogue, startNodeId: dialogue.startNodeId || created.id, nodes: relinked };
    });
  };

  if (!selectedDialogue) {
    return (
      <Box p={5}>
        <Text color="gray.400">Create a dialogue to start authoring timeline beats.</Text>
      </Box>
    );
  }

  // Build top-level render groups
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
    for (const opt of choiceNode.options) branchMap.set(opt.id, []);
    let inner = i + 1;
    while (inner < selectedDialogue.nodes.length) {
      const child = selectedDialogue.nodes[inner];
      if (child.editor?.parentChoiceNodeId !== choiceNode.id) break;
      const optId = child.editor?.parentOptionId;
      if (optId && branchMap.has(optId))
        branchMap.get(optId)!.push({ node: child, flatIndex: inner });
      inner++;
    }
    groups.push({
      kind: 'choice',
      choiceNode,
      flatIndex: i,
      branches: choiceNode.options.map((opt) => ({
        optionId: opt.id,
        nodes: branchMap.get(opt.id) ?? [],
      })),
    });
    i = inner;
  }

  const groupIds = groups.map((g) => (g.kind === 'single' ? g.node.id : g.choiceNode.id));

  const renderNodeCard = (node: DialogueNode) => {
    const selected = selectedNodeId === node.id;
    const missingMsgKey =
      (node.type === 'line' && (!node.msgKey.trim() || duplicateMsgKeys.has(node.msgKey))) ||
      (node.type === 'choice' && node.options.some((o) => !o.msgKey.trim()));
    const brokenRef = brokenReferenceNodeIds.has(node.id);
    const branchMeta = node.editor;
    const isComment = node.type === 'comment';
    const isJump = node.type === 'jump';
    const isAction = node.type === 'action';
    const isEnd = node.type === 'end';
    const typeColor =
      node.type === 'line'
        ? '#60a5fa'
        : node.type === 'choice'
          ? '#a78bfa'
          : node.type === 'action'
            ? '#34d399'
            : node.type === 'jump'
              ? '#fbbf24'
              : node.type === 'comment'
                ? '#6b7280'
                : '#f87171';
    const cardBg = isComment
      ? '#161618'
      : isAction
        ? '#141a14'
        : isEnd
          ? '#1a1212'
          : isJump
            ? '#1a1a10'
            : '#1e1e28';

    return (
      <Box
        key={node.id}
        role="group"
        onClick={(e) => {
          e.stopPropagation();
          setSelectedNodeId(node.id);
          if (isAction)
            setExpandedActionNodeIds((cur) => {
              const s = new Set(cur);
              s.has(node.id) ? s.delete(node.id) : s.add(node.id);
              return s;
            });
        }}
        border="1px"
        borderStyle={isComment ? 'dashed' : 'solid'}
        borderColor={selected ? '#6c63ff' : isComment ? '#333' : '#2e2e3e'}
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
        opacity={isComment ? 0.75 : 1}
        _hover={{ borderColor: selected ? '#6c63ff' : '#555' }}
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
          <Text fontSize="11px" color="gray.400" fontFamily="mono">
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
            onClick={(e) => {
              e.stopPropagation();
              if (!selectedDialogueId) return;
              updateDialogue(selectedDialogueId, (d) => {
                const ids = new Set<string>([node.id]);
                if (node.type === 'choice')
                  for (const n of d.nodes) {
                    if (n.editor?.parentChoiceNodeId === node.id) ids.add(n.id);
                  }
                return {
                  ...removeNodesWithCleanup(d, ids),
                  nodes: relinkLinearFlow(removeNodesWithCleanup(d, ids).nodes),
                };
              });
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
                  <Text fontSize="9px" color="gray.500" fontFamily="mono" noOfLines={1} ml="auto">
                    {node.msgKey}
                  </Text>
                )}
              </HStack>
            )}
            <Text fontSize="12px" color="gray.200" noOfLines={3} lineHeight="1.5">
              {node.text || (
                <Text as="span" color="gray.600" fontStyle="italic">
                  (empty line)
                </Text>
              )}
            </Text>
          </VStack>
        )}
        {isAction && (
          <Box bg="#0d1a0d" borderRadius="sm" px={2} py={1} fontFamily="mono" fontSize="11px">
            {expandedActionNodeIds.has(node.id) ? (
              <Text color="green.200" whiteSpace="pre-wrap" noOfLines={8}>
                {node.lua || '(empty)'}
              </Text>
            ) : (
              <Text color="green.400" noOfLines={1}>
                {node.lua ? node.lua.split('\n')[0] : '(empty)'}
              </Text>
            )}
          </Box>
        )}
        {isJump &&
          (() => {
            const isExternal = Boolean(node.targetDialogueId);
            const label = isExternal
              ? `${node.targetDialogueId} › ${node.targetNodeId || '?'}`
              : node.targetNodeId || null;
            const canNavigate = !isExternal && !!node.targetNodeId;
            return (
              <Flex align="center" gap={2} mt={1}>
                <Box flex={1} h="1px" bg="#3a3a20" />
                <Box
                  px={3}
                  py={1}
                  border="1px solid #fbbf24"
                  borderRadius="full"
                  bg="#1a1a08"
                  flexShrink={0}
                  cursor={canNavigate ? 'pointer' : 'default'}
                  _hover={canNavigate ? { bg: '#2a2a10' } : {}}
                  onClick={(e) => {
                    if (!canNavigate) return;
                    e.stopPropagation();
                    setSelectedNodeId(node.targetNodeId);
                  }}
                  title={canNavigate ? `Go to ${node.targetNodeId}` : undefined}
                >
                  <Flex align="center" gap={2}>
                    <Text fontSize="11px" color="yellow.300" fontFamily="mono" fontWeight="bold">
                      ⟶
                    </Text>
                    {label ? (
                      <Text fontSize="11px" color="yellow.200" fontFamily="mono">
                        {label}
                      </Text>
                    ) : (
                      <Text fontSize="11px" color="gray.500" fontStyle="italic">
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
                <Box flex={1} h="1px" bg="#3a3a20" />
              </Flex>
            );
          })()}
        {isComment && (
          <Text fontSize="11px" color="gray.500" fontStyle="italic" noOfLines={3}>
            {node.text || '(empty comment)'}
          </Text>
        )}
        {isEnd && (
          <Flex align="center" gap={2}>
            <Box w="full" h="1px" bg="red.900" />
            <Text fontSize="10px" color="red.500" flexShrink={0} fontFamily="mono">
              END
            </Text>
            <Box w="full" h="1px" bg="red.900" />
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
            opacity={0}
            _hover={{ opacity: 1 }}
            fontSize="10px"
            color="gray.500"
          >
            + insert
          </Button>
        }
        onSelect={(type) => insertNode(type, flatIndex)}
      />
    </Box>
  );

  return (
    <VStack align="stretch" spacing={0} h="full" overflow="hidden">
      <Flex
        px={4}
        py={2}
        bg="#141418"
        borderBottom="1px"
        borderColor="whiteAlpha.200"
        align="center"
        gap={2}
        minH="40px"
      >
        <Text fontSize="13px" color="gray.100" fontWeight="semibold" flexShrink={0}>
          {selectedDialogue.name}
        </Text>
        <Badge colorScheme={selectedDialogue.oneShot ? 'purple' : 'green'} flexShrink={0}>
          {selectedDialogue.oneShot ? 'one-shot' : 'repeatable'}
        </Badge>
        {!isTimelineHeaderCollapsed && selectedDialogue.entryCondition?.trim() && (
          <Badge colorScheme="orange" variant="subtle" fontFamily="mono" maxW="160px" isTruncated>
            {selectedDialogue.entryCondition}
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
              const idx = selectedNodeId
                ? Math.max(0, selectedDialogue.nodes.findIndex((n) => n.id === selectedNodeId) + 1)
                : selectedDialogue.nodes.length;
              insertNode(type, idx);
            }}
          />

          <Button
            size="xs"
            variant="ghost"
            color="gray.500"
            onClick={() => setIsTimelineHeaderCollapsed((c) => !c)}
            title={isTimelineHeaderCollapsed ? 'Show metadata' : 'Hide metadata'}
          >
            {isTimelineHeaderCollapsed ? '▸ info' : '▾ info'}
          </Button>
        </HStack>
      </Flex>

      <Box
        flex={1}
        overflowY="auto"
        p={3}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelectedNodeId(null);
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
              const missingMsgKey = choiceNode.options.some((o) => !o.msgKey.trim());

              return (
                <SortableGroupWrapper key={choiceNode.id} id={choiceNode.id}>
                  {renderInsertGap(flatIndex)}
                  <Box
                    role="group"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(choiceNode.id);
                    }}
                    border="1px solid"
                    borderColor={choiceSelected ? '#6c63ff' : '#2e2e3e'}
                    borderLeftWidth="3px"
                    borderLeftColor="#a78bfa"
                    borderRadius="md"
                    bg="#1e1e28"
                    p={3}
                    mb={0}
                    cursor="pointer"
                    _hover={{ borderColor: choiceSelected ? '#6c63ff' : '#555' }}
                  >
                    <Flex align="center" gap={2} mb={1}>
                      <Text
                        fontSize="9px"
                        fontWeight="bold"
                        textTransform="uppercase"
                        letterSpacing="0.1em"
                        color="#a78bfa"
                        flexShrink={0}
                      >
                        choice
                      </Text>
                      <Text fontSize="11px" color="gray.400" fontFamily="mono">
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
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!selectedDialogueId) return;
                          updateDialogue(selectedDialogueId, (d) => {
                            const ids = new Set<string>([choiceNode.id]);
                            for (const n of d.nodes) {
                              if (n.editor?.parentChoiceNodeId === choiceNode.id) ids.add(n.id);
                            }
                            const c = removeNodesWithCleanup(d, ids);
                            return { ...c, nodes: relinkLinearFlow(c.nodes) };
                          });
                          setSelectedNodeId(null);
                        }}
                      />
                    </Flex>
                    <Flex gap={2}>
                      {choiceNode.options.map((opt, optIdx) => {
                        const col = BRANCH_COLORS[optIdx % BRANCH_COLORS.length];
                        return (
                          <Box
                            key={opt.id}
                            flex={1}
                            minW={0}
                            borderTop="2px solid"
                            borderColor={col}
                            pt={1}
                          >
                            <Text fontSize="11px" color="gray.200" noOfLines={1}>
                              {opt.text || (
                                <Text as="span" color="gray.600" fontStyle="italic">
                                  (empty)
                                </Text>
                              )}
                            </Text>
                            {opt.condition?.trim() && (
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
                    {branches.map((branch, bIdx) => {
                      const col = BRANCH_COLORS[bIdx % BRANCH_COLORS.length];
                      const opt = choiceNode.options[bIdx];
                      return (
                        <Box
                          key={branch.optionId}
                          flex={1}
                          minW={0}
                          borderLeft="2px solid"
                          borderColor={col}
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
                                color="gray.600"
                                borderColor={col}
                                borderWidth="1px"
                                borderStyle="dashed"
                                borderRadius="sm"
                                _hover={{ color: 'gray.300', opacity: 1 }}
                                opacity={0.5}
                              >
                                + append
                              </Button>
                            }
                            onSelect={(type) =>
                              appendNodeToBranch(type, choiceNode.id, opt.id, bIdx)
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
                color="gray.500"
                borderColor="whiteAlpha.200"
                borderStyle="dashed"
                _hover={{ color: 'gray.200', borderColor: 'whiteAlpha.400' }}
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
