import db from '../db/index.js';
import type { EventsSummary } from '@cortex/shared';

export interface ActivityEventRow {
  id: string;
  workspace_id: string;
  principal_id: string | null;
  source: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: Date;
}

interface CreateEventInput {
  workspace_id: string;
  principal_id: string | null;
  source: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at?: string;
}

export const activityEventRepository = {
  async createBatch(events: CreateEventInput[]): Promise<void> {
    if (events.length === 0) return;

    // Build multi-row INSERT: VALUES ($1,$2,$3,$4,$5,$6), ($7,$8,...), ...
    const values: unknown[] = [];
    const placeholders: string[] = [];

    for (let i = 0; i < events.length; i++) {
      const base = i * 6;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`,
      );
      values.push(
        events[i].workspace_id,
        events[i].principal_id,
        events[i].source,
        events[i].event_type,
        JSON.stringify(events[i].payload),
        events[i].created_at || new Date().toISOString(),
      );
    }

    await db.query(
      `INSERT INTO activity_events (workspace_id, principal_id, source, event_type, payload, created_at)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
  },

  async summarize(workspaceId: string, from: Date, to: Date): Promise<EventsSummary> {
    const params = [workspaceId, from.toISOString(), to.toISOString()];

    // 1. Human event counts by type
    const { rows: humanCounts } = await db.query<{ event_type: string; count: string }>(
      `SELECT event_type, COUNT(*)::text AS count
       FROM activity_events
       WHERE workspace_id = $1 AND source = 'human'
         AND created_at >= $2 AND created_at <= $3
       GROUP BY event_type`,
      params,
    );

    // 2. Human active days
    const { rows: activeDaysRows } = await db.query<{ active_days: string }>(
      `SELECT COUNT(DISTINCT DATE(created_at))::text AS active_days
       FROM activity_events
       WHERE workspace_id = $1 AND source = 'human'
         AND created_at >= $2 AND created_at <= $3`,
      params,
    );

    // 3. Page view breakdown
    const { rows: pageRows } = await db.query<{ page: string; count: string }>(
      `SELECT payload->>'page' AS page, COUNT(*)::text AS count
       FROM activity_events
       WHERE workspace_id = $1 AND event_type = 'page.viewed'
         AND created_at >= $2 AND created_at <= $3
       GROUP BY payload->>'page'
       ORDER BY count DESC`,
      params,
    );

    // 4. AI output views by feature
    const { rows: aiOutputRows } = await db.query<{ feature: string; count: string }>(
      `SELECT payload->>'feature' AS feature, COUNT(*)::text AS count
       FROM activity_events
       WHERE workspace_id = $1 AND event_type = 'ai_output.viewed'
         AND created_at >= $2 AND created_at <= $3
       GROUP BY payload->>'feature'`,
      params,
    );

    // 5. Agent tool call counts
    const { rows: toolRows } = await db.query<{ tool_name: string; count: string }>(
      `SELECT payload->>'tool_name' AS tool_name, COUNT(*)::text AS count
       FROM activity_events
       WHERE workspace_id = $1 AND event_type = 'mcp.tool_call'
         AND created_at >= $2 AND created_at <= $3
       GROUP BY payload->>'tool_name'
       ORDER BY count DESC`,
      params,
    );

    // 6. Agent total and estimated sessions (gap > 30 min = new session)
    const { rows: agentTotalRows } = await db.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM activity_events
       WHERE workspace_id = $1 AND source = 'agent'
         AND created_at >= $2 AND created_at <= $3`,
      params,
    );

    const { rows: sessionRows } = await db.query<{ sessions: string }>(
      `SELECT COUNT(*)::text AS sessions FROM (
         SELECT created_at,
                LAG(created_at) OVER (ORDER BY created_at) AS prev_at
         FROM activity_events
         WHERE workspace_id = $1 AND event_type = 'mcp.tool_call'
           AND created_at >= $2 AND created_at <= $3
       ) gaps
       WHERE prev_at IS NULL
          OR EXTRACT(EPOCH FROM (created_at - prev_at)) > 1800`,
      params,
    );

    // 7. Daily breakdown
    const { rows: dailyRows } = await db.query<{
      date: string;
      human_events: string;
      agent_events: string;
    }>(
      `SELECT DATE(created_at)::text AS date,
              COUNT(*) FILTER (WHERE source = 'human')::text AS human_events,
              COUNT(*) FILTER (WHERE source = 'agent')::text AS agent_events
       FROM activity_events
       WHERE workspace_id = $1
         AND created_at >= $2 AND created_at <= $3
       GROUP BY DATE(created_at)
       ORDER BY date`,
      params,
    );

    // Build counts map from human events
    const countMap: Record<string, number> = {};
    for (const row of humanCounts) {
      countMap[row.event_type] = parseInt(row.count, 10);
    }

    const totalDays = Math.max(
      1,
      Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)),
    );

    return {
      period: { from: from.toISOString(), to: to.toISOString(), days: totalDays },
      human: {
        active_days: parseInt(activeDaysRows[0]?.active_days || '0', 10),
        total_events: Object.values(countMap).reduce((a, b) => a + b, 0),
        pages: Object.fromEntries(pageRows.map((r) => [r.page, parseInt(r.count, 10)])),
        digest_views: countMap['digest.viewed'] || 0,
        briefing_views: countMap['briefing.viewed'] || 0,
        searches: countMap['search.executed'] || 0,
        ask_ai_queries: countMap['ask_ai.submitted'] || 0,
        ai_outputs_viewed: Object.fromEntries(
          aiOutputRows.map((r) => [r.feature, parseInt(r.count, 10)]),
        ),
        artifacts_edited: countMap['artifact.edited'] || 0,
        artifacts_deprecated: countMap['artifact.status_changed'] || 0,
        threads_resolved: countMap['thread.status_changed'] || 0,
        config_changes: countMap['config.changed'] || 0,
        link_navigations: countMap['knowledge_link.navigated'] || 0,
      },
      agent: {
        total_tool_calls: parseInt(agentTotalRows[0]?.total || '0', 10),
        tools: Object.fromEntries(toolRows.map((r) => [r.tool_name, parseInt(r.count, 10)])),
        estimated_sessions: parseInt(sessionRows[0]?.sessions || '0', 10),
      },
      daily: dailyRows.map((r) => ({
        date: r.date,
        human_events: parseInt(r.human_events, 10),
        agent_events: parseInt(r.agent_events, 10),
      })),
    };
  },
};
