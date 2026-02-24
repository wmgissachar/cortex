import db from '../db/index.js';
import { decodeCursor, type CursorData } from '../utils/pagination.js';
import type { Artifact, CreateArtifactInput, UpdateArtifactInput } from '@cortex/shared';

interface ArtifactRow {
  id: string;
  workspace_id: string;
  topic_id: string;
  thread_id: string | null;
  title: string;
  type: string;
  status: string;
  body: string;
  summary: string | null;
  tags: string[];
  references: unknown[];
  version: number;
  created_at: Date;
  created_by: string;
  updated_at: Date;
  accepted_at: Date | null;
  accepted_by: string | null;
}

interface ArtifactWithRelationsRow extends ArtifactRow {
  creator_id: string;
  creator_handle: string;
  creator_display_name: string;
  topic_handle: string;
  topic_name: string;
}

export const artifactRepository = {
  async findAll(
    workspaceId: string,
    options: {
      limit: number;
      cursor?: string;
      topicId?: string;
      status?: string;
      type?: string;
    }
  ): Promise<ArtifactWithRelationsRow[]> {
    let cursorData: CursorData | null = null;
    if (options.cursor) {
      cursorData = decodeCursor(options.cursor);
    }

    let query = `
      SELECT a.id, a.workspace_id, a.topic_id, a.thread_id, a.title, a.type, a.status,
             a.body, a.summary, a.tags, a."references", a.version,
             a.created_at, a.created_by, a.updated_at, a.accepted_at, a.accepted_by,
             p.id as creator_id, p.handle as creator_handle, p.display_name as creator_display_name,
             t.handle as topic_handle, t.name as topic_name
      FROM artifacts a
      JOIN principals p ON a.created_by = p.id
      JOIN topics t ON a.topic_id = t.id
      WHERE a.workspace_id = $1
    `;
    const params: unknown[] = [workspaceId];
    let paramIndex = 2;

    if (options.topicId) {
      query += ` AND a.topic_id = $${paramIndex++}`;
      params.push(options.topicId);
    }

    if (options.status) {
      query += ` AND a.status = $${paramIndex++}`;
      params.push(options.status);
    }

    if (options.type) {
      query += ` AND a.type = $${paramIndex++}`;
      params.push(options.type);
    }

    if (cursorData) {
      query += ` AND (a.created_at, a.id) < ($${paramIndex}, $${paramIndex + 1})`;
      params.push(cursorData.created_at, cursorData.id);
      paramIndex += 2;
    }

    query += ` ORDER BY a.created_at DESC, a.id DESC LIMIT $${paramIndex}`;
    params.push(options.limit + 1);

    const { rows } = await db.query<ArtifactWithRelationsRow>(query, params);
    return rows;
  },

  async findById(id: string): Promise<ArtifactWithRelationsRow | null> {
    const { rows } = await db.query<ArtifactWithRelationsRow>(
      `SELECT a.id, a.workspace_id, a.topic_id, a.thread_id, a.title, a.type, a.status,
              a.body, a.summary, a.tags, a."references", a.version,
              a.created_at, a.created_by, a.updated_at, a.accepted_at, a.accepted_by,
              p.id as creator_id, p.handle as creator_handle, p.display_name as creator_display_name,
              t.handle as topic_handle, t.name as topic_name
       FROM artifacts a
       JOIN principals p ON a.created_by = p.id
       JOIN topics t ON a.topic_id = t.id
       WHERE a.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async create(
    workspaceId: string,
    createdBy: string,
    input: CreateArtifactInput,
    threadId?: string
  ): Promise<ArtifactRow> {
    const { rows } = await db.query<ArtifactRow>(
      `INSERT INTO artifacts (workspace_id, topic_id, thread_id, title, type, body, summary, tags, "references", created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, workspace_id, topic_id, thread_id, title, type, status, body, summary,
                 tags, "references", version, created_at, created_by, updated_at,
                 accepted_at, accepted_by`,
      [
        workspaceId,
        input.topic_id,
        threadId || null,
        input.title,
        input.type,
        input.body,
        input.summary,
        input.tags || [],
        JSON.stringify(input.references || []),
        createdBy,
      ]
    );
    return rows[0];
  },

  async update(id: string, input: UpdateArtifactInput): Promise<ArtifactRow | null> {
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
    if (input.body !== undefined) {
      updates.push(`body = $${paramIndex++}`);
      values.push(input.body);
    }
    if (input.summary !== undefined) {
      updates.push(`summary = $${paramIndex++}`);
      values.push(input.summary);
    }
    if (input.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      values.push(input.tags);
    }
    if (input.references !== undefined) {
      updates.push(`"references" = $${paramIndex++}`);
      values.push(JSON.stringify(input.references));
    }

    if (updates.length === 0) {
      const artifact = await this.findById(id);
      return artifact as ArtifactRow | null;
    }

    values.push(id);
    const { rows } = await db.query<ArtifactRow>(
      `UPDATE artifacts SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND status = 'draft'
       RETURNING id, workspace_id, topic_id, thread_id, title, type, status, body, summary,
                 tags, "references", version, created_at, created_by, updated_at,
                 accepted_at, accepted_by`,
      values
    );
    return rows[0] || null;
  },

  async updateStatus(
    id: string,
    status: string,
    acceptedBy?: string
  ): Promise<ArtifactRow | null> {
    let query: string;
    let params: unknown[];

    if (status === 'accepted' && acceptedBy) {
      query = `
        UPDATE artifacts SET status = $1, accepted_at = NOW(), accepted_by = $2
        WHERE id = $3
        RETURNING id, workspace_id, topic_id, title, type, status, body, summary,
                  tags, "references", version, created_at, created_by, updated_at,
                  accepted_at, accepted_by`;
      params = [status, acceptedBy, id];
    } else {
      query = `
        UPDATE artifacts SET status = $1
        WHERE id = $2
        RETURNING id, workspace_id, topic_id, title, type, status, body, summary,
                  tags, "references", version, created_at, created_by, updated_at,
                  accepted_at, accepted_by`;
      params = [status, id];
    }

    const { rows } = await db.query<ArtifactRow>(query, params);
    return rows[0] || null;
  },
};
