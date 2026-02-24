import db from '../db/index.js';
import { decodeCursor, type CursorData } from '../utils/pagination.js';
import type { Topic, CreateTopicInput, UpdateTopicInput, TopicLifecycleState } from '@cortex/shared';

interface TopicRow {
  id: string;
  workspace_id: string;
  handle: string;
  name: string;
  description: string | null;
  icon: string | null;
  first_principles: string | null;
  lifecycle_state: TopicLifecycleState;
  settings: Record<string, unknown>;
  thread_count: number;
  artifact_count: number;
  comment_count: number;
  open_task_count: number;
  open_thread_count: number;
  recent_decision_count: number;
  last_activity_at: Date | null;
  archived_at: Date | null;
  created_at: Date;
  created_by: string;
}

export const topicRepository = {
  async findAll(
    workspaceId: string,
    options: { limit: number; cursor?: string; includeArchived?: boolean }
  ): Promise<TopicRow[]> {
    let cursorData: CursorData | null = null;
    if (options.cursor) {
      cursorData = decodeCursor(options.cursor);
    }

    let query = `
      SELECT id, workspace_id, handle, name, description, icon, first_principles, lifecycle_state, settings,
             thread_count, artifact_count,
             (SELECT COUNT(*)::int FROM comments c JOIN threads t ON c.thread_id = t.id WHERE t.topic_id = topics.id) AS comment_count,
             (SELECT COUNT(*)::int FROM tasks WHERE topic_id = topics.id AND status IN ('open', 'in_progress')) AS open_task_count,
             (SELECT COUNT(*)::int FROM threads WHERE topic_id = topics.id AND status = 'open') AS open_thread_count,
             (SELECT COUNT(*)::int FROM artifacts WHERE topic_id = topics.id AND type = 'decision' AND created_at > NOW() - INTERVAL '7 days') AS recent_decision_count,
             GREATEST(
               (SELECT MAX(created_at) FROM threads WHERE topic_id = topics.id),
               (SELECT MAX(c.created_at) FROM comments c JOIN threads t ON c.thread_id = t.id WHERE t.topic_id = topics.id),
               (SELECT MAX(updated_at) FROM tasks WHERE topic_id = topics.id)
             ) AS last_activity_at,
             archived_at, created_at, created_by
      FROM topics
      WHERE workspace_id = $1
    `;
    const params: unknown[] = [workspaceId];
    let paramIndex = 2;

    if (!options.includeArchived) {
      query += ` AND archived_at IS NULL`;
    }

    if (cursorData) {
      query += ` AND (created_at, id) < ($${paramIndex}, $${paramIndex + 1})`;
      params.push(cursorData.created_at, cursorData.id);
      paramIndex += 2;
    }

    query += ` ORDER BY created_at DESC, id DESC LIMIT $${paramIndex}`;
    params.push(options.limit + 1);

    const { rows } = await db.query<TopicRow>(query, params);
    return rows;
  },

  async findById(id: string): Promise<TopicRow | null> {
    const { rows } = await db.query<TopicRow>(
      `SELECT id, workspace_id, handle, name, description, icon, first_principles, lifecycle_state, settings,
              thread_count, artifact_count,
              (SELECT COUNT(*)::int FROM comments c JOIN threads t ON c.thread_id = t.id WHERE t.topic_id = topics.id) AS comment_count,
              (SELECT COUNT(*)::int FROM tasks WHERE topic_id = topics.id AND status IN ('open', 'in_progress')) AS open_task_count,
              (SELECT COUNT(*)::int FROM threads WHERE topic_id = topics.id AND status = 'open') AS open_thread_count,
              (SELECT COUNT(*)::int FROM artifacts WHERE topic_id = topics.id AND type = 'decision' AND created_at > NOW() - INTERVAL '7 days') AS recent_decision_count,
              GREATEST(
                (SELECT MAX(created_at) FROM threads WHERE topic_id = topics.id),
                (SELECT MAX(c.created_at) FROM comments c JOIN threads t ON c.thread_id = t.id WHERE t.topic_id = topics.id),
                (SELECT MAX(updated_at) FROM tasks WHERE topic_id = topics.id)
              ) AS last_activity_at,
              archived_at, created_at, created_by
       FROM topics WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async findByHandle(workspaceId: string, handle: string): Promise<TopicRow | null> {
    const { rows } = await db.query<TopicRow>(
      `SELECT id, workspace_id, handle, name, description, icon, first_principles, lifecycle_state, settings,
              thread_count, artifact_count,
              (SELECT COUNT(*)::int FROM comments c JOIN threads t ON c.thread_id = t.id WHERE t.topic_id = topics.id) AS comment_count,
              (SELECT COUNT(*)::int FROM tasks WHERE topic_id = topics.id AND status IN ('open', 'in_progress')) AS open_task_count,
              (SELECT COUNT(*)::int FROM threads WHERE topic_id = topics.id AND status = 'open') AS open_thread_count,
              (SELECT COUNT(*)::int FROM artifacts WHERE topic_id = topics.id AND type = 'decision' AND created_at > NOW() - INTERVAL '7 days') AS recent_decision_count,
              GREATEST(
                (SELECT MAX(created_at) FROM threads WHERE topic_id = topics.id),
                (SELECT MAX(c.created_at) FROM comments c JOIN threads t ON c.thread_id = t.id WHERE t.topic_id = topics.id),
                (SELECT MAX(updated_at) FROM tasks WHERE topic_id = topics.id)
              ) AS last_activity_at,
              archived_at, created_at, created_by
       FROM topics WHERE workspace_id = $1 AND handle = $2`,
      [workspaceId, handle]
    );
    return rows[0] || null;
  },

  async create(
    workspaceId: string,
    createdBy: string,
    input: CreateTopicInput
  ): Promise<TopicRow> {
    const { rows } = await db.query<TopicRow>(
      `INSERT INTO topics (workspace_id, handle, name, description, icon, first_principles, settings, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, workspace_id, handle, name, description, icon, first_principles, lifecycle_state, settings,
                 thread_count, artifact_count, 0 AS comment_count,
                 0 AS open_task_count, 0 AS open_thread_count, 0 AS recent_decision_count,
                 NULL::timestamptz AS last_activity_at,
                 archived_at, created_at, created_by`,
      [workspaceId, input.handle, input.name, input.description, input.icon, input.first_principles, JSON.stringify({ auto_converge: true }), createdBy]
    );
    return rows[0];
  },

  async update(id: string, input: UpdateTopicInput): Promise<TopicRow | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }
    if (input.icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      values.push(input.icon);
    }
    if (input.first_principles !== undefined) {
      updates.push(`first_principles = $${paramIndex++}`);
      values.push(input.first_principles);
    }
    if (input.archived !== undefined) {
      updates.push(`archived_at = $${paramIndex++}`);
      values.push(input.archived ? new Date() : null);
    }
    if (input.lifecycle_state !== undefined) {
      updates.push(`lifecycle_state = $${paramIndex++}`);
      values.push(input.lifecycle_state);
    }
    if (input.settings !== undefined) {
      updates.push(`settings = $${paramIndex++}`);
      values.push(JSON.stringify(input.settings));
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const { rows } = await db.query<TopicRow>(
      `UPDATE topics SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, workspace_id, handle, name, description, icon, first_principles, lifecycle_state, settings,
                 thread_count, artifact_count, 0 AS comment_count,
                 0 AS open_task_count, 0 AS open_thread_count, 0 AS recent_decision_count,
                 NULL::timestamptz AS last_activity_at,
                 archived_at, created_at, created_by`,
      values
    );
    return rows[0] || null;
  },

  async getTagsInUse(topicId: string): Promise<string[]> {
    const { rows } = await db.query<{ tag: string }>(
      `SELECT DISTINCT tag FROM (
         SELECT unnest(tags) AS tag FROM threads WHERE topic_id = $1
         UNION
         SELECT unnest(c.tags) AS tag FROM comments c JOIN threads t ON c.thread_id = t.id WHERE t.topic_id = $1
         UNION
         SELECT unnest(tags) AS tag FROM artifacts WHERE topic_id = $1
         UNION
         SELECT unnest(tags) AS tag FROM tasks WHERE topic_id = $1
       ) AS all_tags
       WHERE tag IS NOT NULL
       ORDER BY tag`,
      [topicId]
    );
    return rows.map(r => r.tag);
  },
};
