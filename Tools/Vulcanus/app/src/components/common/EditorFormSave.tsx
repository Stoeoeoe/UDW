import { useCallback, useEffect, useRef } from 'react';
import { cancelPendingSaveUnit, scheduleSaveUnit, useSaveStore } from '../../lib/saveManager';
import { registerWorkspaceTabSaveOverride } from '../../lib/workspaceSaveActions';

/** Form drafts participate in the same Save, Save All and autosave commands as other documents. */
export function EditorFormSave({
  kind,
  resourceId,
  isDirty,
  values,
  onSave,
}: {
  kind: 'character' | 'item';
  resourceId: string;
  isDirty: boolean;
  values: unknown;
  onSave: () => Promise<void>;
}) {
  const latest = useRef({ isDirty, onSave });
  latest.current = { isDirty, onSave };
  const unit = `${kind}:${resourceId}`;
  const save = useCallback(async () => {
    cancelPendingSaveUnit(unit);
    if (!latest.current.isDirty) return;
    const saves = useSaveStore.getState();
    saves.markSaving(unit);
    try {
      await latest.current.onSave();
      saves.markSaved(unit);
    } catch (error) {
      saves.markError(unit, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, [unit]);
  useEffect(
    () => registerWorkspaceTabSaveOverride(kind, { saveTab: save, saveAll: save }),
    [kind, save],
  );
  useEffect(() => {
    if (isDirty) scheduleSaveUnit(unit, save);
    else useSaveStore.getState().clearUnit(unit);
    return () => cancelPendingSaveUnit(unit);
  }, [isDirty, values, unit, save]);
  return null;
}
