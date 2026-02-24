import { z } from 'zod';

// Regex patterns
const HANDLE_PATTERN = /^[a-z][a-z0-9_]{1,62}[a-z0-9]$/;
const TOPIC_HANDLE_PATTERN = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;

// Common schemas
export const uuidSchema = z.string().uuid();

export const handleSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(HANDLE_PATTERN, 'Handle must be lowercase alphanumeric with underscores');

export const topicHandleSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(TOPIC_HANDLE_PATTERN, 'Handle must be lowercase alphanumeric with hyphens');

export const emailSchema = z.string().email().max(255);

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// Principal schemas
export const createPrincipalSchema = z.object({
  kind: z.enum(['human', 'agent', 'system']),
  handle: handleSchema,
  display_name: z.string().min(1).max(255),
  email: emailSchema.optional(),
  trust_tier: z.number().int().min(0).max(2).optional(),
  password: z.string().min(8).max(128).optional(),
});

export const updatePrincipalSchema = z.object({
  display_name: z.string().min(1).max(255).optional(),
  email: emailSchema.optional(),
  trust_tier: z.number().int().min(0).max(2).optional(),
  settings: z
    .object({
      theme: z.enum(['light', 'dark', 'system']).optional(),
      notifications: z.boolean().optional(),
    })
    .optional(),
});

// Topic schemas
export const createTopicSchema = z.object({
  handle: topicHandleSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(20000).optional(),
  icon: z.string().max(64).optional(),
  first_principles: z.string().max(50000).optional(),
});

export const updateTopicSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(20000).optional(),
  icon: z.string().max(64).optional(),
  first_principles: z.string().max(50000).optional(),
  archived: z.boolean().optional(),
  lifecycle_state: z.enum(['exploring', 'converging', 'concluded']).optional(),
  settings: z.record(z.unknown()).optional(),
});

// Thread schemas
export const createThreadSchema = z.object({
  topic_id: uuidSchema,
  title: z.string().min(1).max(500),
  type: z.enum(['question', 'discussion', 'decision', 'incident']).optional(),
  body: z.string().max(50000).optional(),
  summary: z.string().max(1000).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
});

export const updateThreadSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  type: z.enum(['question', 'discussion', 'decision', 'incident']).optional(),
  status: z.enum(['open', 'resolved', 'archived']).optional(),
  body: z.string().max(50000).optional(),
  summary: z.string().max(1000).nullable().optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
  pinned: z.boolean().optional(),
});

// Comment schemas
export const createCommentSchema = z.object({
  parent_id: uuidSchema.optional(),
  type: z.enum(['reply', 'observation', 'decision', 'test_result']).optional(),
  body: z.string().min(1).max(50000),
  tags: z.array(z.string().max(64)).max(20).optional(),
  significance: z.number().int().min(0).max(2).default(0).optional(),
});

export const updateCommentSchema = z.object({
  body: z.string().min(1).max(50000).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
});

// Artifact schemas
export const artifactReferenceSchema = z.object({
  type: z.enum(['thread', 'url', 'comment']),
  id: uuidSchema.optional(),
  url: z.string().url().optional(),
  title: z.string().max(255).optional(),
  snippet: z.string().max(500).optional(),
});

export const createArtifactSchema = z.object({
  topic_id: uuidSchema,
  title: z.string().min(1).max(500),
  type: z.enum(['decision', 'procedure', 'document', 'glossary']),
  body: z.string().min(1).max(100000),
  summary: z.string().max(1000).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
  references: z.array(artifactReferenceSchema).max(50).optional(),
});

export const updateArtifactSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  type: z.enum(['decision', 'procedure', 'document', 'glossary']).optional(),
  body: z.string().min(1).max(100000).optional(),
  summary: z.string().max(1000).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
  references: z.array(artifactReferenceSchema).max(50).optional(),
});

