import db from '../db/index.js';
import { decodeCursor, type CursorData } from '../utils/pagination.js';
import type { Thread, CreateThreadInput, UpdateThreadInput } from '@cortex/shared';

interface ThreadRow {
  id: string;
  workspace_id: string;
  topic_id: string;
  title: string;
  type: string;
  status: string;
  body: string | null;
  summary: string | null;
  tags: string[];
  comment_count: number;
  pinned: boolean;
  created_at: Date;
  created_by: string;
  updated_at: Date;
}

interface ThreadWithCreatorRow extends ThreadRow {
  creator_id: string;
  creator_handle: string;
  creator_display_name: string;
}

export const threadRepository = {
  async findAll(
    workspaceId: string,
    options: {
      limit: number;
      cursor?: string;
      topicId?: string;
      status?: string;
    }
  ): Promise<ThreadWithCreatorRow[]> {
    let cursorData: CursorData | null = null;
    if (options.cursor) {
      cursorData = decodeCursor(options.cursor);
    }

    let query = `
      SELECT t.id, t.workspace_id, t.topic_id, t.title, t.type, t.status,
             t.body, t.summary, t.tags, t.comment_count, t.pinned, t.created_at, t.created_by, t.updated_at,
             p.id as creator_id, p.handle as creator_handle, p.display_name as creator_display_name
      FROM threads t
      JOIN principals p ON t.created_by = p.id
      WHERE t.workspace_id = $1
    `;
    const params: unknown[] = [workspaceId];
    let paramIndex = 2;

    if (options.topicId) {
      query += ` AND t.topic_id = $${paramIndex++}`;
      params.push(options.topicId);
    }

    if (options.status) {
      query += ` AND t.status = $${paramIndex++}`;
      params.push(options.status);
    }

    if (cursorData) {
      query += ` AND (t.created_at, t.id) < ($${paramIndex}, $${paramIndex + 1})`;
      params.push(cursorData.created_at, cursorData.id);
      paramIndex += 2;
    }

    query += ` ORDER BY t.pinned DESC, t.created_at DESC, t.id DESC LIMIT $${paramIndex}`;
    params.push(options.limit + 1);

    const { rows } = await db.query<ThreadWithCreatorRow>(query, params);
    return rows;
  },

  async findById(id: string): Promise<ThreadWithCreatorRow | null> {
    const { rows } = await db.query<ThreadWithCreatorRow>(
      `SELECT t.id, t.workspace_id, t.topic_id, t.title, t.type, t.status,
              t.body, t.summary, t.tags, t.comment_count, t.pinned, t.created_at, t.created_by, t.updated_at,
              p.id as creator_id, p.handle as creator_handle, p.display_name as creator_display_name
       FROM threads t
       JOIN principals p ON t.created_by = p.id
       WHERE t.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async create(
    workspaceId: string,
    createdBy: string,
    input: CreateThreadInput
  ): Promise<ThreadRow> {
    const { rows } = await db.query<ThreadRow>(
      `INSERT INTO threads (workspace_id, topic_id, title, type, body, summary, tags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, workspace_id, topic_id, title, type, status, body, summary, tags,
                 comment_count, pinned, created_at, created_by, updated_at`,
      [
        workspaceId,
        input.topic_id,
        input.title,
        input.type || 'discussion',
        input.body,
        input.summary,
        input.tags || [],
        createdBy,
      ]
    );
    return rows[0];
  },

  async update(id: string, input: UpdateThreadInput): Promise<ThreadRow | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(input.title);
    }
    if (input.type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      values.push(input.type);
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }
    if (input.body !== undefined) {
      updates.push(`body = $${paramIndex++}`);
      values.push(input.body);
    }
    if (input.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      values.push(input.tags);
    }
    if (input.pinned !== undefined) {
      updates.push(`pinned = $${paramIndex++}`);
      values.push(input.pinned);
    }
    if (input.summary !== undefined) {
      updates.push(`summary = $${paramIndex++}`);
      values.push(input.summary);
    }

    if (updates.length === 0) {
      const thread = await this.findById(id);
      return thread ? {
        id: thread.id,
        workspace_id: thread.workspace_id,
        topic_id: thread.topic_id,
        title: thread.title,
        type: thread.type,
        status: thread.status,
        body: thread.body,
        summary: thread.summary,
        tags: thread.tags,
        comment_count: thread.comment_count,
        pinned: thread.pinned,
        created_at: thread.created_at,
        created_by: thread.created_by,
        updated_at: thread.updated_at,
      } : null;
    }

    values.push(id);
    const { rows } = await db.query<ThreadRow>(
      `UPDATE threads SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, workspace_id, topic_id, title, type, status, body, summary, tags,
                 comment_count, pinned, created_at, created_by, updated_at`,
      values
    );
    return rows[0] || null;
  },

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await db.query('DELETE FROM threads WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  },
};
