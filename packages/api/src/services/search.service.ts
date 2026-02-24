import db from '../db/index.js';

interface SearchResult {
  id: string;
  type: 'thread' | 'artifact' | 'comment';
  title: string;
  snippet: string | null;
  status: string | null;
  rank: number;
  created_at: Date;
  topic_id?: string;
  topic_handle?: string;
  thread_id?: string;
}

interface SearchOptions {
  query: string;
  type?: 'all' | 'threads' | 'artifacts' | 'comments';
  topicId?: string;
  status?: string;
  tags?: string[];
  creatorKind?: string;
  limit: number;
}

export const searchService = {
  async search(workspaceId: string, options: SearchOptions): Promise<SearchResult[]> {
    const { query, type = 'all', topicId, limit } = options;
    const results: SearchResult[] = [];

    // Prepare the tsquery
    const tsQuery = `plainto_tsquery('english', $1)`;

    if (type === 'all' || type === 'threads') {
      let threadQuery = `
        SELECT
          t.id,
          'thread' as type,
          t.title,
          COALESCE(t.summary, LEFT(t.body, 200)) as snippet,
          t.status,
          ts_rank(t.search_vector, ${tsQuery}) as rank,
          t.created_at,
          t.topic_id,
          top.handle as topic_handle
        FROM threads t
        JOIN topics top ON t.topic_id = top.id
        WHERE t.workspace_id = $2
          AND t.search_vector @@ ${tsQuery}
          AND top.archived_at IS NULL
      `;
      const params: unknown[] = [query, workspaceId];
      let paramIndex = 3;

      if (topicId) {
        threadQuery += ` AND t.topic_id = $${paramIndex++}`;
        params.push(topicId);
      }
      if (options.status) {
        threadQuery += ` AND t.status = $${paramIndex++}`;
        params.push(options.status);
      }
      if (options.tags && options.tags.length > 0) {
        threadQuery += ` AND t.tags && $${paramIndex++}`;
        params.push(options.tags);
      }
      if (options.creatorKind) {
        threadQuery += ` AND EXISTS (SELECT 1 FROM principals p2 WHERE p2.id = t.created_by AND p2.kind = $${paramIndex++})`;
        params.push(options.creatorKind);
      }

      threadQuery += ` ORDER BY rank DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const { rows } = await db.query<SearchResult>(threadQuery, params);
      results.push(...rows);
    }

    if (type === 'all' || type === 'artifacts') {
      let artifactQuery = `
        SELECT
          a.id,
          'artifact' as type,
          a.title,
          COALESCE(a.summary, LEFT(a.body, 200)) as snippet,
          a.status,
          ts_rank(a.search_vector, ${tsQuery}) as rank,
          a.created_at,
          a.topic_id,
          top.handle as topic_handle
        FROM artifacts a
        JOIN topics top ON a.topic_id = top.id
        WHERE a.workspace_id = $2
          AND a.search_vector @@ ${tsQuery}
          AND top.archived_at IS NULL
      `;
      const params: unknown[] = [query, workspaceId];
      let paramIndex = 3;

      if (options.status) {
        artifactQuery += ` AND a.status = $${paramIndex++}`;
        params.push(options.status);
      } else {
        artifactQuery += ` AND a.status = 'accepted'`;
      }

      if (topicId) {
        artifactQuery += ` AND a.topic_id = $${paramIndex++}`;
        params.push(topicId);
      }
      if (options.tags && options.tags.length > 0) {
        artifactQuery += ` AND a.tags && $${paramIndex++}`;
        params.push(options.tags);
      }
      if (options.creatorKind) {
        artifactQuery += ` AND EXISTS (SELECT 1 FROM principals p2 WHERE p2.id = a.created_by AND p2.kind = $${paramIndex++})`;
        params.push(options.creatorKind);
      }

      artifactQuery += ` ORDER BY rank DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const { rows } = await db.query<SearchResult>(artifactQuery, params);
      results.push(...rows);
    }

    if (type === 'all' || type === 'comments') {
      let commentQuery = `
        SELECT
          c.id,
          'comment' as type,
          LEFT(c.body, 100) as title,
          LEFT(c.body, 200) as snippet,
          c.type as status,
          ts_rank(c.search_vector, ${tsQuery}) as rank,
          c.created_at,
          t.topic_id,
          top.handle as topic_handle,
          c.thread_id
        FROM comments c
        JOIN threads t ON c.thread_id = t.id
        JOIN topics top ON t.topic_id = top.id
        WHERE t.workspace_id = $2
          AND c.search_vector @@ ${tsQuery}
          AND top.archived_at IS NULL
      `;
      const params: unknown[] = [query, workspaceId];
      let paramIndex = 3;

      if (topicId) {
        commentQuery += ` AND t.topic_id = $${paramIndex++}`;
        params.push(topicId);
      }
      if (options.tags && options.tags.length > 0) {
        commentQuery += ` AND c.tags && $${paramIndex++}`;
        params.push(options.tags);
      }

      commentQuery += ` ORDER BY rank DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const { rows } = await db.query<SearchResult>(commentQuery, params);
      results.push(...rows);
    }

    // Sort all results by rank and limit
    results.sort((a, b) => b.rank - a.rank);
    return results.slice(0, limit);
  },

  async suggestions(workspaceId: string, prefix: string, limit: number = 10): Promise<string[]> {
    // Get suggestions from artifact titles and thread titles
    const { rows } = await db.query<{ title: string }>(
      `SELECT DISTINCT title FROM (
        SELECT title FROM threads WHERE workspace_id = $1 AND title ILIKE $2
        UNION ALL
        SELECT title FROM artifacts WHERE workspace_id = $1 AND status = 'accepted' AND title ILIKE $2
      ) combined
      ORDER BY title
      LIMIT $3`,
      [workspaceId, `${prefix}%`, limit]
    );

    return rows.map(r => r.title);
  },
};
