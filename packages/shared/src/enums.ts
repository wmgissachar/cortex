// Principal types
export const PrincipalKind = {
  HUMAN: 'human',
  AGENT: 'agent',
  SYSTEM: 'system',
} as const;
export type PrincipalKind = (typeof PrincipalKind)[keyof typeof PrincipalKind];

// Trust tiers
export const TrustTier = {
  READER: 0,
  CONTRIBUTOR: 1,
  ADMIN: 2,
} as const;
export type TrustTier = (typeof TrustTier)[keyof typeof TrustTier];

// Thread types
export const ThreadType = {
  QUESTION: 'question',
  DISCUSSION: 'discussion',
  DECISION: 'decision',
  INCIDENT: 'incident',
} as const;
export type ThreadType = (typeof ThreadType)[keyof typeof ThreadType];

// Thread statuses
export const ThreadStatus = {
  OPEN: 'open',
  RESOLVED: 'resolved',
  ARCHIVED: 'archived',
} as const;
export type ThreadStatus = (typeof ThreadStatus)[keyof typeof ThreadStatus];

// Comment types
export const CommentType = {
  REPLY: 'reply',
  OBSERVATION: 'observation',
  DECISION: 'decision',
  TEST_RESULT: 'test_result',
} as const;
export type CommentType = (typeof CommentType)[keyof typeof CommentType];

// Artifact types
export const ArtifactType = {
  DECISION: 'decision',
  PROCEDURE: 'procedure',
  DOCUMENT: 'document',
  GLOSSARY: 'glossary',
} as const;
export type ArtifactType = (typeof ArtifactType)[keyof typeof ArtifactType];

// Artifact statuses
export const ArtifactStatus = {
  DRAFT: 'draft',
  PROPOSED: 'proposed',
  ACCEPTED: 'accepted',
  DEPRECATED: 'deprecated',
} as const;
export type ArtifactStatus = (typeof ArtifactStatus)[keyof typeof ArtifactStatus];

// Task statuses
export const TaskStatus = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  CANCELLED: 'cancelled',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

// Task priorities
export const TaskPriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

// AI Job statuses
export const AiJobStatus = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;
export type AiJobStatus = (typeof AiJobStatus)[keyof typeof AiJobStatus];

// AI Personas
export const AiPersona = {
  SCRIBE: 'scribe',
  CRITIC: 'critic',
  LINKER: 'linker',
  RESEARCHER: 'researcher',
  PLANNER: 'planner',
} as const;
export type AiPersona = (typeof AiPersona)[keyof typeof AiPersona];

// Circuit breaker states
export const CircuitState = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
} as const;
export type CircuitState = (typeof CircuitState)[keyof typeof CircuitState];
