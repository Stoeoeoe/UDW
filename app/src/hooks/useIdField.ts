import { useMemo } from 'react';

/**
 * Derives an ID slug from a name and validates it against a list of existing IDs.
 */
export function useIdField(name: string, customId: string, existingIds: string[]) {
  const derivedId = useMemo(() => slugify(name), [name]);
  const id = customId.trim() || derivedId;
  const isDuplicate = existingIds.includes(id);
  const isValid = id.length > 0 && !isDuplicate;

  return { id, derivedId, isDuplicate, isValid };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
