import db from '../db/index.js';
import { decodeCursor, type CursorData } from '../utils/pagination.js';
import type { Task, CreateTaskInput, UpdateTaskInput } from '@cortex/shared';

interface TaskRow {
  id: string;
  workspace_id: string;
  topic_id: string | null;
  thread_id: string | null;
  title: string;
  body: string | null;
  status: string;
  priority: string;
  assignee_id: string | null;
  due_date: string | null;
  tags: string[];
  created_at: Date;
  created_by: string;
  updated_at: Date;
  completed_at: Date | null;
}

interface TaskWithRelationsRow extends TaskRow {
  creator_id: string;
  creator_handle: string;
  creator_display_name: string;
  assignee_handle?: string;
  assignee_display_name?: string;
}

export const taskRepository = {
  async findAll(
    workspaceId: string,
    options: {
      limit: number;
      cursor?: string;
      status?: string;
      assigneeId?: string;
    }
  ): Promise<TaskWithRelationsRow[]> {
    let cursorData: CursorData | null = null;
    if (options.cursor) {
      cursorData = decodeCursor(options.cursor);
    }

    let query = `
      SELECT t.id, t.workspace_id, t.topic_id, t.thread_id, t.title, t.body,
             t.status, t.priority, t.assignee_id, t.due_date, t.tags,
             t.created_at, t.created_by, t.updated_at, t.completed_at,
             p.id as creator_id, p.handle as creator_handle, p.display_name as creator_display_name,
             a.handle as assignee_handle, a.display_name as assignee_display_name
      FROM tasks t
      JOIN principals p ON t.created_by = p.id
      LEFT JOIN principals a ON t.assignee_id = a.id
      WHERE t.workspace_id = $1
    `;
    const params: unknown[] = [workspaceId];
    let paramIndex = 2;

    if (options.status) {
      query += ` AND t.status = $${paramIndex++}`;
      params.push(options.status);
    }

    if (options.assigneeId) {
      query += ` AND t.assignee_id = $${paramIndex++}`;
      params.push(options.assigneeId);
    }

    if (cursorData) {
      query += ` AND (t.created_at, t.id) < ($${paramIndex}, $${paramIndex + 1})`;
      params.push(cursorData.created_at, cursorData.id);
      paramIndex += 2;
    }

    query += ` ORDER BY t.created_at DESC, t.id DESC LIMIT $${paramIndex}`;
    params.push(options.limit + 1);

    const { rows } = await db.query<TaskWithRelationsRow>(query, params);
    return rows;
  },

  async findById(id: string): Promise<TaskWithRelationsRow | null> {
    const { rows } = await db.query<TaskWithRelationsRow>(
      `SELECT t.id, t.workspace_id, t.topic_id, t.thread_id, t.title, t.body,
              t.status, t.priority, t.assignee_id, t.due_date, t.tags,
              t.created_at, t.created_by, t.updated_at, t.completed_at,
              p.id as creator_id, p.handle as creator_handle, p.display_name as creator_display_name,
              a.handle as assignee_handle, a.display_name as assignee_display_name
       FROM tasks t
       JOIN principals p ON t.created_by = p.id
       LEFT JOIN principals a ON t.assignee_id = a.id
       WHERE t.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async create(
    workspaceId: string,
    createdBy: string,
    input: CreateTaskInput
  ): Promise<TaskRow> {
    const { rows } = await db.query<TaskRow>(
      `INSERT INTO tasks (workspace_id, topic_id, thread_id, title, body, status, priority, assignee_id, due_date, tags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, workspace_id, topic_id, thread_id, title, body, status, priority,
                 assignee_id, due_date, tags, created_at, created_by, updated_at, completed_at`,
      [
        workspaceId,
        input.topic_id || null,
        input.thread_id || null,
        input.title,
        input.body || null,
        input.status || 'open',
        input.priority || 'medium',
        input.assignee_id || null,
        input.due_date || null,
        input.tags || [],
        createdBy,
      ]
    );
    return rows[0];
  },

  async update(id: string, input: UpdateTaskInput): Promise<TaskRow | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(input.title);
    }
    if (input.body !== undefined) {
      updates.push(`body = $${paramIndex++}`);
      values.push(input.body);
    }
    if (input.topic_id !== undefined) {
      updates.push(`topic_id = $${paramIndex++}`);
      values.push(input.topic_id);
    }
    if (input.thread_id !== undefined) {
      updates.push(`thread_id = $${paramIndex++}`);
      values.push(input.thread_id);
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(input.status);
      if (input.status === 'done') {
        updates.push(`completed_at = NOW()`);
      } else {
        updates.push(`completed_at = NULL`);
      }
    }
    if (input.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(input.priority);
    }
    if (input.assignee_id !== undefined) {
      updates.push(`assignee_id = $${paramIndex++}`);
      values.push(input.assignee_id);
    }
    if (input.due_date !== undefined) {
      updates.push(`due_date = $${paramIndex++}`);
      values.push(input.due_date);
    }
    if (input.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      values.push(input.tags);
    }

    if (updates.length === 0) {
      const task = await this.findById(id);
      return task as TaskRow | null;
    }

    values.push(id);
    const { rows } = await db.query<TaskRow>(
      `UPDATE tasks SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, workspace_id, topic_id, thread_id, title, body, status, priority,
                 assignee_id, due_date, tags, created_at, created_by, updated_at, completed_at`,
      values
    );
    return rows[0] || null;
  },

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await db.query('DELETE FROM tasks WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  },
};
