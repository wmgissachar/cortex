import type { AiJobStatus, AiPersona } from '../enums.js';

export interface AiJob {
  id: string;
  workspace_id: string;
  persona: AiPersona;
  feature: string;
  status: AiJobStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  depth: number;
  tokens_used: number | null;
  cost_usd: number | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

export interface AiUsageRecord {
  id: string;
  workspace_id: string;
  job_id: string | null;
  persona: AiPersona;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: Date;
}

export interface AiConfig {
  workspace_id: string;
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
  updated_at: Date;
}

export interface AiUsageStats {
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
}

export interface PersonaDefinition {
  name: AiPersona;
  display_name: string;
  description: string;
  system_prompt: string;
  default_model: string;
  default_reasoning_effort: string;
  rate_limit_per_hour: number;
  daily_token_limit: number;
  features: string[];
  status: 'active' | 'disabled' | 'circuit_open';
  stats: {
    jobs_today: number;
    jobs_this_month: number;
    tokens_today: number;
    tokens_this_month: number;
  };
}

export interface AiTeamResponse {
  personas: PersonaDefinition[];
  config: AiConfig;
  circuit_breaker_state: string;
  stats: {
    today: AiUsageStats;
    this_month: AiUsageStats;
  };
  recent_jobs: AiJob[];
}

export interface UpdateAiConfigInput {
  enabled?: boolean;
  monthly_budget_usd?: number;
  daily_digest_time?: string;
  auto_summarize?: boolean;
  auto_review?: boolean;
  auto_link?: boolean;
  auto_tag?: boolean;
  auto_triage?: boolean;
  contradiction_detection?: boolean;
  staleness_detection?: boolean;
  thread_resolution_prompt?: boolean;
  config?: Record<string, unknown>;
}

export interface TriggerAiJobInput {
  persona: AiPersona;
  target_id: string;
}

export interface TriggerAiJobResponse {
  job: AiJob;
  content: string;
  posted_to?: { thread_id: string; comment_id: string };
}