// Task schemas
export const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  body: z.string().max(10000).optional(),
  topic_id: uuidSchema.optional(),
  thread_id: uuidSchema.optional(),
  status: z.enum(['open', 'in_progress', 'done', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assignee_id: uuidSchema.optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  body: z.string().max(10000).optional(),
  topic_id: uuidSchema.nullable().optional(),
  thread_id: uuidSchema.nullable().optional(),
  status: z.enum(['open', 'in_progress', 'done', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assignee_id: uuidSchema.nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
});

// Auth schemas
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refresh_token: z.string(),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
});

// Knowledge link schemas
export const createKnowledgeLinkSchema = z.object({
  source_id: z.string().uuid(),
  target_id: z.string().uuid(),
  link_type: z.enum(['supersedes', 'supports', 'contradicts', 'depends_on', 'related_to']),
});

// Search schemas
export const searchSchema = z.object({
  q: z.string().min(1).max(500),
  type: z.enum(['all', 'threads', 'artifacts', 'comments']).optional(),
  topic_id: uuidSchema.optional(),
  status: z.string().max(50).optional(),
  tags: z.string().max(500).optional(), // comma-separated, parsed in route
  creator_kind: z.enum(['human', 'agent']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// AI Config schemas
export const updateAiConfigSchema = z.object({
  enabled: z.boolean().optional(),
  monthly_budget_usd: z.number().min(0).max(10000).optional(),
  daily_digest_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  auto_summarize: z.boolean().optional(),
  auto_review: z.boolean().optional(),
  auto_link: z.boolean().optional(),
  auto_tag: z.boolean().optional(),
  auto_triage: z.boolean().optional(),
  contradiction_detection: z.boolean().optional(),
  staleness_detection: z.boolean().optional(),
  thread_resolution_prompt: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

// AI Jobs query schemas
export const aiJobsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  persona: z.enum(['scribe', 'critic', 'linker', 'researcher', 'planner']).optional(),
  status: z.enum(['queued', 'running', 'completed', 'failed']).optional(),
  feature: z.string().max(64).optional(),
});

// AI Usage query schemas
export const aiUsageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
  persona: z.enum(['scribe', 'critic', 'linker', 'researcher', 'planner']).optional(),
});

// AI Job trigger schema
export const triggerAiJobSchema = z.object({
  persona: z.enum(['scribe', 'critic', 'linker', 'researcher', 'planner']),
  target_id: z.string().uuid(),
});

// Ask Cortex Q&A schema
export const askCortexSchema = z.object({
  query: z.string().min(3).max(2000),
  topic_id: z.string().uuid().optional(),
});

// AI Briefing request schema
export const generateBriefingSchema = z.object({
  topic_id: z.string().uuid(),
  task_description: z.string().max(2000).optional(),
});

// AI Plan generation schema
export const generatePlanSchema = z.object({
  topic_id: z.string().uuid(),
  effort: z.enum(['standard', 'deep']).default('standard'),
});

// AI Research schema
export const researchSchema = z.object({
  topic_id: z.string().uuid(),
  query: z.string().min(3).max(5000),
  mode: z.enum(['gap-directed', 'exploratory']).default('gap-directed'),
  auto_plan: z.boolean().default(false),
  plan_effort: z.enum(['standard', 'deep']).default('standard'),
});

// Activity event schemas
export const activityEventSchema = z.object({
  event_type: z.string().min(1).max(64),
  payload: z.record(z.unknown()).default({}),
  occurred_at: z.string().datetime().optional(),
});

export const createEventsSchema = z.object({
  events: z.array(activityEventSchema).min(1).max(50),
});

export const eventsSummaryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

// Session audit schema
export const sessionAuditSchema = z.object({
  topic_id: z.string().uuid(),
});

// First Principles Wizard schemas
export const firstPrinciplesQuestionsSchema = z.object({
  topic_id: z.string().uuid(),
});

export const firstPrinciplesSuggestSchema = z.object({
  topic_id: z.string().uuid(),
  answers: z.record(z.string(), z.string()),
  additional_context: z.string().max(2000).optional(),
});

// Progress Scorecard schema
export const generateScorecardSchema = z.object({
  topic_id: z.string().uuid(),
});

// Conclusion generation schema
export const generateConclusionSchema = z.object({
  topic_id: z.string().uuid(),
});
