import { useMemo } from 'react';

/**
 * Generic hook to filter a list of items that have a label and optional sublabel,
 * based on a search query.
 */
export function useFilteredList<T extends { label: string; sublabel?: string }>(
  items: T[],
  searchQuery: string,
): T[] {
  return useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => {
      const hitLabel = item.label.toLowerCase().includes(query);
      const hitSublabel = item.sublabel?.toLowerCase().includes(query);
      return hitLabel || Boolean(hitSublabel);
    });
  }, [items, searchQuery]);
}
