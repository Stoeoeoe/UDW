import React from 'react';

/**
 * useEntityFormDraft - Keeps a mutable draft in sync with current selection.
 * Useful for editors where the inspector edits selected records.
 */
export function useEntityFormDraft<TEntity, TDraft>(
  selected: TEntity | null | undefined,
  toDraft: (entity: TEntity) => TDraft,
  emptyDraft: TDraft,
) {
  const [draft, setDraft] = React.useState<TDraft>(selected ? toDraft(selected) : emptyDraft);

  React.useEffect(() => {
    setDraft(selected ? toDraft(selected) : emptyDraft);
  }, [selected, toDraft, emptyDraft]);

  const patchDraft = React.useCallback((updates: Partial<TDraft>) => {
    setDraft((current) => ({ ...current, ...updates }));
  }, []);

  return {
    draft,
    setDraft,
    patchDraft,
  };
}

export default useEntityFormDraft;
