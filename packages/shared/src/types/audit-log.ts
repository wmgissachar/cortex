export interface AuditLogChanges {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface AuditLogMetadata {
  ip_address?: string;
  user_agent?: string;
  [key: string]: unknown;
}

export interface AuditLog {
  id: string;
  workspace_id: string;
  principal_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  changes: AuditLogChanges | null;
  metadata: AuditLogMetadata | null;
  created_at: Date;
}

export type AuditAction =
  | 'principal.created'
  | 'principal.updated'
  | 'principal.deleted'
  | 'artifact.created'
  | 'artifact.proposed'
  | 'artifact.accepted'
  | 'artifact.deprecated'
  | 'thread.created'
  | 'thread.resolved'
  | 'thread.archived'
  | 'thread.reopened'
  | 'task.created'
  | 'task.started'
  | 'task.completed'
  | 'task.cancelled'
  | 'knowledge_link.created';
