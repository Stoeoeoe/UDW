import React from 'react';
import { InspectorEmptyState, InspectorPanel } from '../common';
import { ActionLuaValidation } from './dialogueUtils';
import {
  DialogueActionInspectorSection,
  DialogueChoiceInspectorSection,
  DialogueCommentInspectorSection,
  DialogueEndInspectorSection,
  DialogueJumpInspectorSection,
  DialogueLineInspectorSection,
} from './DialogueNodeInspectorSections';
import {
  Character,
  DialogueChoiceNode,
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
  characters: Character[];
  gameVariables: GameVariable[];
  scriptTables: ScriptTable[];
  scriptFunctions: ScriptFunction[];
  scriptNamespaces: ScriptNamespace[];
  activeContextType: ScriptContextType | undefined;
  duplicateMsgKeys: Set<string>;
  dialogueNodeTargets: string[];
  dialogues: Map<string, DialogueDocument>;
  actionLuaValidation: ActionLuaValidation | null;
  updateSelectedNode: (updater: (node: DialogueNode) => DialogueNode) => void;
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
  renameNode: (oldId: string, newId: string) => void;
  removeSelectedNode: () => void;
}

export const DialogueNodeInspector: React.FC<DialogueNodeInspectorProps> = ({
  selectedDialogue,
  selectedNode,
  characters,
  gameVariables,
  scriptTables,
  scriptFunctions,
  scriptNamespaces,
  activeContextType,
  duplicateMsgKeys,
  dialogueNodeTargets,
  dialogues,
  actionLuaValidation,
  updateSelectedNode,
  updateChoiceOption,
  moveChoiceOption,
  removeChoiceOption,
  addChoiceOption,
  setChoiceOptionTarget,
  renameNode,
  removeSelectedNode,
}) => {
  return (
    <InspectorPanel
      title={selectedDialogue?.name || 'Dialogue'}
      subtitle={selectedDialogue ? selectedDialogue.id : undefined}
      emptyState={
        <InspectorEmptyState
          message="No node selected"
          hint={
            selectedDialogue
              ? 'Select a node from the timeline'
              : 'Open a dialogue from the explorer'
          }
        />
      }
    >
      {selectedDialogue && selectedNode?.type === 'line' && (
        <DialogueLineInspectorSection
          selectedDialogue={selectedDialogue}
          node={selectedNode}
          characters={characters}
          duplicateMsgKeys={duplicateMsgKeys}
          updateSelectedNode={updateSelectedNode}
          renameNode={renameNode}
          removeSelectedNode={removeSelectedNode}
        />
      )}

      {selectedDialogue && selectedNode?.type === 'choice' && (
        <DialogueChoiceInspectorSection
          selectedDialogue={selectedDialogue}
          node={selectedNode}
          duplicateMsgKeys={duplicateMsgKeys}
          dialogueNodeTargets={dialogueNodeTargets}
          updateChoiceOption={updateChoiceOption}
          moveChoiceOption={moveChoiceOption}
          removeChoiceOption={removeChoiceOption}
          addChoiceOption={addChoiceOption}
          setChoiceOptionTarget={setChoiceOptionTarget}
          renameNode={renameNode}
          removeSelectedNode={removeSelectedNode}
        />
      )}

      {selectedDialogue && selectedNode?.type === 'action' && (
        <DialogueActionInspectorSection
          selectedDialogue={selectedDialogue}
          node={selectedNode}
          gameVariables={gameVariables}
          scriptTables={scriptTables}
          scriptFunctions={scriptFunctions}
          scriptNamespaces={scriptNamespaces}
          activeContextType={activeContextType}
          actionLuaValidation={actionLuaValidation}
          updateSelectedNode={updateSelectedNode}
          renameNode={renameNode}
          removeSelectedNode={removeSelectedNode}
        />
      )}

      {selectedDialogue && selectedNode?.type === 'jump' && (
        <DialogueJumpInspectorSection
          selectedDialogue={selectedDialogue}
          node={selectedNode}
          dialogues={dialogues}
          updateSelectedNode={updateSelectedNode}
          renameNode={renameNode}
          removeSelectedNode={removeSelectedNode}
        />
      )}

      {selectedDialogue && selectedNode?.type === 'comment' && (
        <DialogueCommentInspectorSection
          selectedDialogue={selectedDialogue}
          node={selectedNode}
          updateSelectedNode={updateSelectedNode}
          renameNode={renameNode}
          removeSelectedNode={removeSelectedNode}
        />
      )}

      {selectedDialogue && selectedNode?.type === 'end' && (
        <DialogueEndInspectorSection
          selectedDialogue={selectedDialogue}
          node={selectedNode}
          renameNode={renameNode}
          removeSelectedNode={removeSelectedNode}
        />
      )}
    </InspectorPanel>
  );
};
