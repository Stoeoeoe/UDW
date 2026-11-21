import type { BuildingKit } from '../types/building';
import { useEditorStore } from './useEditorStore';
import { sheetsOf, useResolvedKitsStore } from './useResolvedKitsStore';

const sameSheets = (a: string[] | undefined, b: string[]) =>
  !!a && a.length === b.length && a.every((path, i) => path === b[i]);

/**
 * Keeps resolved kits in step with the kits in the editor and with their sheet files on disk. Returns the cleanup, for
 * a React effect.
 */
export function watchBuildingKits(): () => void {
  const sync = (kits: BuildingKit[]) => {
    const resolved = useResolvedKitsStore.getState();
    for (const kit of kits)
      if (!sameSheets(resolved.sources[kit.id], sheetsOf(kit))) void resolved.resolve(kit);
    const ids = new Set(kits.map((kit) => kit.id));
    const stale = Object.keys(resolved.kits).filter((id) => !ids.has(id));
    if (stale.length)
      useResolvedKitsStore.setState((state) => ({
        kits: Object.fromEntries(Object.entries(state.kits).filter(([id]) => ids.has(id))),
        sources: Object.fromEntries(Object.entries(state.sources).filter(([id]) => ids.has(id))),
      }));
  };
  sync(useEditorStore.getState().buildingKits);
  const unsubscribe = useEditorStore.subscribe((state, previous) => {
    if (state.projectPath !== previous.projectPath) useResolvedKitsStore.getState().reset();
    if (state.buildingKits !== previous.buildingKits) sync(state.buildingKits);
  });

  if (!('ipcRenderer' in window)) return unsubscribe;
  const onAssetChanged = (_event: unknown, payload: { relativePath: string }) => {
    for (const kit of useEditorStore.getState().buildingKits)
      if (sheetsOf(kit).includes(payload.relativePath))
        void useResolvedKitsStore.getState().resolve(kit);
  };
  window.ipcRenderer.on('app:asset-changed', onAssetChanged);
  return () => {
    unsubscribe();
    window.ipcRenderer.off('app:asset-changed', onAssetChanged);
  };
}
