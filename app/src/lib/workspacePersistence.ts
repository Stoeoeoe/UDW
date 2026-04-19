import { getWorkspaceTabId } from '../store/useWorkspaceStore';
import { WorkspaceProjectSnapshot, WorkspaceTab } from '../types/workspace';
import { documentFromHash, documentToHash } from './workspaceRouting';

interface PersistedWorkspaceSession {
  version: 1;
  tabHashes: string[];
  activeHash: string | null;
  expandedNodeIds: string[];
}

interface RestoredWorkspaceSession {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  expandedNodeIds: string[];
}

const STORAGE_PREFIX = 'vulcanus.workspaceSession:';

function getStorageKey(projectPath: string): string {
  return `${STORAGE_PREFIX}${projectPath}`;
}

export function persistWorkspaceSession(
  projectPath: string,
  state: {
    tabs: WorkspaceTab[];
    activeTabId: string | null;
    expandedNodeIds: string[];
  },
): void {
  if (typeof window === 'undefined') return;

  try {
    const persistedTabs = state.tabs.filter((tab) => !tab.isPreview);
    const activeTab = persistedTabs.find((tab) => tab.id === state.activeTabId) ?? null;
    const payload: PersistedWorkspaceSession = {
      version: 1,
      tabHashes: persistedTabs.map((tab) => documentToHash(tab.document)),
      activeHash: activeTab ? documentToHash(activeTab.document) : null,
      expandedNodeIds: state.expandedNodeIds,
    };

    window.sessionStorage.setItem(getStorageKey(projectPath), JSON.stringify(payload));
  } catch {
    // Ignore session storage failures.
  }
}

export function restoreWorkspaceSession(
  projectPath: string,
  snapshot: WorkspaceProjectSnapshot,
): RestoredWorkspaceSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(getStorageKey(projectPath));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedWorkspaceSession>;
    if (parsed.version !== 1 || !Array.isArray(parsed.tabHashes)) return null;

    const seen = new Set<string>();
    const tabs: WorkspaceTab[] = parsed.tabHashes
      .map((hash) => documentFromHash(hash, snapshot))
      .filter((document): document is NonNullable<typeof document> => document !== null)
      .map((document) => ({
        id: getWorkspaceTabId(document),
        document,
      }))
      .filter((tab) => {
        if (seen.has(tab.id)) return false;
        seen.add(tab.id);
        return true;
      });

    const activeDocument =
      typeof parsed.activeHash === 'string' ? documentFromHash(parsed.activeHash, snapshot) : null;
    const activeTabId = activeDocument ? getWorkspaceTabId(activeDocument) : (tabs[0]?.id ?? null);

    return {
      tabs,
      activeTabId: tabs.some((tab) => tab.id === activeTabId) ? activeTabId : (tabs[0]?.id ?? null),
      expandedNodeIds: Array.isArray(parsed.expandedNodeIds)
        ? parsed.expandedNodeIds.filter((nodeId): nodeId is string => typeof nodeId === 'string')
        : [],
    };
  } catch {
    return null;
  }
}
