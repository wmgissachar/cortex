/**
 * Agentic Execution Runner
 *
 * Extends the standard execution runner with a tool-call loop.
 * The model can call tools, receive results, and iterate until it
 * produces a final text response or hits the iteration limit.
 *
 * Flow:
 *   1. Safety checks (circuit breaker, cascade, budget) — same as standard runner
 *   2. Create job record
 *   3. Send completion request with tools
 *   4. If response contains tool_calls:
 *      a. Execute each tool (with timeout + error handling)
 *      b. Append assistant tool-call message + tool result messages
 *      c. Send again → go to 4
 *   5. If response is text: record success, return result
 *   6. If iteration limit reached: return whatever content we have
 *
 * Token tracking accumulates across all iterations for accurate cost reporting.
 */

import type { AiPersona } from '@cortex/shared';
import type { LLMProvider, CompletionMessage, CompletionResponse } from '../providers/types.js';
import type { CircuitBreaker } from './circuit-breaker.js';
import type { CascadeGuard } from './cascade.js';
import type { TokenBudgetManager } from '../telemetry/usage.js';
import type { PersonaConfig } from '../personas/types.js';
import type { ModelPricing, FeatureTokenLimits } from '../telemetry/usage.js';
import type { JobStore } from './runner.js';
import type { Tool, AgenticConfig, ToolResult } from '../tools/types.js';
import { estimateCost } from '../telemetry/usage.js';

// ── Types ──────────────────────────────────────────────────────────

export interface AgenticExecuteRequest {
  workspaceId: string;
  persona: AiPersona;
  feature: string;
  targetId: string;
  context: string;
  parentJobId?: string | null;
  /** Override persona's default reasoning effort */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  /** Override feature token limit */
  maxTokens?: number;
  /** Tools available to the model during this execution */
  tools: Tool[];
  /** Override the persona's system prompt for this execution */
  systemPromptOverride?: string;
  /** Agentic loop configuration */
  agenticConfig?: AgenticConfig;
}

export interface AgenticExecuteResult {
  jobId: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
  /** Number of tool-call iterations that occurred */
  iterations: number;
  /** Trace of tool calls (only if agenticConfig.trace is true) */
  trace?: ToolCallTrace[];
}

export interface ToolCallTrace {
  iteration: number;
  tool_name: string;
  arguments: Record<string, unknown>;
  result_preview: string;
  duration_ms: number;
  is_error: boolean;
}

export interface AgenticRunnerDeps {
  provider: LLMProvider;
  circuitBreaker: CircuitBreaker;
  cascadeGuard: CascadeGuard;
  budgetManager: TokenBudgetManager;
  jobStore: JobStore;
  getPersona: (name: AiPersona) => PersonaConfig;
  pricing: ModelPricing;
  featureTokenLimits?: FeatureTokenLimits;
}

export interface AgenticRunner {
  execute(request: AgenticExecuteRequest): Promise<AgenticExecuteResult>;
}

// ── Defaults ───────────────────────────────────────────────────────

const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

// ── Implementation ─────────────────────────────────────────────────

