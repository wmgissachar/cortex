import type { AiPersona } from '@cortex/shared';
import type { LLMProvider, CompletionResponse } from '../providers/types.js';
import type { CircuitBreaker } from './circuit-breaker.js';
import type { CascadeGuard } from './cascade.js';
import type { TokenBudgetManager } from '../telemetry/usage.js';
import type { PersonaConfig } from '../personas/types.js';
import { estimateCost } from '../telemetry/usage.js';
import type { ModelPricing, FeatureTokenLimits } from '../telemetry/usage.js';

/**
 * Dependency-injected job store interface.
 * Concrete implementation lives in @cortex/api.
 */
export interface JobStore {
  createJob(input: {
    workspaceId: string;
    persona: AiPersona;
    feature: string;
    input: Record<string, unknown>;
    depth: number;
  }): Promise<{ id: string }>;

  updateJobStatus(
    jobId: string,
    status: 'running' | 'completed' | 'failed',
    data?: {
      output?: Record<string, unknown>;
      error?: string;
      tokensUsed?: number;
      costUsd?: number;
      startedAt?: Date;
      completedAt?: Date;
    },
  ): Promise<void>;
}

export interface ExecuteRequest {
  workspaceId: string;
  persona: AiPersona;
  feature: string;
  targetId: string;
  context: string;
  parentJobId?: string | null;
  /** Override persona's default reasoning effort for this request */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  /** Override feature token limit for this request */
  maxTokens?: number;
}

export interface ExecuteResult {
  jobId: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
}

export interface ExecutionRunnerDeps {
  provider: LLMProvider;
  circuitBreaker: CircuitBreaker;
  cascadeGuard: CascadeGuard;
  budgetManager: TokenBudgetManager;
  jobStore: JobStore;
  getPersona: (name: AiPersona) => PersonaConfig;
  pricing: ModelPricing;
  featureTokenLimits?: FeatureTokenLimits;
}

export interface ExecutionRunner {
  execute(request: ExecuteRequest): Promise<ExecuteResult>;
}

export function createExecutionRunner(deps: ExecutionRunnerDeps): ExecutionRunner {
  const {
    provider,
    circuitBreaker,
    cascadeGuard,
    budgetManager,
    jobStore,
    getPersona,
    pricing,
    featureTokenLimits,
  } = deps;

  return {
    async execute(request: ExecuteRequest): Promise<ExecuteResult> {
      const persona = getPersona(request.persona);

      // 1. Check circuit breaker
      if (!circuitBreaker.canExecute()) {
        throw new Error(`Circuit breaker is open — AI calls are temporarily disabled`);
      }

      // 2. Check cascade prevention
      const cascadeResult = await cascadeGuard.check({
        persona: request.persona,
        targetId: request.targetId,
        parentJobId: request.parentJobId ?? null,
        maxDepth: 1,
        rateLimitPerHour: persona.rate_limit_per_hour,
      });
      if (!cascadeResult.allowed) {
        throw new Error(cascadeResult.reason ?? 'Cascade check failed');
      }

      // 3. Check budget — use the same token resolution as the actual API call
      const estimatedTokens = request.maxTokens ?? featureTokenLimits?.[request.feature] ?? persona.default_max_tokens;
      const estimatedCost = estimateCost(
        pricing,
        persona.default_model,
        estimatedTokens,
        estimatedTokens,
      );
      const budgetResult = await budgetManager.checkBudget({
        workspaceId: request.workspaceId,
        persona: request.persona,
        feature: request.feature,
        estimatedTokens,
        estimatedCostUsd: estimatedCost,
        skipFeatureLimit: !!request.maxTokens,
      });
      if (!budgetResult.allowed) {
        throw new Error(budgetResult.reason ?? 'Budget check failed');
      }

      // 4. Create job record
      const job = await jobStore.createJob({
        workspaceId: request.workspaceId,
        persona: request.persona,
        feature: request.feature,
        input: { targetId: request.targetId, context: request.context },
        depth: 0,
      });

      // 5. Mark as running
      await jobStore.updateJobStatus(job.id, 'running', { startedAt: new Date() });

      let response: CompletionResponse;
      try {
        // 6. Build and execute the completion request
        // Use request override > feature-specific limit > persona default
        const maxTokens = request.maxTokens ?? featureTokenLimits?.[request.feature] ?? persona.default_max_tokens;
        const reasoningEffort = request.reasoningEffort ?? persona.default_reasoning_effort;
        response = await provider.complete({
          model: persona.default_model,
          system: persona.system_prompt,
          messages: [{ role: 'user', content: request.context }],
          reasoning: { effort: reasoningEffort },
          max_tokens: maxTokens,
        });

        // 7. Record success
        const cost = estimateCost(
          pricing,
          response.model,
          response.input_tokens,
          response.output_tokens,
        );

        await jobStore.updateJobStatus(job.id, 'completed', {
          output: { content: response.content },
          tokensUsed: response.input_tokens + response.output_tokens,
          costUsd: cost,
          completedAt: new Date(),
        });

        circuitBreaker.recordSuccess();

        // Record usage
        await budgetManager['store'].recordUsage({
          workspaceId: request.workspaceId,
          jobId: job.id,
          persona: request.persona,
          model: response.model,
          inputTokens: response.input_tokens,
          outputTokens: response.output_tokens,
          costUsd: cost,
        });

        return {
          jobId: job.id,
          content: response.content,
          inputTokens: response.input_tokens,
          outputTokens: response.output_tokens,
          costUsd: cost,
          model: response.model,
        };
      } catch (error) {
        // 8. Record failure
        const message = error instanceof Error ? error.message : String(error);
        await jobStore.updateJobStatus(job.id, 'failed', {
          error: message,
          completedAt: new Date(),
        });
        circuitBreaker.recordFailure();
        throw error;
      }
    },
  };
}
