import { create } from 'zustand';
import { useSaveStore } from '../lib/saveManager';
import {
  LocationTabSession,
  TilesetTabSession,
  WorkspaceDocument,
  WorkspaceTab,
} from '../types/workspace';

interface WorkspaceStore {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  expandedNodeIds: string[];
  recentResourceKeys: string[];
  locationSessions: Record<string, LocationTabSession>;
  tilesetSessions: Record<string, TilesetTabSession>;
  autosaveEnabled: boolean;

  openDocument: (
    document: WorkspaceDocument,
    options?: {
      preview?: boolean;
      pin?: boolean;
    },
  ) => WorkspaceTab;
  activateTab: (tabId: string | null) => void;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  pinTab: (tabId: string) => void;
  reorderTabs: (draggedTabId: string, targetTabId: string) => void;
  restoreWorkspace: (state: {
    tabs: WorkspaceTab[];
    activeTabId: string | null;
    expandedNodeIds: string[];
  }) => void;
  toggleNode: (nodeId: string) => void;
  setExpanded: (nodeId: string, expanded: boolean) => void;
  markRecentResource: (resourceKey: string) => void;
  setLocationSession: (tabId: string, session: LocationTabSession) => void;
  setTilesetSession: (tabId: string, session: TilesetTabSession) => void;
  setAutosaveEnabled: (enabled: boolean) => void;
  resetWorkspace: () => void;
}

export function getWorkspaceTabId(document: WorkspaceDocument): string {
  switch (document.kind) {
    case 'location':
      return `location:${document.mapId}`;
    case 'tileset':
      return `tileset:${document.tilesetId}`;
    case 'settings':
      return 'settings';
    case 'configuration':
      return 'config';
    case 'entities':
    case 'actors':
    case 'items':
    case 'dialogues':
    case 'scripting':
      return document.kind;
    default:
      return 'tab';
  }
}

function defaultExpandedNodeIds(): string[] {
  return ['group:locations', 'group:tilesets', 'group:game-data'];
}

export function supportsPreviewTab(document: WorkspaceDocument): boolean {
  void document;
  return true;
}

function removeTabSessions(
  locationSessions: Record<string, LocationTabSession>,
  tilesetSessions: Record<string, TilesetTabSession>,
  tabId: string,
): {
  locationSessions: Record<string, LocationTabSession>;
  tilesetSessions: Record<string, TilesetTabSession>;
} {
  const nextLocationSessions = { ...locationSessions };
  const nextTilesetSessions = { ...tilesetSessions };
  delete nextLocationSessions[tabId];
  delete nextTilesetSessions[tabId];
  return {
    locationSessions: nextLocationSessions,
    tilesetSessions: nextTilesetSessions,
  };
}

function readAutosavePreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('vulcanus.autosaveEnabled') === 'true';
  } catch {
    return false;
  }
}

function persistAutosavePreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('vulcanus.autosaveEnabled', enabled ? 'true' : 'false');
  } catch {
    // Ignore local storage failures.
  }
}

