export function getInheritedLinkedTrackerItemIds(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object') {
    return [];
  }

  const raw = (metadata as { linkedTrackerItemIds?: unknown }).linkedTrackerItemIds;
  if (!Array.isArray(raw)) {
    return [];
  }

  return Array.from(new Set(
    raw.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
  ));
}
