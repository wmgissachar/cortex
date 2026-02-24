import db from '../db/index.js';
import type { AiPersona } from '@cortex/shared';

export const aiUsageRepository = {
  async create(entry: {
    workspaceId: string;
    jobId: string | null;
    persona: AiPersona;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }): Promise<void> {
    await db.query(
      `INSERT INTO ai_usage (workspace_id, job_id, persona, model, input_tokens, output_tokens, cost_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [entry.workspaceId, entry.jobId, entry.persona, entry.model, entry.inputTokens, entry.outputTokens, entry.costUsd]
    );
  },

  async getDailyTokenUsage(workspaceId: string, persona: AiPersona): Promise<number> {
    const { rows } = await db.query<{ total: string | null }>(
      `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as total
       FROM ai_usage
       WHERE workspace_id = $1 AND persona = $2
       AND created_at >= CURRENT_DATE`,
      [workspaceId, persona]
    );
    return parseInt(rows[0].total || '0', 10);
  },

  async getMonthlySpend(workspaceId: string): Promise<number> {
    const { rows } = await db.query<{ total: string | null }>(
      `SELECT COALESCE(SUM(cost_usd), 0) as total
       FROM ai_usage
       WHERE workspace_id = $1
       AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`,
      [workspaceId]
    );
    return parseFloat(rows[0].total || '0');
  },

  async getStats(
    workspaceId: string,
    days: number,
    persona?: AiPersona
  ): Promise<{
    total_jobs: number;
    total_tokens: number;
    total_cost_usd: number;
    by_persona: Array<{
      persona: string;
      job_count: number;
      total_tokens: number;
      total_cost_usd: number;
    }>;
    daily: Array<{
      date: string;
      job_count: number;
      total_tokens: number;
      total_cost_usd: number;
    }>;
  }> {
    const personaFilter = persona ? 'AND u.persona = $3' : '';
    const params: unknown[] = [workspaceId, days];
    if (persona) params.push(persona);

    // Aggregate totals
    const { rows: totals } = await db.query<{
      total_jobs: string;
      total_tokens: string;
      total_cost_usd: string;
    }>(
      `SELECT
         COUNT(DISTINCT u.job_id) as total_jobs,
         COALESCE(SUM(u.input_tokens + u.output_tokens), 0) as total_tokens,
         COALESCE(SUM(u.cost_usd), 0) as total_cost_usd
       FROM ai_usage u
       WHERE u.workspace_id = $1
       AND u.created_at >= CURRENT_DATE - INTERVAL '1 day' * $2
       ${personaFilter}`,
      params
    );

    // By persona breakdown
    const { rows: byPersona } = await db.query<{
      persona: string;
      job_count: string;
      total_tokens: string;
      total_cost_usd: string;
    }>(
      `SELECT
         u.persona,
         COUNT(DISTINCT u.job_id) as job_count,
         COALESCE(SUM(u.input_tokens + u.output_tokens), 0) as total_tokens,
         COALESCE(SUM(u.cost_usd), 0) as total_cost_usd
       FROM ai_usage u
       WHERE u.workspace_id = $1
       AND u.created_at >= CURRENT_DATE - INTERVAL '1 day' * $2
       ${personaFilter}
       GROUP BY u.persona
       ORDER BY total_cost_usd DESC`,
      params
    );

    // Daily breakdown
    const { rows: daily } = await db.query<{
      date: string;
      job_count: string;
      total_tokens: string;
      total_cost_usd: string;
    }>(
      `SELECT
         DATE(u.created_at) as date,
         COUNT(DISTINCT u.job_id) as job_count,
         COALESCE(SUM(u.input_tokens + u.output_tokens), 0) as total_tokens,
         COALESCE(SUM(u.cost_usd), 0) as total_cost_usd
       FROM ai_usage u
       WHERE u.workspace_id = $1
       AND u.created_at >= CURRENT_DATE - INTERVAL '1 day' * $2
       ${personaFilter}
       GROUP BY DATE(u.created_at)
       ORDER BY date DESC`,
      params
    );

    const t = totals[0];
    return {
      total_jobs: parseInt(t.total_jobs, 10),
      total_tokens: parseInt(t.total_tokens, 10),
      total_cost_usd: parseFloat(t.total_cost_usd),
      by_persona: byPersona.map((r) => ({
        persona: r.persona,
        job_count: parseInt(r.job_count, 10),
        total_tokens: parseInt(r.total_tokens, 10),
        total_cost_usd: parseFloat(r.total_cost_usd),
      })),
      daily: daily.map((r) => ({
        date: r.date,
        job_count: parseInt(r.job_count, 10),
        total_tokens: parseInt(r.total_tokens, 10),
        total_cost_usd: parseFloat(r.total_cost_usd),
      })),
    };
  },
};
