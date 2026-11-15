import React from 'react';
import { Box, VStack } from '@chakra-ui/react';
import { ResizableEditorLayout } from '../common/ResizableEditorLayout';
import { DialogueNodeInspector } from './DialogueNodeInspector';
import { DialogueTimeline } from './DialogueTimeline';
import { useDialogueEditorController } from './useDialogueEditorController';

export const DialogueEditor: React.FC = () => {
  const controller = useDialogueEditorController();

  const content = (
    <VStack align="stretch" spacing={0} h="full" bg="editorWorkspaceBg">
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
      viewportBackground={false}
      content={content}
      rightPanel={
        <DialogueNodeInspector
          selectedDialogue={controller.selectedDialogue}
          selectedNode={controller.selectedNode}
          characters={controller.characters}
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
