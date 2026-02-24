// Provider abstraction
export type {
  LLMProvider,
  CompletionRequest,
  CompletionResponse,
  CompletionMessage,
  TextMessage,
  AssistantToolCallMessage,
  ToolResultMessage,
} from './providers/types.js';
export { OpenAIProvider } from './providers/openai.js';

// Tool abstraction
export type {
  ToolDefinition,
  ToolCall,
  ToolResult,
  Tool,
  AgenticConfig,
} from './tools/types.js';

// Persona definitions
export type { PersonaConfig } from './personas/types.js';
export { SCRIBE_PERSONA } from './personas/scribe.js';
export { CRITIC_PERSONA } from './personas/critic.js';
export { LINKER_PERSONA } from './personas/linker.js';
export { RESEARCHER_PERSONA, DISCOVERY_SYSTEM_PROMPT } from './personas/researcher.js';
export { PLANNER_PERSONA } from './personas/planner.js';

// Execution engine — standard (single-shot)
export { CircuitBreaker } from './execution/circuit-breaker.js';
export type { CircuitBreakerConfig, CircuitBreakerStats } from './execution/circuit-breaker.js';
export { CascadeGuard } from './execution/cascade.js';
export type { CascadeStore, CascadeCheckInput, CascadeCheckResult } from './execution/cascade.js';
export { createExecutionRunner } from './execution/runner.js';
export type { ExecutionRunner, ExecutionRunnerDeps, ExecuteRequest, ExecuteResult, JobStore } from './execution/runner.js';

// Execution engine — agentic (tool-call loop)
export { createAgenticRunner } from './execution/agentic-runner.js';
export type {
  AgenticRunner,
  AgenticRunnerDeps,
  AgenticExecuteRequest,
  AgenticExecuteResult,
  ToolCallTrace,
} from './execution/agentic-runner.js';

// Telemetry / Budget
export { TokenBudgetManager, estimateCost } from './telemetry/usage.js';
export type { UsageStore, UsageEntry, BudgetCheckInput, BudgetCheckResult, FeatureTokenLimits, PersonaDailyLimits, ModelPricing } from './telemetry/usage.js';

// Context + Output interfaces (Phase A placeholders)
export type { ContextAssembler } from './context/assembler.js';
export type { OutputRouter } from './output/router.js';

// Configuration constants
export { AI_CONFIG_DEFAULTS, MODEL_PRICING, FEATURE_TOKEN_LIMITS, PERSONA_DAILY_LIMITS } from './config.js';
