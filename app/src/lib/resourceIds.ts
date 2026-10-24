export const DEFAULT_ID_PREFIX = 'base';
export const ID_PREFIX_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
export const LOCAL_ID_PATTERN = /^[a-z0-9](?:[a-z0-9_.-]*[a-z0-9_-])?$/;
export const RESOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*:[a-z0-9](?:[a-z0-9_.-]*[a-z0-9_-])?$/;

export function normalizeIdPrefix(prefix = DEFAULT_ID_PREFIX): string {
  const normalized = prefix.trim().toLowerCase();
  if (!ID_PREFIX_PATTERN.test(normalized)) {
    throw new Error('ID prefix must contain lowercase letters, numbers, underscores or hyphens.');
  }
  return normalized;
}

export function qualifyResourceId(id: string, prefix = DEFAULT_ID_PREFIX): string {
  const normalized = id.trim().toLowerCase();
  const qualified = normalized.includes(':')
    ? normalized
    : `${normalizeIdPrefix(prefix)}:${normalized}`;
  if (!RESOURCE_ID_PATTERN.test(qualified)) {
    throw new Error(
      `Invalid resource ID "${id}". Use lowercase letters, numbers, underscores, dots or hyphens.`,
    );
  }
  return qualified;
}

export function resourceIdToFileStem(id: string, prefix = DEFAULT_ID_PREFIX): string {
  const qualified = qualifyResourceId(id, prefix);
  const [namespace, localId] = qualified.split(':');
  // ~ cannot occur in IDs, so other namespaces cannot collide with local filenames.
  const stem = namespace === normalizeIdPrefix(prefix) ? localId : `${namespace}~${localId}`;
  // Windows reserves these names even when an extension is present.
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem) ? `~${stem}` : stem;
}

/** Resource-local definitions keep their scope, but still use lowercase IDs. */
export function normalizeLocalId(id: string): string {
  const normalized = id.toLowerCase();
  if (!LOCAL_ID_PATTERN.test(normalized)) throw new Error(`Invalid local ID: ${id}`);
  return normalized;
}

export function assertUniqueResourceIds(resources: readonly { id: string }[]): void {
  const ids = new Set<string>();
  for (const resource of resources) {
    if (ids.has(resource.id)) throw new Error(`Duplicate ID after normalization: ${resource.id}`);
    ids.add(resource.id);
  }
}