function isPreviewTabDirty(tab: WorkspaceTab): boolean {
  return Boolean(useSaveStore.getState().saveUnits[tab.document.saveUnitId]?.dirty);
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  expandedNodeIds: defaultExpandedNodeIds(),
  recentResourceKeys: [],
  locationSessions: {},
  tilesetSessions: {},
  autosaveEnabled: readAutosavePreference(),

  openDocument: (document, options) => {
    const previewRequested = Boolean(options?.preview) && supportsPreviewTab(document);
    const tabId = getWorkspaceTabId(document);
    const existing = get().tabs.find((tab) => tab.id === tabId);

    if (previewRequested) {
      const nextTab = existing
        ? {
            ...existing,
            document,
            isPreview: existing.isPreview,
          }
        : ({
            id: tabId,
            document,
            isPreview: true,
          } satisfies WorkspaceTab);

      set((state) => {
        const previewTab = state.tabs.find((entry) => entry.isPreview);

        if (existing) {
          if (!previewTab || previewTab.id === existing.id) {
            return {
              tabs: state.tabs.map((tab) => (tab.id === tabId ? nextTab : tab)),
              activeTabId: existing.id,
            };
          }

          if (isPreviewTabDirty(previewTab)) {
            return {
              tabs: state.tabs.map((entry) =>
                entry.id === previewTab.id ? { ...entry, isPreview: false } : entry,
              ),
              activeTabId: existing.id,
            };
          }

          const { locationSessions, tilesetSessions } = removeTabSessions(
            state.locationSessions,
            state.tilesetSessions,
            previewTab.id,
          );

          return {
            tabs: state.tabs
              .filter((entry) => entry.id !== previewTab.id)
              .map((entry) => (entry.id === tabId ? nextTab : entry)),
            activeTabId: existing.id,
            locationSessions,
            tilesetSessions,
          };
        }

        if (!previewTab) {
          return {
            tabs: [...state.tabs, nextTab],
            activeTabId: nextTab.id,
          };
        }

        if (isPreviewTabDirty(previewTab)) {
          return {
            tabs: [
              ...state.tabs.map((entry) =>
                entry.id === previewTab.id ? { ...entry, isPreview: false } : entry,
              ),
              nextTab,
            ],
            activeTabId: nextTab.id,
          };
        }

        const { locationSessions, tilesetSessions } = removeTabSessions(
          state.locationSessions,
          state.tilesetSessions,
          previewTab.id,
        );

        return {
          tabs: state.tabs.map((entry) => (entry.id === previewTab.id ? nextTab : entry)),
          activeTabId: nextTab.id,
          locationSessions,
          tilesetSessions,
        };
      });

      return nextTab;
    }

    if (existing) {
      const nextTab = {
        ...existing,
        document,
        isPreview: options?.pin ? false : existing.isPreview,
      };
      set((state) => ({
        tabs: state.tabs.map((tab) => (tab.id === tabId ? nextTab : tab)),
        activeTabId: existing.id,
      }));
      return nextTab;
    }

    const tab: WorkspaceTab = {
      id: tabId,
      document,
      isPreview: previewRequested,
    };

    set((state) => {
      return {
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
      };
    });

    return tab;
  },

  activateTab: (tabId) => set({ activeTabId: tabId }),

  closeTab: (tabId) =>
    set((state) => {
      const nextTabs = state.tabs.filter((tab) => tab.id !== tabId);
      const nextActiveId =
        state.activeTabId === tabId
          ? (nextTabs[nextTabs.length - 1]?.id ?? null)
          : state.activeTabId;
      const nextLocationSessions = { ...state.locationSessions };
      const nextTilesetSessions = { ...state.tilesetSessions };
      delete nextLocationSessions[tabId];
      delete nextTilesetSessions[tabId];

      return {
        tabs: nextTabs,
        activeTabId: nextActiveId,
        locationSessions: nextLocationSessions,
        tilesetSessions: nextTilesetSessions,
      };
    }),

  closeOtherTabs: (tabId) =>
    set((state) => {
      const keep = state.tabs.find((tab) => tab.id === tabId);
      if (!keep) return state;
      const nextLocationSessions = state.locationSessions[tabId]
        ? { [tabId]: state.locationSessions[tabId] }
        : {};
      const nextTilesetSessions = state.tilesetSessions[tabId]
        ? { [tabId]: state.tilesetSessions[tabId] }
        : {};

      return {
        tabs: [keep],
        activeTabId: tabId,
        locationSessions: nextLocationSessions,
        tilesetSessions: nextTilesetSessions,
      };
    }),

  pinTab: (tabId) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, isPreview: false } : tab)),
    })),

  reorderTabs: (draggedTabId, targetTabId) =>
    set((state) => {
      if (draggedTabId === targetTabId) return state;
      const draggedIndex = state.tabs.findIndex((tab) => tab.id === draggedTabId);
      const targetIndex = state.tabs.findIndex((tab) => tab.id === targetTabId);
      if (draggedIndex === -1 || targetIndex === -1) return state;

      const nextTabs = state.tabs.slice();
      const [draggedTab] = nextTabs.splice(draggedIndex, 1);
      nextTabs.splice(targetIndex, 0, draggedTab);

      return {
        tabs: nextTabs,
      };
    }),

  restoreWorkspace: ({ tabs, activeTabId, expandedNodeIds }) =>
    set(() => ({
      tabs: tabs.map((tab) => ({ ...tab, isPreview: false })),
      activeTabId: tabs.some((tab) => tab.id === activeTabId) ? activeTabId : (tabs[0]?.id ?? null),
      expandedNodeIds:
        expandedNodeIds.length > 0
          ? Array.from(new Set([...defaultExpandedNodeIds(), ...expandedNodeIds]))
          : defaultExpandedNodeIds(),
      locationSessions: {},
      tilesetSessions: {},
    })),

  toggleNode: (nodeId) =>
    set((state) => {
      const expanded = state.expandedNodeIds.includes(nodeId);
      return {
        expandedNodeIds: expanded
          ? state.expandedNodeIds.filter((id) => id !== nodeId)
          : [...state.expandedNodeIds, nodeId],
      };
    }),

  setExpanded: (nodeId, expanded) =>
    set((state) => {
      const has = state.expandedNodeIds.includes(nodeId);
      if (expanded && has) return state;
      if (!expanded && !has) return state;
      return {
        expandedNodeIds: expanded
          ? [...state.expandedNodeIds, nodeId]
          : state.expandedNodeIds.filter((id) => id !== nodeId),
      };
    }),

  markRecentResource: (resourceKey) =>
    set((state) => ({
      recentResourceKeys: [
        resourceKey,
        ...state.recentResourceKeys.filter((entry) => entry !== resourceKey),
      ].slice(0, 8),
    })),

  setLocationSession: (tabId, session) =>
    set((state) => ({
      locationSessions: {
        ...state.locationSessions,
        [tabId]: session,
      },
    })),

  setTilesetSession: (tabId, session) =>
    set((state) => ({
      tilesetSessions: {
        ...state.tilesetSessions,
        [tabId]: session,
      },
    })),

  setAutosaveEnabled: (enabled) => {
    persistAutosavePreference(enabled);
    set({ autosaveEnabled: enabled });
  },

  resetWorkspace: () =>
    set({
      tabs: [],
      activeTabId: null,
      expandedNodeIds: defaultExpandedNodeIds(),
      recentResourceKeys: [],
      locationSessions: {},
      tilesetSessions: {},
    }),
}));