export function createAgenticRunner(deps: AgenticRunnerDeps): AgenticRunner {
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
    async execute(request: AgenticExecuteRequest): Promise<AgenticExecuteResult> {
      const persona = getPersona(request.persona);
      const systemPrompt = request.systemPromptOverride ?? persona.system_prompt;
      const config = request.agenticConfig ?? {};
      const maxIterations = config.max_iterations ?? DEFAULT_MAX_ITERATIONS;
      const toolTimeoutMs = config.tool_timeout_ms ?? DEFAULT_TOOL_TIMEOUT_MS;
      const traceEnabled = config.trace ?? false;

      // ── 1. Safety checks (same as standard runner) ───────────

      if (!circuitBreaker.canExecute()) {
        throw new Error('Circuit breaker is open — AI calls are temporarily disabled');
      }

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

      const estimatedTokens = persona.default_max_tokens;
      const estimatedCostUsd = estimateCost(
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
        estimatedCostUsd,
      });
      if (!budgetResult.allowed) {
        throw new Error(budgetResult.reason ?? 'Budget check failed');
      }

      // ── 2. Create job record ─────────────────────────────────

      const job = await jobStore.createJob({
        workspaceId: request.workspaceId,
        persona: request.persona,
        feature: request.feature,
        input: {
          targetId: request.targetId,
          context: request.context,
          tools: request.tools.map((t) => t.definition.name),
          agenticConfig: config,
        },
        depth: 0,
      });

      await jobStore.updateJobStatus(job.id, 'running', { startedAt: new Date() });

      // ── 3. Agentic loop ──────────────────────────────────────

      // Build tool definition list and lookup map
      const toolDefinitions = request.tools.map((t) => t.definition);
      const toolMap = new Map(request.tools.map((t) => [t.definition.name, t]));

      // Conversation history starts with the context
      const messages: CompletionMessage[] = [
        { role: 'user', content: request.context },
      ];

      const maxTokens = request.maxTokens
        ?? featureTokenLimits?.[request.feature]
        ?? persona.default_max_tokens;
      const reasoningEffort = request.reasoningEffort ?? persona.default_reasoning_effort;

      // Accumulated token counts across all iterations
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let iterations = 0;
      const trace: ToolCallTrace[] = [];

      try {
        for (let i = 0; i < maxIterations; i++) {
          iterations = i + 1;

          const response: CompletionResponse = await provider.complete({
            model: persona.default_model,
            system: systemPrompt,
            messages,
            reasoning: { effort: reasoningEffort },
            max_tokens: maxTokens,
            tools: toolDefinitions,
            tool_choice: 'auto',
          });

          totalInputTokens += response.input_tokens;
          totalOutputTokens += response.output_tokens;

          // No tool calls — we have a final text response
          if (!response.tool_calls || response.tool_calls.length === 0) {
            const cost = estimateCost(
              pricing,
              response.model,
              totalInputTokens,
              totalOutputTokens,
            );

            await jobStore.updateJobStatus(job.id, 'completed', {
              output: {
                content: response.content,
                iterations,
                tool_calls_total: trace.length,
                ...(traceEnabled ? { trace } : {}),
              },
              tokensUsed: totalInputTokens + totalOutputTokens,
              costUsd: cost,
              completedAt: new Date(),
            });

            circuitBreaker.recordSuccess();

            await budgetManager['store'].recordUsage({
              workspaceId: request.workspaceId,
              jobId: job.id,
              persona: request.persona,
              model: response.model,
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              costUsd: cost,
            });

            return {
              jobId: job.id,
              content: response.content,
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              costUsd: cost,
              model: response.model,
              iterations,
              ...(traceEnabled ? { trace } : {}),
            };
          }

          // Tool calls — execute each, then continue the loop
          // Append the assistant's tool-call message to history
          messages.push({
            role: 'assistant',
            tool_calls: response.tool_calls,
            content: response.content || undefined,
          });

          // Execute each tool call and collect results
          const toolResults: ToolResult[] = await Promise.all(
            response.tool_calls.map(async (tc) => {
              const tool = toolMap.get(tc.name);
              const startTime = Date.now();

              if (!tool) {
                const errorContent = `Error: Unknown tool "${tc.name}". Available tools: ${[...toolMap.keys()].join(', ')}`;
                if (traceEnabled) {
                  trace.push({
                    iteration: iterations,
                    tool_name: tc.name,
                    arguments: tc.arguments,
                    result_preview: errorContent.slice(0, 200),
                    duration_ms: Date.now() - startTime,
                    is_error: true,
                  });
                }
                return { call_id: tc.id, content: errorContent, is_error: true };
              }

              try {
                const result = await executeWithTimeout(
                  tool.execute(tc.arguments),
                  toolTimeoutMs,
                  tc.name,
                );
                if (traceEnabled) {
                  trace.push({
                    iteration: iterations,
                    tool_name: tc.name,
                    arguments: tc.arguments,
                    result_preview: result.slice(0, 200),
                    duration_ms: Date.now() - startTime,
                    is_error: false,
                  });
                }
                return { call_id: tc.id, content: result };
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                const errorContent = `Error executing tool "${tc.name}": ${errorMsg}`;
                if (traceEnabled) {
                  trace.push({
                    iteration: iterations,
                    tool_name: tc.name,
                    arguments: tc.arguments,
                    result_preview: errorContent.slice(0, 200),
                    duration_ms: Date.now() - startTime,
                    is_error: true,
                  });
                }
                return { call_id: tc.id, content: errorContent, is_error: true };
              }
            }),
          );

          // Append each tool result as a message
          for (const result of toolResults) {
            messages.push({
              role: 'tool',
              call_id: result.call_id,
              content: result.content,
            });
          }
        }

        // ── Max iterations reached — force synthesis ──────────
        // Do one final call WITHOUT tools to force a text summary
        const synthesisResponse: CompletionResponse = await provider.complete({
          model: persona.default_model,
          system: persona.system_prompt,
          messages: [
            ...messages,
            {
              role: 'user',
              content:
                'You have reached the maximum number of tool-call iterations. ' +
                'Based on ALL the information you have gathered so far from the tool results above, ' +
                'produce your final research report now. Do NOT request any more tool calls. ' +
                'Synthesize everything into the structured output format specified in your instructions.',
            },
          ],
          reasoning: { effort: reasoningEffort },
          max_tokens: maxTokens,
          // No tools — force text output
        });

        totalInputTokens += synthesisResponse.input_tokens;
        totalOutputTokens += synthesisResponse.output_tokens;
        iterations += 1; // count the synthesis pass

        const finalContent = synthesisResponse.content ||
          `[Agent reached maximum iteration limit (${maxIterations}). Synthesis pass produced no content.]`;

        const cost = estimateCost(
          pricing,
          persona.default_model,
          totalInputTokens,
          totalOutputTokens,
        );

        await jobStore.updateJobStatus(job.id, 'completed', {
          output: {
            content: finalContent,
            iterations,
            tool_calls_total: trace.length,
            max_iterations_reached: true,
            ...(traceEnabled ? { trace } : {}),
          },
          tokensUsed: totalInputTokens + totalOutputTokens,
          costUsd: cost,
          completedAt: new Date(),
        });

        circuitBreaker.recordSuccess();

        await budgetManager['store'].recordUsage({
          workspaceId: request.workspaceId,
          jobId: job.id,
          persona: request.persona,
          model: persona.default_model,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: cost,
        });

        return {
          jobId: job.id,
          content: finalContent,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: cost,
          model: persona.default_model,
          iterations,
          ...(traceEnabled ? { trace } : {}),
        };
      } catch (error) {
        // Record failure
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

// ── Helpers ────────────────────────────────────────────────────────

function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  toolName: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Tool "${toolName}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (result) => { clearTimeout(timer); resolve(result); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
