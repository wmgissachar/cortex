import type { ModelPricing, FeatureTokenLimits, PersonaDailyLimits } from './telemetry/usage.js';

/** Default AI configuration values */
export const AI_CONFIG_DEFAULTS = {
  enabled: true,
  monthly_budget_usd: 50.0,
  daily_digest_time: '07:00',
  auto_summarize: true,
  auto_review: true,
  auto_link: true,
} as const;

/**
 * Cost per 1K tokens by model (USD).
 * GPT-5.2 is the current flagship (Feb 2026).
 * GPT-5.3-codex will be added when API access is available.
 */
export const MODEL_PRICING: ModelPricing = {
  // GPT-5.2 family (current)
  'gpt-5.2': { input: 0.00175, output: 0.014 },
  'gpt-5.2-chat-latest': { input: 0.00175, output: 0.014 },
  // Fallback models
  'gpt-5': { input: 0.00125, output: 0.01 },
  'gpt-5-mini': { input: 0.00025, output: 0.002 },
  // Legacy (retained for cost tracking of historical jobs)
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
};

/**
 * Maximum tokens per single invocation, by feature.
 * Raised from Phase A defaults — GPT-5.2 has 128K max output and
 * 400K context. Quality over cost (first principles: no cost success criteria).
 */
export const FEATURE_TOKEN_LIMITS: FeatureTokenLimits = {
  'thread-summary': 8000,
  'artifact-review': 16000,
  'knowledge-linking': 8000,
  'daily-digest': 32000,
  'briefing': 16000,
  'ask-cortex': 16000,
  'contradiction-detection': 16000,
  'auto-tagging': 2000,
  'observation-triage': 8000,
  'topic-synthesis': 32000,
  'staleness-detection': 8000,
  'thread-resolution-prompt': 2000,
  'project-plan': 32000,
  // Critic pipeline (post-hoc review of research and plan outputs)
  'research-critique': 8000,
  'plan-critique': 8000,
  // Agentic features (per-iteration limit; total usage tracked across iterations)
  'research': 32000,
  'research-discovery': 32000,
  'research-synthesis': 32000,
};

/**
 * Maximum total tokens per persona per day.
 * Generous limits — quality is the priority, not cost containment.
 */
export const PERSONA_DAILY_LIMITS: PersonaDailyLimits = {
  scribe: 50_000_000,
  critic: 50_000_000,
  linker: 50_000_000,
  researcher: 50_000_000,
  planner: 50_000_000,
};
