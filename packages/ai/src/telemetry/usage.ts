import type { AiPersona } from '@cortex/shared';

/**
 * Dependency-injected store interface for usage/budget queries.
 * Concrete implementation lives in @cortex/api.
 */
export interface UsageStore {
  /** Get total tokens used by a persona today */
  getDailyTokenUsage(workspaceId: string, persona: AiPersona): Promise<number>;
  /** Get total cost in USD for a workspace this month */
  getMonthlySpend(workspaceId: string): Promise<number>;
  /** Get workspace AI config (budget, enabled, etc.) */
  getWorkspaceConfig(workspaceId: string): Promise<{ enabled: boolean; monthly_budget_usd: number } | null>;
  /** Record a usage entry after a completion call */
  recordUsage(entry: UsageEntry): Promise<void>;
}

export interface UsageEntry {
  workspaceId: string;
  jobId: string | null;
  persona: AiPersona;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface BudgetCheckInput {
  workspaceId: string;
  persona: AiPersona;
  feature: string;
  estimatedTokens: number;
  estimatedCostUsd: number;
  /** When true, skip the per-feature token limit check (caller has explicitly overridden maxTokens) */
  skipFeatureLimit?: boolean;
}

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
}

/** Per-feature max token limits */
export interface FeatureTokenLimits {
  [feature: string]: number;
}

/** Per-persona daily token limits */
export interface PersonaDailyLimits {
  [persona: string]: number;
}

/** Cost per 1K tokens by model */
export interface ModelPricing {
  [model: string]: { input: number; output: number };
}

export class TokenBudgetManager {
  private store: UsageStore;
  private featureLimits: FeatureTokenLimits;
  private personaDailyLimits: PersonaDailyLimits;

  constructor(
    store: UsageStore,
    featureLimits: FeatureTokenLimits,
    personaDailyLimits: PersonaDailyLimits,
  ) {
    this.store = store;
    this.featureLimits = featureLimits;
    this.personaDailyLimits = personaDailyLimits;
  }

  async checkBudget(input: BudgetCheckInput): Promise<BudgetCheckResult> {
    // Level 1: Per-invocation feature token limit (skipped when caller explicitly overrides maxTokens)
    if (!input.skipFeatureLimit) {
      const featureLimit = this.featureLimits[input.feature];
      if (featureLimit && input.estimatedTokens > featureLimit) {
        return {
          allowed: false,
          reason: `Blocked: estimated ${input.estimatedTokens} tokens exceeds feature limit of ${featureLimit} for ${input.feature}`,
        };
      }
    }

    // Level 2: Per-persona daily token limit
    const dailyLimit = this.personaDailyLimits[input.persona];
    if (dailyLimit) {
      const dailyUsage = await this.store.getDailyTokenUsage(input.workspaceId, input.persona);
      if (dailyUsage + input.estimatedTokens > dailyLimit) {
        return {
          allowed: false,
          reason: `Blocked: persona ${input.persona} daily usage ${dailyUsage} + ${input.estimatedTokens} exceeds limit of ${dailyLimit}`,
        };
      }
    }

    // Level 3: Per-workspace monthly budget
    const config = await this.store.getWorkspaceConfig(input.workspaceId);
    if (!config) {
      return { allowed: false, reason: 'Blocked: no AI config found for workspace' };
    }
    if (!config.enabled) {
      return { allowed: false, reason: 'Blocked: AI is disabled for this workspace' };
    }

    const monthlySpend = await this.store.getMonthlySpend(input.workspaceId);
    if (monthlySpend + input.estimatedCostUsd > config.monthly_budget_usd) {
      return {
        allowed: false,
        reason: `Blocked: monthly spend $${monthlySpend.toFixed(2)} + $${input.estimatedCostUsd.toFixed(2)} exceeds budget of $${config.monthly_budget_usd.toFixed(2)}`,
      };
    }

    return { allowed: true };
  }
}

/** Estimate the cost of a completion call based on model pricing */
export function estimateCost(
  pricing: ModelPricing,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = pricing[model];
  if (!rates) {
    // Fall back to a conservative default
    return ((inputTokens * 0.01) + (outputTokens * 0.03)) / 1000;
  }
  return ((inputTokens * rates.input) + (outputTokens * rates.output)) / 1000;
}
