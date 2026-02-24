import db from '../db/index.js';

interface DashboardSummary {
  new_artifacts: number;
  resolved_threads: number;
  new_threads: number;
  completed_tasks: number;
  new_observations: number;
}

interface AttentionItem {
  type: 'artifact' | 'task' | 'thread';
  id: string;
  title: string;
  reason: string;
  topic_name: string;
  created_at: Date;
}

interface CompletionItem {
  type: 'thread' | 'task';
  id: string;
  title: string;
  summary: string | null;
  topic_name: string;
  completed_at: Date;
}

interface KnowledgeBaseHealth {
  total_artifacts: number;
  accepted_count: number;
  deprecated_count: number;
  draft_count: number;
  open_threads: number;
  stale_threads: number;
}

export const dashboardRepository = {
  async getLastSeenAt(principalId: string): Promise<Date | null> {
    const { rows } = await db.query<{ last_seen_at: Date | null }>(
      `SELECT last_seen_at FROM principals WHERE id = $1`,
      [principalId]
    );
    return rows[0]?.last_seen_at || null;
  },

  async markReviewed(principalId: string): Promise<void> {
    await db.query(
      `UPDATE principals SET last_seen_at = NOW() WHERE id = $1`,
      [principalId]
    );
  },

  async getSummary(workspaceId: string, since: Date): Promise<DashboardSummary> {
    const { rows } = await db.query<{
      new_artifacts: string;
      resolved_threads: string;
      new_threads: string;
      completed_tasks: string;
      new_observations: string;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM artifacts WHERE workspace_id = $1 AND created_at > $2) as new_artifacts,
        (SELECT COUNT(*) FROM threads WHERE workspace_id = $1 AND status = 'resolved' AND updated_at > $2) as resolved_threads,
        (SELECT COUNT(*) FROM threads WHERE workspace_id = $1 AND created_at > $2) as new_threads,
        (SELECT COUNT(*) FROM tasks WHERE workspace_id = $1 AND status = 'done' AND updated_at > $2) as completed_tasks,
        (SELECT COUNT(*) FROM comments c JOIN threads t ON c.thread_id = t.id WHERE t.workspace_id = $1 AND c.type = 'observation' AND c.created_at > $2) as new_observations`,
      [workspaceId, since]
    );

    return {
      new_artifacts: parseInt(rows[0].new_artifacts, 10),
      resolved_threads: parseInt(rows[0].resolved_threads, 10),
      new_threads: parseInt(rows[0].new_threads, 10),
      completed_tasks: parseInt(rows[0].completed_tasks, 10),
      new_observations: parseInt(rows[0].new_observations, 10),
    };
  },

  async getNeedsAttention(workspaceId: string, since: Date): Promise<AttentionItem[]> {
    const { rows } = await db.query<AttentionItem>(
      `(
        SELECT 'artifact'::text as type, a.id, a.title, 'new decision' as reason,
               tp.name as topic_name, a.created_at
        FROM artifacts a
        JOIN topics tp ON a.topic_id = tp.id
        WHERE a.workspace_id = $1 AND a.type = 'decision' AND a.created_at > $2
      )
      UNION ALL
      (
        SELECT 'task'::text, tk.id, tk.title, 'approaching due date',
               COALESCE(tp.name, ''), tk.due_date
        FROM tasks tk
        LEFT JOIN topics tp ON tk.topic_id = tp.id
        WHERE tk.workspace_id = $1 AND tk.status IN ('open', 'in_progress')
          AND tk.due_date IS NOT NULL AND tk.due_date <= CURRENT_DATE + INTERVAL '3 days'
      )
      UNION ALL
      (
        SELECT 'thread'::text, t.id, t.title, 'open question',
               tp.name, t.created_at
        FROM threads t
        JOIN topics tp ON t.topic_id = tp.id
        WHERE t.workspace_id = $1 AND t.type = 'question' AND t.status = 'open'
      )
      ORDER BY created_at DESC
      LIMIT 20`,
      [workspaceId, since]
    );
    return rows;
  },

  async getRecentCompletions(workspaceId: string, since: Date): Promise<CompletionItem[]> {
    const { rows } = await db.query<CompletionItem>(
      `(
        SELECT 'thread'::text as type, t.id, t.title, t.summary,
               tp.name as topic_name, t.updated_at as completed_at
        FROM threads t
        JOIN topics tp ON t.topic_id = tp.id
        WHERE t.workspace_id = $1 AND t.status = 'resolved' AND t.updated_at > $2
      )
      UNION ALL
      (
        SELECT 'task'::text, tk.id, tk.title, tk.body as summary,
               COALESCE(tp.name, '') as topic_name, tk.updated_at
        FROM tasks tk
        LEFT JOIN topics tp ON tk.topic_id = tp.id
        WHERE tk.workspace_id = $1 AND tk.status = 'done' AND tk.updated_at > $2
      )
      ORDER BY completed_at DESC
      LIMIT 20`,
      [workspaceId, since]
    );
    return rows;
  },

  async getKnowledgeBaseHealth(workspaceId: string): Promise<KnowledgeBaseHealth> {
    const { rows } = await db.query<{
      total_artifacts: string;
      accepted_count: string;
      deprecated_count: string;
      draft_count: string;
      open_threads: string;
      stale_threads: string;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM artifacts WHERE workspace_id = $1) as total_artifacts,
        (SELECT COUNT(*) FROM artifacts WHERE workspace_id = $1 AND status = 'accepted') as accepted_count,
        (SELECT COUNT(*) FROM artifacts WHERE workspace_id = $1 AND status = 'deprecated') as deprecated_count,
        (SELECT COUNT(*) FROM artifacts WHERE workspace_id = $1 AND status = 'draft') as draft_count,
        (SELECT COUNT(*) FROM threads WHERE workspace_id = $1 AND status = 'open') as open_threads,
        (SELECT COUNT(*) FROM threads WHERE workspace_id = $1 AND status = 'open'
          AND updated_at < NOW() - INTERVAL '7 days') as stale_threads`,
      [workspaceId]
    );

    return {
      total_artifacts: parseInt(rows[0].total_artifacts, 10),
      accepted_count: parseInt(rows[0].accepted_count, 10),
      deprecated_count: parseInt(rows[0].deprecated_count, 10),
      draft_count: parseInt(rows[0].draft_count, 10),
      open_threads: parseInt(rows[0].open_threads, 10),
      stale_threads: parseInt(rows[0].stale_threads, 10),
    };
  },
};
