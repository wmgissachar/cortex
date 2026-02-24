export interface CursorData {
  id: string;
  created_at: string;
}

export function encodeCursor(data: CursorData): string {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

export function decodeCursor(cursor: string): CursorData | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
    const data = JSON.parse(decoded) as CursorData;

    // Validate structure
    if (typeof data.id !== 'string' || typeof data.created_at !== 'string') {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export interface PaginationParams {
  limit: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  hasMore: boolean;
  nextCursor?: string;
}

export function buildPaginatedResponse<T extends { id: string; created_at: Date }>(
  items: T[],
  limit: number
): PaginatedResult<T> {
  const hasMore = items.length > limit;
  const resultItems = hasMore ? items.slice(0, limit) : items;

  let nextCursor: string | undefined;
  if (hasMore && resultItems.length > 0) {
    const lastItem = resultItems[resultItems.length - 1];
    nextCursor = encodeCursor({
      id: lastItem.id,
      created_at: lastItem.created_at.toISOString(),
    });
  }

  return {
    items: resultItems,
    hasMore,
    nextCursor,
  };
}
