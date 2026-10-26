import React from 'react';
import { useToast } from '@chakra-ui/react';
import { useEditorStore } from '../store/useEditorStore';
import { useWorkspaceStore, supportsPreviewTab } from '../store/useWorkspaceStore';
import { ensureDocumentSession } from '../lib/workspaceController';
import { getSaveUnitStatus } from '../lib/saveManager';
import { discardWorkspaceTabChanges } from '../lib/workspaceSaveActions';
import { applyTabSession } from '../lib/workspaceController';
import { WorkspaceDocument, WorkspaceTreeNode } from '../types/workspace';

export function useWorkspaceTabs() {
  const selectedEntityTypeId = useEditorStore((state) => state.selectedEntityTypeId);
  const selectedActorId = useEditorStore((state) => state.selectedActorId);
  const selectedItemId = useEditorStore((state) => state.selectedItemId);
  const selectedDialogueId = useEditorStore((state) => state.selectedDialogueId);

  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const openDocument = useWorkspaceStore((state) => state.openDocument);
  const activateTab = useWorkspaceStore((state) => state.activateTab);
  const closeTab = useWorkspaceStore((state) => state.closeTab);
  const pinTab = useWorkspaceStore((state) => state.pinTab);
  const reorderTabs = useWorkspaceStore((state) => state.reorderTabs);
  const markRecentResource = useWorkspaceStore((state) => state.markRecentResource);

  const toast = useToast();

  const activeTab = React.useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );

  const handleOpenNode = React.useCallback(
    (node: WorkspaceTreeNode, options?: { pin?: boolean }) => {
      if (!node.document) return;
      const tab = openDocument(node.document, {
        preview: !options?.pin && supportsPreviewTab(node.document),
        pin: options?.pin,
      });
      ensureDocumentSession(tab.document, tab.id);
      activateTab(tab.id);
    },
    [activateTab, openDocument],
  );

  const handleOpenDocument = React.useCallback(
    (document: WorkspaceDocument, options?: { pin?: boolean }) => {
      const tab = openDocument(document, {
        preview: !options?.pin && supportsPreviewTab(document),
        pin: options?.pin,
      });
      ensureDocumentSession(tab.document, tab.id);
      activateTab(tab.id);
    },
    [activateTab, openDocument],
  );

  const handleCloseTab = React.useCallback(
    async (tabId: string) => {
      const tab = tabs.find((entry) => entry.id === tabId);
      if (!tab) return;

      const saveUnitStatus = getSaveUnitStatus(tab.document.saveUnitId);
      const relatedOpenTabs = tabs.filter(
        (entry) => entry.id !== tabId && entry.document.saveUnitId === tab.document.saveUnitId,
      );

      if (saveUnitStatus.dirty) {
        const currentActiveTab = tabs.find((entry) => entry.id === activeTabId) ?? null;
        const affectsOtherTabs = relatedOpenTabs.length > 0;
        const confirmed = confirm(
          affectsOtherTabs
            ? `Close "${tab.document.label}" and discard unsaved changes for this resource? This will also revert the content shown in ${relatedOpenTabs.length} other open tab${relatedOpenTabs.length === 1 ? '' : 's'}.`
            : `Close "${tab.document.label}" and discard its unsaved changes? This will throw away your in-memory edits.`,
        );
        if (!confirmed) return;

        try {
          await discardWorkspaceTabChanges(tab);
        } catch (error) {
          toast({
            title: 'Discard failed',
            description: error instanceof Error ? error.message : 'Unknown error',
            status: 'error',
            duration: 4000,
          });
          return;
        }

        if (
          currentActiveTab &&
          currentActiveTab.id !== tabId &&
          currentActiveTab.document.saveUnitId === tab.document.saveUnitId
        ) {
          applyTabSession(currentActiveTab);
        }
      }

      closeTab(tabId);
    },
    [activeTabId, closeTab, tabs, toast],
  );

  React.useEffect(() => {
    if (!activeTab) return;
    const doc = activeTab.document;

    if (doc.kind === 'location') {
      markRecentResource(`location:${doc.mapId}`);
      return;
    }
    if (doc.kind === 'tileset') {
      markRecentResource(`tileset:${doc.tilesetId}`);
      return;
    }
    if (doc.kind === 'actor') {
      markRecentResource(`actor:${doc.actorId}`);
      return;
    }
    if (doc.kind === 'entity') {
      markRecentResource(`entity:${doc.entityTypeId}`);
      return;
    }
    if (doc.kind === 'item') {
      markRecentResource(`item:${doc.itemId}`);
      return;
    }
    if (doc.kind === 'cutscene') {
      markRecentResource(`cutscene:${doc.cutsceneId}`);
      return;
    }
    if (doc.kind === 'dialogue') {
      markRecentResource(`dialogue:${doc.dialogueId}`);
      return;
    }

    if (doc.kind === 'entities' && selectedEntityTypeId) {
      markRecentResource(`entity:${selectedEntityTypeId}`);
      return;
    }
    if (doc.kind === 'actors' && selectedActorId) {
      markRecentResource(`actor:${selectedActorId}`);
      return;
    }
    if (doc.kind === 'items' && selectedItemId) {
      markRecentResource(`item:${selectedItemId}`);
      return;
    }
    if (doc.kind === 'dialogues' && selectedDialogueId) {
      markRecentResource(`dialogue:${selectedDialogueId}`);
    }
  }, [
    activeTab,
    markRecentResource,
    selectedActorId,
    selectedDialogueId,
    selectedEntityTypeId,
    selectedItemId,
  ]);

  return {
    tabs,
    activeTabId,
    activeTab,
    activateTab,
    pinTab,
    reorderTabs,
    handleOpenNode,
    handleOpenDocument,
    handleCloseTab,
  };
}
