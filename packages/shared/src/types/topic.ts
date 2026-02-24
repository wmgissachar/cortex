export type TopicLifecycleState = 'exploring' | 'converging' | 'concluded';

export interface Topic {
  id: string;
  workspace_id: string;
  handle: string;
  name: string;
  description: string | null;
  icon: string | null;
  first_principles: string | null;
  lifecycle_state: TopicLifecycleState;
  settings?: Record<string, unknown>;
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

export interface CreateTopicInput {
  handle: string;
  name: string;
  description?: string;
  icon?: string;
  first_principles?: string;
}

export interface UpdateTopicInput {
  name?: string;
  description?: string;
  icon?: string;
  first_principles?: string;
  archived?: boolean;
  lifecycle_state?: TopicLifecycleState;
  settings?: Record<string, unknown>;
}
