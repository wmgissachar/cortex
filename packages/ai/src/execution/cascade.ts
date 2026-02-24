import type { AiPersona } from '@cortex/shared';

/**
 * Dependency-injected store interface for cascade checks.
 * Concrete implementation lives in @cortex/api.
 */
export interface CascadeStore {
  /** Get tags on the content that triggered this job */
  getTriggerTags(targetId: string): Promise<string[]>;
  /** Get the depth of the parent job (if any) */
  getParentJobDepth(jobId: string | null): Promise<number>;
  /** Count recent jobs for a persona within the last N hours */
  countRecentJobs(persona: AiPersona, intervalHours: number): Promise<number>;
}

export interface CascadeCheckInput {
  persona: AiPersona;
  targetId: string;
  parentJobId: string | null;
  maxDepth: number;
  rateLimitPerHour: number;
}

export interface CascadeCheckResult {
  allowed: boolean;
  reason?: string;
}

export class CascadeGuard {
  private store: CascadeStore;

  constructor(store: CascadeStore) {
    this.store = store;
  }

  async check(input: CascadeCheckInput): Promise<CascadeCheckResult> {
    // Layer 1: Source tag check — block if content was created by the same persona
    const tags = await this.store.getTriggerTags(input.targetId);
    const selfTag = `persona:${input.persona}`;
    if (tags.includes(selfTag)) {
      return {
        allowed: false,
        reason: `Blocked: content already tagged with ${selfTag} (self-trigger)`,
      };
    }

    // Layer 2: Depth check — block if parent job chain exceeds max depth
    if (input.parentJobId) {
      const parentDepth = await this.store.getParentJobDepth(input.parentJobId);
      if (parentDepth + 1 > input.maxDepth) {
        return {
          allowed: false,
          reason: `Blocked: cascade depth ${parentDepth + 1} exceeds max ${input.maxDepth}`,
        };
      }
    }

    // Layer 3: Rate limit — block if persona has exceeded hourly job limit
    const recentCount = await this.store.countRecentJobs(input.persona, 1);
    if (recentCount >= input.rateLimitPerHour) {
      return {
        allowed: false,
        reason: `Blocked: persona ${input.persona} has ${recentCount} jobs in the last hour (limit: ${input.rateLimitPerHour})`,
      };
    }

    return { allowed: true };
  }
}
