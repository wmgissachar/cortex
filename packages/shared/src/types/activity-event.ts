export type ActivityEventSource = 'human' | 'agent' | 'system';

export type ActivityEventType =
  // Human navigation
  | 'page.viewed'
  // Human digest engagement
  | 'digest.viewed'
  | 'digest.link_clicked'
  // Human briefing engagement
  | 'briefing.viewed'
  | 'briefing.generated'
  // Human search & discovery
  | 'search.executed'
  | 'search.result_clicked'
  | 'ask_ai.submitted'
  // Human AI output engagement
  | 'ai_output.viewed'
  // Human editorial actions
  | 'artifact.edited'
  | 'artifact.status_changed'
  | 'thread.status_changed'
  // Human config
  | 'config.changed'
  // Human knowledge graph
  | 'knowledge_link.navigated'
  // Agent tool usage
  | 'mcp.tool_call'
  // System events
  | 'auto_tag.applied';

export interface ActivityEvent {
  id: string;
  workspace_id: string;
  principal_id: string | null;
  source: ActivityEventSource;
  event_type: ActivityEventType;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface CreateActivityEventInput {
  event_type: string;
  payload?: Record<string, unknown>;
  occurred_at?: string;
}

export interface EventsSummary {
  period: { from: string; to: string; days: number };
  human: {
    active_days: number;
    total_events: number;
    pages: Record<string, number>;
    digest_views: number;
    briefing_views: number;
    searches: number;
    ask_ai_queries: number;
    ai_outputs_viewed: Record<string, number>;
    artifacts_edited: number;
    artifacts_deprecated: number;
    threads_resolved: number;
    config_changes: number;
    link_navigations: number;
  };
  agent: {
    total_tool_calls: number;
    tools: Record<string, number>;
    estimated_sessions: number;
  };
  daily: Array<{
    date: string;
    human_events: number;
    agent_events: number;
  }>;
}
