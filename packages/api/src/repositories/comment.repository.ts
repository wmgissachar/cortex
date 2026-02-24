import db from '../db/index.js';
import { decodeCursor, type CursorData } from '../utils/pagination.js';
import type { Comment, CreateCommentInput, UpdateCommentInput } from '@cortex/shared';

interface CommentRow {
  id: string;
  thread_id: string;
  parent_id: string | null;
  type: string;
  body: string;
  tags: string[];
  attachments: unknown[];
  depth: number;
  significance: number;
  created_at: Date;
  created_by: string;
  updated_at: Date;
  edited: boolean;
}

interface CommentWithCreatorRow extends CommentRow {
  creator_id: string;
  creator_handle: string;
  creator_display_name: string;
  creator_kind: string;
}

export const commentRepository = {
  async findByThread(
    threadId: string,
    options: { limit: number; cursor?: string }
  ): Promise<CommentWithCreatorRow[]> {
    let cursorData: CursorData | null = null;
    if (options.cursor) {
      cursorData = decodeCursor(options.cursor);
    }

    let query = `
      SELECT c.id, c.thread_id, c.parent_id, c.type, c.body, c.tags, c.attachments,
             c.depth, c.significance, c.created_at, c.created_by, c.updated_at, c.edited,
             p.id as creator_id, p.handle as creator_handle,
             p.display_name as creator_display_name, p.kind as creator_kind
      FROM comments c
      JOIN principals p ON c.created_by = p.id
      WHERE c.thread_id = $1
    `;
    const params: unknown[] = [threadId];
    let paramIndex = 2;

    if (cursorData) {
      query += ` AND (c.created_at, c.id) > ($${paramIndex}, $${paramIndex + 1})`;
      params.push(cursorData.created_at, cursorData.id);
      paramIndex += 2;
    }

    query += ` ORDER BY c.created_at ASC, c.id ASC LIMIT $${paramIndex}`;
    params.push(options.limit + 1);

    const { rows } = await db.query<CommentWithCreatorRow>(query, params);
    return rows;
  },

  async findById(id: string): Promise<CommentWithCreatorRow | null> {
    const { rows } = await db.query<CommentWithCreatorRow>(
      `SELECT c.id, c.thread_id, c.parent_id, c.type, c.body, c.tags, c.attachments,
              c.depth, c.significance, c.created_at, c.created_by, c.updated_at, c.edited,
              p.id as creator_id, p.handle as creator_handle,
              p.display_name as creator_display_name, p.kind as creator_kind
       FROM comments c
       JOIN principals p ON c.created_by = p.id
       WHERE c.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async create(
    threadId: string,
    createdBy: string,
    input: CreateCommentInput & { depth?: number }
  ): Promise<CommentRow> {
    const { rows } = await db.query<CommentRow>(
      `INSERT INTO comments (thread_id, parent_id, type, body, tags, depth, significance, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, thread_id, parent_id, type, body, tags, attachments,
                 depth, significance, created_at, created_by, updated_at, edited`,
      [
        threadId,
        input.parent_id || null,
        input.type || 'reply',
        input.body,
        input.tags || [],
        input.depth || 0,
        input.significance || 0,
        createdBy,
      ]
    );
    return rows[0];
  },

  async update(id: string, input: UpdateCommentInput): Promise<CommentRow | null> {
    const updates: string[] = ['edited = true'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.body !== undefined) {
      updates.push(`body = $${paramIndex++}`);
      values.push(input.body);
    }
    if (input.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      values.push(input.tags);
    }

    values.push(id);
    const { rows } = await db.query<CommentRow>(
      `UPDATE comments SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, thread_id, parent_id, type, body, tags, attachments,
                 depth, significance, created_at, created_by, updated_at, edited`,
      values
    );
    return rows[0] || null;
  },

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await db.query('DELETE FROM comments WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  },

  async getParentDepth(parentId: string): Promise<number> {
    const { rows } = await db.query<{ depth: number }>(
      'SELECT depth FROM comments WHERE id = $1',
      [parentId]
    );
    return rows[0]?.depth ?? -1;
  },
};
