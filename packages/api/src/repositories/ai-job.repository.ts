import db from '../db/index.js';
import { decodeCursor, type CursorData } from '../utils/pagination.js';
import type { AiPersona, AiJobStatus } from '@cortex/shared';

interface AiJobRow {
  id: string;
  workspace_id: string;
  persona: string;
  feature: string;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  depth: number;
  tokens_used: number | null;
  cost_usd: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

export const aiJobRepository = {
  async create(input: {
    workspaceId: string;
    persona: AiPersona;
    feature: string;
    jobInput: Record<string, unknown>;
    depth: number;
  }): Promise<{ id: string }> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO ai_jobs (workspace_id, persona, feature, input, depth)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [input.workspaceId, input.persona, input.feature, JSON.stringify(input.jobInput), input.depth]
    );
    return rows[0];
  },

  async findById(id: string): Promise<AiJobRow | null> {
    const { rows } = await db.query<AiJobRow>(
      `SELECT * FROM ai_jobs WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async updateStatus(
    id: string,
    status: AiJobStatus,
    data?: {
      output?: Record<string, unknown>;
      error?: string;
      tokensUsed?: number;
      costUsd?: number;
      startedAt?: Date;
      completedAt?: Date;
    }
  ): Promise<void> {
    const sets: string[] = ['status = $2'];
    const params: unknown[] = [id, status];
    let idx = 3;

    if (data?.output !== undefined) {
      sets.push(`output = $${idx}`);
      params.push(JSON.stringify(data.output));
      idx++;
    }
    if (data?.error !== undefined) {
      sets.push(`error = $${idx}`);
      params.push(data.error);
      idx++;
    }
    if (data?.tokensUsed !== undefined) {
      sets.push(`tokens_used = $${idx}`);
      params.push(data.tokensUsed);
      idx++;
    }
    if (data?.costUsd !== undefined) {
      sets.push(`cost_usd = $${idx}`);
      params.push(data.costUsd);
      idx++;
    }
    if (data?.startedAt !== undefined) {
      sets.push(`started_at = $${idx}`);
      params.push(data.startedAt);
      idx++;
    }
    if (data?.completedAt !== undefined) {
      sets.push(`completed_at = $${idx}`);
      params.push(data.completedAt);
      idx++;
    }

    await db.query(
      `UPDATE ai_jobs SET ${sets.join(', ')} WHERE id = $1`,
      params
    );
  },

  async findAll(
    workspaceId: string,
    options: {
      limit: number;
      cursor?: string;
      persona?: AiPersona;
      status?: AiJobStatus;
      feature?: string;
    }
  ): Promise<AiJobRow[]> {
    const conditions: string[] = ['workspace_id = $1'];
    const params: unknown[] = [workspaceId];
    let idx = 2;

    if (options.persona) {
      conditions.push(`persona = $${idx}`);
      params.push(options.persona);
      idx++;
    }
    if (options.status) {
      conditions.push(`status = $${idx}`);
      params.push(options.status);
      idx++;
    }
    if (options.feature) {
      conditions.push(`feature = $${idx}`);
      params.push(options.feature);
      idx++;
    }

    if (options.cursor) {
      const cursorData: CursorData | null = decodeCursor(options.cursor);
      if (cursorData) {
        conditions.push(`(created_at, id) < ($${idx}, $${idx + 1})`);
        params.push(cursorData.created_at, cursorData.id);
        idx += 2;
      }
    }

    params.push(options.limit + 1);

    const { rows } = await db.query<AiJobRow>(
      `SELECT * FROM ai_jobs
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC, id DESC
       LIMIT $${idx}`,
      params
    );

    return rows;
  },

  async countRecent(persona: AiPersona, workspaceId: string, intervalHours: number): Promise<number> {
    const { rows } = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ai_jobs
       WHERE persona = $1 AND workspace_id = $2
       AND created_at > NOW() - INTERVAL '1 hour' * $3`,
      [persona, workspaceId, intervalHours]
    );
    return parseInt(rows[0].count, 10);
  },

  async findLatestByFeatureAndTarget(
    workspaceId: string,
    feature: string,
    targetId: string,
  ): Promise<AiJobRow | null> {
    const { rows } = await db.query<AiJobRow>(
      `SELECT * FROM ai_jobs
       WHERE workspace_id = $1 AND feature = $2 AND status = 'completed'
         AND input->>'targetId' = $3
       ORDER BY created_at DESC LIMIT 1`,
      [workspaceId, feature, targetId]
    );
    return rows[0] || null;
  },

  async findLatestResearchByTarget(
    workspaceId: string,
    targetId: string,
  ): Promise<AiJobRow | null> {
    const { rows } = await db.query<AiJobRow>(
      `SELECT * FROM ai_jobs
       WHERE workspace_id = $1 AND feature IN ('research', 'research-synthesis') AND status = 'completed'
         AND input->>'targetId' = $2
       ORDER BY created_at DESC LIMIT 1`,
      [workspaceId, targetId]
    );
    return rows[0] || null;
  },

  async getParentJobDepth(jobId: string): Promise<number> {
    const { rows } = await db.query<{ depth: number }>(
      `SELECT depth FROM ai_jobs WHERE id = $1`,
      [jobId]
    );
    return rows[0]?.depth ?? 0;
  },
};
