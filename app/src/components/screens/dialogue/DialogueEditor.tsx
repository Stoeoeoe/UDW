import React from 'react';
import { Badge, Box, Flex, HStack, Text, VStack } from '@chakra-ui/react';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { DialogueNodeInspector } from './DialogueNodeInspector';
import { DialogueTimeline } from './DialogueTimeline';
import { useDialogueEditorController } from './useDialogueEditorController';

export const DialogueEditor: React.FC = () => {
  const controller = useDialogueEditorController();

  const content = (
    <VStack align="stretch" spacing={0} h="full" bg="editorWorkspaceBg">
      <Flex
        align="center"
        gap={2}
        px={4}
        h="40px"
        bg="editorHeaderBg"
        borderBottom="1px"
        borderColor="whiteAlpha.200"
      >
        <VStack align="start" spacing={0}>
          <Text fontSize="10px" color="gray.500" textTransform="uppercase" letterSpacing="0.12em">
            Dialogues
          </Text>
          <Text fontSize="12px" color="gray.300">
            {controller.selectedDialogue
              ? controller.selectedDialogue.name
              : 'Open a dialogue from the explorer'}
          </Text>
        </VStack>

        <HStack spacing={2} ml="auto">
          {controller.isDirty && <Badge colorScheme="orange">Unsaved</Badge>}
        </HStack>
      </Flex>

      <Box flex={1} minH={0}>
        <DialogueTimeline
          selectedDialogue={controller.selectedDialogue}
          selectedNodeId={controller.selectedNodeId}
          setSelectedNodeId={controller.setSelectedNodeId}
          expandedActionNodeIds={controller.expandedActionNodeIds}
          setExpandedActionNodeIds={controller.setExpandedActionNodeIds}
          isTimelineHeaderCollapsed={controller.isTimelineHeaderCollapsed}
          setIsTimelineHeaderCollapsed={controller.setIsTimelineHeaderCollapsed}
          brokenReferenceNodeIds={controller.brokenReferenceNodeIds}
          duplicateMsgKeys={controller.duplicateMsgKeys}
          sensors={controller.sensors}
          insertNode={controller.insertNode}
          appendTopLevelNode={controller.appendTopLevelNode}
          appendNodeToBranch={controller.appendNodeToBranch}
          removeNode={controller.removeNode}
          handleDragEnd={controller.handleDragEnd}
        />
      </Box>
    </VStack>
  );

  return (
    <ResizableEditorLayout
      header={{
        title: controller.selectedDialogue?.name || 'Dialogues',
        subtitle: controller.selectedDialogue
          ? `${controller.selectedDialogue.id}${controller.isDirty ? ' • unsaved changes' : ''}`
          : `${controller.dialogues.size} dialogue${controller.dialogues.size === 1 ? '' : 's'}`,
      }}
      viewportBackground={false}
      content={content}
      rightPanel={
        <DialogueNodeInspector
          selectedDialogue={controller.selectedDialogue}
          selectedNode={controller.selectedNode}
          characters={controller.characters}
          gameVariables={controller.gameVariables}
          scriptTables={controller.scriptTables}
          scriptFunctions={controller.scriptFunctions}
          scriptNamespaces={controller.scriptNamespaces}
          activeContextType={controller.activeContextType}
          duplicateMsgKeys={controller.duplicateMsgKeys}
          dialogueNodeTargets={controller.dialogueNodeTargets}
          dialogues={controller.dialogues}
          actionLuaValidation={controller.actionLuaValidation}
          updateSelectedNode={controller.updateSelectedNode}
          updateChoiceOption={controller.updateChoiceOption}
          moveChoiceOption={controller.moveChoiceOption}
          removeChoiceOption={controller.removeChoiceOption}
          addChoiceOption={controller.addChoiceOption}
          setChoiceOptionTarget={controller.setChoiceOptionTarget}
          renameNode={controller.renameNode}
          removeSelectedNode={controller.removeSelectedNode}
        />
      }
      rightPanelDefaultSize={28}
    />
  );
};

export default DialogueEditor;
