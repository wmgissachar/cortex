import db from '../db/index.js';

export interface ActivityItem {
  id: string;
  activity_type: 'comment' | 'thread' | 'artifact' | 'task';
  type: string;
  title: string | null;
  body: string | null;
  created_at: Date;
  thread_id: string | null;
  thread_title: string | null;
  topic_id: string;
  topic_name: string;
  creator_id: string;
  creator_handle: string;
  creator_display_name: string;
  creator_kind: string;
}

export interface ActivityQueryOptions {
  limit: number;
  offset?: number;
  type?: string;
  topic_id?: string;
}

const VALID_TYPES = new Set(['comment', 'thread', 'artifact', 'task']);

export const activityRepository = {
  async getRecent(workspaceId: string, options: ActivityQueryOptions): Promise<{ items: ActivityItem[]; has_more: boolean }> {
    const { limit, offset = 0, type, topic_id } = options;
    const includeType = (t: string) => !type || !VALID_TYPES.has(type) || type === t;

    const members: string[] = [];
    const params: unknown[] = [workspaceId];
    let paramIndex = 2;

    if (includeType('comment')) {
      let topicFilter = '';
      if (topic_id) {
        topicFilter = ` AND th.topic_id = $${paramIndex}`;
      }
      members.push(`
        SELECT
          c.id, 'comment'::text AS activity_type, c.type::text, NULL::text AS title,
          LEFT(c.body, 300) AS body, c.created_at,
          c.thread_id, th.title AS thread_title,
          th.topic_id, tp.name AS topic_name,
          p.id AS creator_id, p.handle AS creator_handle,
          p.display_name AS creator_display_name, p.kind::text AS creator_kind
        FROM comments c
        JOIN threads th ON c.thread_id = th.id
        JOIN topics tp ON th.topic_id = tp.id
        JOIN principals p ON c.created_by = p.id
        WHERE th.workspace_id = $1${topicFilter}
          AND tp.archived_at IS NULL
      `);
    }

    if (includeType('thread')) {
      let topicFilter = '';
      if (topic_id) {
        topicFilter = ` AND t.topic_id = $${paramIndex}`;
      }
      members.push(`
        SELECT
          t.id, 'thread'::text AS activity_type, t.type::text, t.title,
          LEFT(t.body, 300) AS body, t.created_at,
          t.id AS thread_id, t.title AS thread_title,
          t.topic_id, tp.name AS topic_name,
          p.id AS creator_id, p.handle AS creator_handle,
          p.display_name AS creator_display_name, p.kind::text AS creator_kind
        FROM threads t
        JOIN topics tp ON t.topic_id = tp.id
        JOIN principals p ON t.created_by = p.id
        WHERE t.workspace_id = $1${topicFilter}
          AND tp.archived_at IS NULL
      `);
    }

    if (includeType('artifact')) {
      let topicFilter = '';
      if (topic_id) {
        topicFilter = ` AND a.topic_id = $${paramIndex}`;
      }
      members.push(`
        SELECT
          a.id, 'artifact'::text AS activity_type, a.type::text, a.title,
          LEFT(COALESCE(a.summary, a.body), 300) AS body, a.created_at,
          NULL::uuid AS thread_id, NULL::text AS thread_title,
          a.topic_id, tp.name AS topic_name,
          p.id AS creator_id, p.handle AS creator_handle,
          p.display_name AS creator_display_name, p.kind::text AS creator_kind
        FROM artifacts a
        JOIN topics tp ON a.topic_id = tp.id
        JOIN principals p ON a.created_by = p.id
        WHERE tp.workspace_id = $1${topicFilter}
          AND tp.archived_at IS NULL
      `);
    }

    if (includeType('task')) {
      let topicFilter = '';
      if (topic_id) {
        topicFilter = ` AND COALESCE(tk.topic_id, th.topic_id) = $${paramIndex}`;
      }
      members.push(`
        SELECT
          tk.id, 'task'::text AS activity_type, tk.status::text AS type, tk.title,
          LEFT(tk.body, 300) AS body, tk.created_at,
          tk.thread_id, th.title AS thread_title,
          COALESCE(tk.topic_id, th.topic_id) AS topic_id,
          COALESCE(tp_direct.name, tp_via_thread.name) AS topic_name,
          p.id AS creator_id, p.handle AS creator_handle,
          p.display_name AS creator_display_name, p.kind::text AS creator_kind
        FROM tasks tk
        LEFT JOIN threads th ON tk.thread_id = th.id
        LEFT JOIN topics tp_direct ON tk.topic_id = tp_direct.id
        LEFT JOIN topics tp_via_thread ON th.topic_id = tp_via_thread.id
        JOIN principals p ON tk.created_by = p.id
        WHERE tk.workspace_id = $1${topicFilter}
          AND COALESCE(tp_direct.archived_at, tp_via_thread.archived_at) IS NULL
      `);
    }

    if (topic_id) {
      params.push(topic_id);
      paramIndex++;
    }

    if (members.length === 0) {
      return { items: [], has_more: false };
    }

    const query = `
      SELECT * FROM (${members.join(' UNION ALL ')}) AS activity
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit + 1, offset);

    const { rows } = await db.query<ActivityItem>(query, params);

    const has_more = rows.length > limit;
    const items = has_more ? rows.slice(0, limit) : rows;

    return { items, has_more };
  },
};
