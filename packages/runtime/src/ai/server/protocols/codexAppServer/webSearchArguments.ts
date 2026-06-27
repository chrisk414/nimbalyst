type JsonRecord = Record<string, unknown>;

const QUERY_KEYS = new Set(['query', 'q', 'searchQuery', 'search_query']);
const CONTAINER_KEYS = new Set(['action', 'input', 'request', 'searchQuery', 'search_query', 'imageQuery', 'image_query', 'queries']);

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function collectSearchStrings(value: unknown, depth = 0): string[] {
  if (depth > 4) return [];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectSearchStrings(entry, depth + 1));
  }

  if (!isRecord(value)) return [];

  const direct: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (QUERY_KEYS.has(key)) {
      direct.push(...collectSearchStrings(child, depth + 1));
    }
  }

  for (const [key, child] of Object.entries(value)) {
    if (CONTAINER_KEYS.has(key)) {
      direct.push(...collectSearchStrings(child, depth + 1));
    }
  }

  return direct;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function isWebSearchItemType(type: unknown): boolean {
  return type === 'webSearch' || type === 'web_search';
}

export function extractWebSearchStrings(args: unknown): string[] {
  return unique(collectSearchStrings(args));
}

export function normalizeWebSearchArguments(args: JsonRecord, source: unknown = args): JsonRecord {
  const queries = extractWebSearchStrings(source);
  if (queries.length === 0) return args;

  const existingQuery = typeof args.query === 'string' && args.query.trim() ? args.query.trim() : null;
  return {
    ...args,
    query: existingQuery ?? queries[0],
    ...(queries.length > 1 ? { queries } : {}),
  };
}
