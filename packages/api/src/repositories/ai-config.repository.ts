import db from '../db/index.js';
import type { AiConfig } from '@cortex/shared';

interface AiConfigRow {
  workspace_id: string;
  enabled: boolean;
  monthly_budget_usd: string;
  daily_digest_time: string;
  auto_summarize: boolean;
  auto_review: boolean;
  auto_link: boolean;
  auto_tag: boolean;
  auto_triage: boolean;
  contradiction_detection: boolean;
  staleness_detection: boolean;
  thread_resolution_prompt: boolean;
  config: Record<string, unknown>;
  updated_at: Date;
}

function formatRow(row: AiConfigRow): AiConfig {
  return {
    workspace_id: row.workspace_id,
    enabled: row.enabled,
    monthly_budget_usd: parseFloat(row.monthly_budget_usd),
    daily_digest_time: row.daily_digest_time,
    auto_summarize: row.auto_summarize,
    auto_review: row.auto_review,
    auto_link: row.auto_link,
    auto_tag: row.auto_tag,
    auto_triage: row.auto_triage,
    contradiction_detection: row.contradiction_detection,
    staleness_detection: row.staleness_detection,
    thread_resolution_prompt: row.thread_resolution_prompt,
    config: row.config,
    updated_at: row.updated_at,
  };
}

export const aiConfigRepository = {
  async getByWorkspace(workspaceId: string): Promise<AiConfig | null> {
    const { rows } = await db.query<AiConfigRow>(
      `SELECT * FROM ai_config WHERE workspace_id = $1`,
      [workspaceId]
    );
    if (rows.length === 0) return null;
    return formatRow(rows[0]);
  },

  async upsert(
    workspaceId: string,
    data: Partial<{
      enabled: boolean;
      monthly_budget_usd: number;
      daily_digest_time: string;
      auto_summarize: boolean;
      auto_review: boolean;
      auto_link: boolean;
      auto_tag: boolean;
      auto_triage: boolean;
      contradiction_detection: boolean;
      staleness_detection: boolean;
      thread_resolution_prompt: boolean;
      config: Record<string, unknown>;
    }>
  ): Promise<AiConfig> {
    const sets: string[] = [];
    const params: unknown[] = [workspaceId];
    let idx = 2;

    if (data.enabled !== undefined) {
      sets.push(`enabled = $${idx}`);
      params.push(data.enabled);
      idx++;
    }
    if (data.monthly_budget_usd !== undefined) {
      sets.push(`monthly_budget_usd = $${idx}`);
      params.push(data.monthly_budget_usd);
      idx++;
    }
    if (data.daily_digest_time !== undefined) {
      sets.push(`daily_digest_time = $${idx}`);
      params.push(data.daily_digest_time);
      idx++;
    }
    if (data.auto_summarize !== undefined) {
      sets.push(`auto_summarize = $${idx}`);
      params.push(data.auto_summarize);
      idx++;
    }
    if (data.auto_review !== undefined) {
      sets.push(`auto_review = $${idx}`);
      params.push(data.auto_review);
      idx++;
    }
    if (data.auto_link !== undefined) {
      sets.push(`auto_link = $${idx}`);
      params.push(data.auto_link);
      idx++;
    }
    if (data.auto_tag !== undefined) {
      sets.push(`auto_tag = $${idx}`);
      params.push(data.auto_tag);
      idx++;
    }
    if (data.auto_triage !== undefined) {
      sets.push(`auto_triage = $${idx}`);
      params.push(data.auto_triage);
      idx++;
    }
    if (data.contradiction_detection !== undefined) {
      sets.push(`contradiction_detection = $${idx}`);
      params.push(data.contradiction_detection);
      idx++;
    }
    if (data.staleness_detection !== undefined) {
      sets.push(`staleness_detection = $${idx}`);
      params.push(data.staleness_detection);
      idx++;
    }
    if (data.thread_resolution_prompt !== undefined) {
      sets.push(`thread_resolution_prompt = $${idx}`);
      params.push(data.thread_resolution_prompt);
      idx++;
    }
    if (data.config !== undefined) {
      sets.push(`config = $${idx}`);
      params.push(JSON.stringify(data.config));
      idx++;
    }

    if (sets.length === 0) {
      const existing = await this.getByWorkspace(workspaceId);
      if (!existing) throw new Error('AI config not found');
      return existing;
    }

    const { rows } = await db.query<AiConfigRow>(
      `UPDATE ai_config SET ${sets.join(', ')} WHERE workspace_id = $1 RETURNING *`,
      params
    );

    if (rows.length === 0) {
      // Insert if not exists
      const { rows: insertRows } = await db.query<AiConfigRow>(
        `INSERT INTO ai_config (workspace_id) VALUES ($1)
         ON CONFLICT (workspace_id) DO NOTHING
         RETURNING *`,
        [workspaceId]
      );
      if (insertRows.length > 0) return formatRow(insertRows[0]);
      // Retry the update
      const { rows: retryRows } = await db.query<AiConfigRow>(
        `UPDATE ai_config SET ${sets.join(', ')} WHERE workspace_id = $1 RETURNING *`,
        params
      );
      return formatRow(retryRows[0]);
    }

    return formatRow(rows[0]);
  },
};
