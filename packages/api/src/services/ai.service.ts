import type { AiPersona, AiJobStatus, AiConfig, AiUsageStats, AiJob, AiTeamResponse, PersonaDefinition, UpdateAiConfigInput, TriggerAiJobResponse } from '@cortex/shared';
import {
  SCRIBE_PERSONA,
  CRITIC_PERSONA,
  LINKER_PERSONA,
  RESEARCHER_PERSONA,
  DISCOVERY_SYSTEM_PROMPT,
  PLANNER_PERSONA,
  CircuitBreaker,
  CascadeGuard,
  TokenBudgetManager,
  OpenAIProvider,
  createExecutionRunner,
  createAgenticRunner,
  MODEL_PRICING,
  FEATURE_TOKEN_LIMITS,
  PERSONA_DAILY_LIMITS,
  type PersonaConfig,
  type ExecutionRunner,
  type AgenticRunner,
  type JobStore,
  type CascadeStore,
  type UsageStore,
} from '@cortex/ai';
import { aiJobRepository } from '../repositories/ai-job.repository.js';
import { aiUsageRepository } from '../repositories/ai-usage.repository.js';
import { aiConfigRepository } from '../repositories/ai-config.repository.js';
import {
  aiContextService,
  assembleTopicBriefingContext,
  assembleAskCortexContext,
  assembleAutoTagContext,
  assembleResolutionPromptContext,
  assembleObservationTriageContext,
  assembleContradictionContext,
  assembleTopicSynthesisContext,
  assembleStalenessContext,
  assembleTopicPlanContext,
  assembleFirstPrinciplesContext,
  assembleProgressScorecardContext,
  assembleConclusionContext,
  getScorecardProgressLines,
} from './ai-context.service.js';
import { routeAndGetLocation } from './ai-output.service.js';
import { threadRepository } from '../repositories/thread.repository.js';
import { threadService } from './thread.service.js';
import { artifactRepository } from '../repositories/artifact.repository.js';
import { topicRepository } from '../repositories/topic.repository.js';
import { commentRepository } from '../repositories/comment.repository.js';
import {
  createCortexSearchTool,
  createCortexGetArtifactTool,
  createCortexGetThreadTool,
} from '../tools/cortex-search.tool.js';
import {
  createWebSearchTool,
  createWebReadTool,
} from '../tools/web-search.tool.js';

// Persona registry
const PERSONAS: Record<string, PersonaConfig> = {
  scribe: SCRIBE_PERSONA,
  critic: CRITIC_PERSONA,
  linker: LINKER_PERSONA,
  researcher: RESEARCHER_PERSONA,
  planner: PLANNER_PERSONA,
};

// Persona → feature/target_type mapping
const PERSONA_FEATURES: Record<string, { feature: string; targetType: string }> = {
  scribe: { feature: 'thread-summary', targetType: 'thread' },
  critic: { feature: 'artifact-review', targetType: 'artifact' },
  linker: { feature: 'knowledge-linking', targetType: 'artifact' },
  researcher: { feature: 'research', targetType: 'topic' },
  planner: { feature: 'project-plan', targetType: 'topic' },
};

// Shared circuit breaker (in-memory, resets on restart)
const circuitBreaker = new CircuitBreaker();

// Lazy singleton execution runner
let runner: ExecutionRunner | null = null;

function getRunner(workspaceId: string): ExecutionRunner {
  if (runner) return runner;

  const apiKey = process.env.OPENAI_KEY;
  if (!apiKey) throw new Error('OPENAI_KEY environment variable not set');

  const provider = new OpenAIProvider(apiKey);

  const jobStore: JobStore = {
    createJob: (args) =>
      aiJobRepository.create({
        workspaceId: args.workspaceId,
        persona: args.persona,
        feature: args.feature,
        jobInput: args.input,
        depth: args.depth,
      }),
    updateJobStatus: (id, status, data) =>
      aiJobRepository.updateStatus(id, status as AiJobStatus, data),
  };

  const cascadeStore: CascadeStore = {
    getTriggerTags: async () => [], // Manual triggers have no source tags
    getParentJobDepth: async (jobId) =>
      jobId ? aiJobRepository.getParentJobDepth(jobId) : 0,
    countRecentJobs: (persona, intervalHours) =>
      aiJobRepository.countRecent(persona, workspaceId, intervalHours),
  };

  const usageStore: UsageStore = {
    getDailyTokenUsage: (ws, persona) =>
      aiUsageRepository.getDailyTokenUsage(ws, persona),
    getMonthlySpend: (ws) =>
      aiUsageRepository.getMonthlySpend(ws),
    getWorkspaceConfig: async (ws) => {
      const cfg = await aiConfigRepository.getByWorkspace(ws);
      return cfg ? { enabled: cfg.enabled, monthly_budget_usd: cfg.monthly_budget_usd } : null;
    },
    recordUsage: (entry) =>
      aiUsageRepository.create({
        workspaceId: entry.workspaceId,
        jobId: entry.jobId,
        persona: entry.persona,
        model: entry.model,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        costUsd: entry.costUsd,
      }),
  };

  const cascadeGuard = new CascadeGuard(cascadeStore);
  const budgetManager = new TokenBudgetManager(usageStore, FEATURE_TOKEN_LIMITS, PERSONA_DAILY_LIMITS);

  runner = createExecutionRunner({
    provider,
    circuitBreaker,
    cascadeGuard,
    budgetManager,
    jobStore,
    getPersona: (name) => {
      const p = PERSONAS[name];
      if (!p) throw new Error(`Unknown persona: ${name}`);
      return p;
    },
    pricing: MODEL_PRICING,
    featureTokenLimits: FEATURE_TOKEN_LIMITS,
  });

  return runner;
}

// Lazy singleton agentic runner (for tool-using personas like Researcher)
let agenticRunnerInstance: AgenticRunner | null = null;

function getAgenticRunner(workspaceId: string): AgenticRunner {
  if (agenticRunnerInstance) return agenticRunnerInstance;

  // Ensure standard runner is initialized first (shares deps)
  getRunner(workspaceId);

  const apiKey = process.env.OPENAI_KEY;
  if (!apiKey) throw new Error('OPENAI_KEY environment variable not set');

  const provider = new OpenAIProvider(apiKey);

  const jobStore: JobStore = {
    createJob: (args) =>
      aiJobRepository.create({
        workspaceId: args.workspaceId,
        persona: args.persona,
        feature: args.feature,
        jobInput: args.input,
        depth: args.depth,
      }),
    updateJobStatus: (id, status, data) =>
      aiJobRepository.updateStatus(id, status as AiJobStatus, data),
  };

  const cascadeStore: CascadeStore = {
    getTriggerTags: async () => [],
    getParentJobDepth: async (jobId) =>
      jobId ? aiJobRepository.getParentJobDepth(jobId) : 0,
    countRecentJobs: (persona, intervalHours) =>
      aiJobRepository.countRecent(persona, workspaceId, intervalHours),
  };

  const usageStore: UsageStore = {
    getDailyTokenUsage: (ws, persona) =>
      aiUsageRepository.getDailyTokenUsage(ws, persona),
    getMonthlySpend: (ws) =>
      aiUsageRepository.getMonthlySpend(ws),
    getWorkspaceConfig: async (ws) => {
      const cfg = await aiConfigRepository.getByWorkspace(ws);
      return cfg ? { enabled: cfg.enabled, monthly_budget_usd: cfg.monthly_budget_usd } : null;
    },
    recordUsage: (entry) =>
      aiUsageRepository.create({
        workspaceId: entry.workspaceId,
        jobId: entry.jobId,
        persona: entry.persona,
        model: entry.model,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        costUsd: entry.costUsd,
      }),
  };

  const cascadeGuard = new CascadeGuard(cascadeStore);
  const budgetManager = new TokenBudgetManager(usageStore, FEATURE_TOKEN_LIMITS, PERSONA_DAILY_LIMITS);

  agenticRunnerInstance = createAgenticRunner({
    provider,
    circuitBreaker,
    cascadeGuard,
    budgetManager,
    jobStore,
    getPersona: (name) => {
      const p = PERSONAS[name];
      if (!p) throw new Error(`Unknown persona: ${name}`);
      return p;
    },
    pricing: MODEL_PRICING,
    featureTokenLimits: FEATURE_TOKEN_LIMITS,
  });

  return agenticRunnerInstance;
}

// cortex-analyst principal ID cache
let analystPrincipalId: string | null = null;

async function getAnalystPrincipalId(workspaceId: string): Promise<string | null> {
  if (analystPrincipalId) return analystPrincipalId;
  const db = (await import('../db/index.js')).default;
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM principals WHERE handle = 'cortex_analyst' AND workspace_id = $1`,
    [workspaceId]
  );
  if (rows.length > 0) {
    analystPrincipalId = rows[0].id;
  }
  return analystPrincipalId;
}

function formatJob(row: {
  id: string;
  workspace_id: string;
  persona: string;
  feature: string;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  depth: number;
  tokens_used: number | null;
  cost_usd: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}): AiJob {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    persona: row.persona as AiPersona,
    feature: row.feature,
    status: row.status as AiJobStatus,
    input: row.input,
    output: row.output,
    error: row.error,
    depth: row.depth,
    tokens_used: row.tokens_used,
    cost_usd: row.cost_usd ? parseFloat(row.cost_usd) : null,
    created_at: row.created_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
  };
}

export const aiService = {
  async listJobs(
    workspaceId: string,
    options: {
      limit: number;
      cursor?: string;
      persona?: AiPersona;
      status?: AiJobStatus;
      feature?: string;
    }
  ) {
    const rows = await aiJobRepository.findAll(workspaceId, options);
    const hasMore = rows.length > options.limit;
    const items = rows.slice(0, options.limit).map(formatJob);

    let nextCursor: string | undefined;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({ id: last.id, created_at: last.created_at })
      ).toString('base64');
    }

    return { items, hasMore, nextCursor };
  },

  async getJob(id: string): Promise<AiJob | null> {
    const row = await aiJobRepository.findById(id);
    if (!row) return null;
    return formatJob(row);
  },

  async getUsageStats(
    workspaceId: string,
    days: number,
    persona?: AiPersona
  ): Promise<AiUsageStats> {
    return aiUsageRepository.getStats(workspaceId, days, persona);
  },

  async getConfig(workspaceId: string): Promise<AiConfig | null> {
    return aiConfigRepository.getByWorkspace(workspaceId);
  },

  async updateConfig(workspaceId: string, input: UpdateAiConfigInput): Promise<AiConfig> {
    return aiConfigRepository.upsert(workspaceId, input);
  },

  async getTeam(workspaceId: string): Promise<AiTeamResponse> {
    const config = await aiConfigRepository.getByWorkspace(workspaceId);

    // Get stats for today and this month
    const todayStats = await aiUsageRepository.getStats(workspaceId, 1);
    const monthStats = await aiUsageRepository.getStats(workspaceId, 30);

    // Get recent jobs
    const recentJobRows = await aiJobRepository.findAll(workspaceId, { limit: 10 });
    const recentJobs = recentJobRows.slice(0, 10).map(formatJob);

    // Build persona definitions with live stats
    const personas: PersonaDefinition[] = Object.values(PERSONAS).map((p) => {
      const todayPersona = todayStats.by_persona.find((bp) => bp.persona === p.name);
      const monthPersona = monthStats.by_persona.find((bp) => bp.persona === p.name);

      return {
        name: p.name,
        display_name: p.display_name,
        description: p.description,
        system_prompt: p.system_prompt,
        default_model: p.default_model,
        default_reasoning_effort: p.default_reasoning_effort,
        rate_limit_per_hour: p.rate_limit_per_hour,
        daily_token_limit: p.daily_token_limit,
        features: p.features,
        status: config?.enabled ? ('active' as const) : ('disabled' as const),
        stats: {
          jobs_today: todayPersona?.job_count ?? 0,
          jobs_this_month: monthPersona?.job_count ?? 0,
          tokens_today: todayPersona?.total_tokens ?? 0,
          tokens_this_month: monthPersona?.total_tokens ?? 0,
        },
      };
    });

    const cbState = circuitBreaker.getState();

    return {
      personas,
      config: config ?? {
        workspace_id: workspaceId,
        enabled: true,
        monthly_budget_usd: 50,
        daily_digest_time: '07:00',
        auto_summarize: true,
        auto_review: true,
        auto_link: true,
        auto_tag: true,
        auto_triage: true,
        contradiction_detection: true,
        staleness_detection: true,
        thread_resolution_prompt: true,
        config: {},
        updated_at: new Date(),
      },
      circuit_breaker_state: cbState,
      stats: {
        today: todayStats,
        this_month: monthStats,
      },
      recent_jobs: recentJobs,
    };
  },

  getAnalystPrincipalId,

  async triggerJob(
    persona: AiPersona,
    targetId: string,
    workspaceId: string,
    options?: { feature?: string; targetType?: string },
  ): Promise<TriggerAiJobResponse> {
    // Validate persona
    const personaConfig = PERSONAS[persona];
    if (!personaConfig) throw new Error(`Unknown persona: ${persona}`);

    const defaultMapping = PERSONA_FEATURES[persona];
    if (!defaultMapping) throw new Error(`No feature mapping for persona: ${persona}`);

    const mapping = {
      feature: options?.feature || defaultMapping.feature,
      targetType: options?.targetType || defaultMapping.targetType,
    };

    // Assemble context
    const context = await aiContextService.assemble({
      targetId,
      targetType: mapping.targetType,
      workspaceId,
      maxTokens: personaConfig.default_max_tokens,
    });

    // Execute via the runner (includes circuit breaker, cascade, budget checks)
    const execRunner = getRunner(workspaceId);
    const result = await execRunner.execute({
      workspaceId,
      persona,
      feature: mapping.feature,
      targetId,
      context,
    });

    // Route output (post as comment where appropriate)
    const postedTo = await routeAndGetLocation({
      jobId: result.jobId,
      persona,
      feature: mapping.feature,
      targetId,
      content: result.content,
      workspaceId,
    });

    // Fetch the completed job for the response
    const job = await aiJobRepository.findById(result.jobId);

    return {
      job: formatJob(job!),
      content: result.content,
      posted_to: postedTo,
    };
  },

  async generateBriefing(
    topicId: string,
    workspaceId: string,
    taskDescription?: string,
  ): Promise<TriggerAiJobResponse> {
    // Assemble briefing-specific context (supports taskDescription)
    const context = await assembleTopicBriefingContext(topicId, workspaceId, taskDescription);

    // Execute via the runner (includes circuit breaker, cascade, budget checks)
    const execRunner = getRunner(workspaceId);
    const result = await execRunner.execute({
      workspaceId,
      persona: 'scribe',
      feature: 'briefing',
      targetId: topicId,
      context,
    });

    // Briefings are ephemeral — not posted to any thread.
    // The AI job record provides the audit trail.
    const job = await aiJobRepository.findById(result.jobId);

    return {
      job: formatJob(job!),
      content: result.content,
    };
  },

  async askCortex(
    query: string,
    workspaceId: string,
    topicId?: string,
  ): Promise<TriggerAiJobResponse> {
    const context = await assembleAskCortexContext(query, workspaceId, topicId);
    const execRunner = getRunner(workspaceId);
    const result = await execRunner.execute({
      workspaceId,
      persona: 'scribe',
      feature: 'ask-cortex',
      targetId: workspaceId,
      context,
    });
    const job = await aiJobRepository.findById(result.jobId);
    return { job: formatJob(job!), content: result.content };
  },

  async autoTagArtifact(
    artifactId: string,
    workspaceId: string,
  ): Promise<TriggerAiJobResponse> {
    const context = await assembleAutoTagContext(artifactId, workspaceId);
    const execRunner = getRunner(workspaceId);
    const result = await execRunner.execute({
      workspaceId,
      persona: 'linker',
      feature: 'auto-tagging',
      targetId: artifactId,
      context,
    });
    const job = await aiJobRepository.findById(result.jobId);
    return { job: formatJob(job!), content: result.content };
  },

  async nudgeStaleThread(
    threadId: string,
    workspaceId: string,
  ): Promise<TriggerAiJobResponse> {
    const thread = await threadRepository.findById(threadId);
    if (!thread) throw new Error(`Thread not found: ${threadId}`);
    const context = await assembleResolutionPromptContext({
      id: thread.id,
      title: thread.title,
      type: thread.type,
      body: thread.body,
      created_at: thread.created_at,
      comment_count: thread.comment_count,
    });
    const execRunner = getRunner(workspaceId);
    const result = await execRunner.execute({
      workspaceId,
      persona: 'scribe',
      feature: 'thread-resolution-prompt',
      targetId: threadId,
      context,
    });
    await routeAndGetLocation({
      jobId: result.jobId,
      persona: 'scribe',
      feature: 'thread-resolution-prompt',
      targetId: threadId,
      content: result.content,
      workspaceId,
    });
    const job = await aiJobRepository.findById(result.jobId);
    return { job: formatJob(job!), content: result.content };
  },

  async triageObservations(
    threadId: string,
    workspaceId: string,
  ): Promise<TriggerAiJobResponse> {
    const context = await assembleObservationTriageContext(threadId);
    const execRunner = getRunner(workspaceId);
    const result = await execRunner.execute({
      workspaceId,
      persona: 'scribe',
      feature: 'observation-triage',
      targetId: threadId,
      context,
    });
    const postedTo = await routeAndGetLocation({
      jobId: result.jobId,
      persona: 'scribe',
      feature: 'observation-triage',
      targetId: threadId,
      content: result.content,
      workspaceId,
    });
    const job = await aiJobRepository.findById(result.jobId);
    return { job: formatJob(job!), content: result.content, posted_to: postedTo };
  },

  async detectContradictions(
    topicId: string,
    workspaceId: string,
  ): Promise<TriggerAiJobResponse> {
    const context = await assembleContradictionContext(topicId, workspaceId);
    const execRunner = getRunner(workspaceId);
    const result = await execRunner.execute({
      workspaceId,
      persona: 'critic',
      feature: 'contradiction-detection',
      targetId: topicId,
      context,
    });
    const postedTo = await routeAndGetLocation({
      jobId: result.jobId,
      persona: 'critic',
      feature: 'contradiction-detection',
      targetId: topicId,
      content: result.content,
      workspaceId,
    });
    const job = await aiJobRepository.findById(result.jobId);
    return { job: formatJob(job!), content: result.content, posted_to: postedTo };
  },

  async generateTopicSynthesis(
    topicId: string,
    workspaceId: string,
  ): Promise<TriggerAiJobResponse> {
    const context = await assembleTopicSynthesisContext(topicId, workspaceId);
    const execRunner = getRunner(workspaceId);
    const result = await execRunner.execute({
      workspaceId,
      persona: 'scribe',
      feature: 'topic-synthesis',
      targetId: topicId,
      context,
    });

    // Create an artifact with the synthesis (not posted to a thread)
    const topic = await topicRepository.findById(topicId);
    if (topic) {
      const principalId = (await getAnalystPrincipalId(workspaceId)) || workspaceId;
      await artifactRepository.create(
        workspaceId,
        principalId,
        {
          topic_id: topicId,
          title: `Topic Synthesis: ${topic.name}`,
          type: 'document',
          body: result.content,
          summary: `AI-generated narrative synthesis of the ${topic.name} topic knowledge arc.`,
          tags: ['ai-scribe', 'topic-synthesis'],
        },
      );
    }

    const job = await aiJobRepository.findById(result.jobId);
    return { job: formatJob(job!), content: result.content };
  },

  async generateTopicFields(
    description: string,
    workspaceId: string,
  ): Promise<{
    name: string;
    handle: string;
    icon: string;
    description: string;
    first_principles: string;
  }> {
    const apiKey = process.env.OPENAI_KEY;
    if (!apiKey) throw new Error('OPENAI_KEY environment variable not set');

    const provider = new OpenAIProvider(apiKey);

    // Get existing topic names to avoid duplicates
    const existingTopics = await topicRepository.findAll(workspaceId, { limit: 50 });
    const existingNames = existingTopics.map(t => `${t.name} (${t.handle})`).join(', ');

    const response = await provider.complete({
      model: 'gpt-5.2',
      system: `You generate structured topic metadata for a knowledge management system. Topics organize research, artifacts, and tasks by project.

Given a loose description, generate:
1. name: A concise display name (1-5 words)
2. handle: A URL-friendly slug (lowercase, hyphens, 3-64 chars, starts with letter)
3. icon: A single emoji
4. description: 1-3 sentence description of what this topic covers
5. first_principles: Markdown document (see detailed rules below)

RULES FOR first_principles — THIS IS THE MOST IMPORTANT FIELD:

## First Principles section
Write 3-6 numbered principles. Each starts with a bold key phrase. Rules:
- Write for a smart person who knows NOTHING about this domain. No jargon. No acronyms without expansion.
- Each principle must be a concrete decision rule, not an aspiration. BAD: "Prioritize robustness." GOOD: "Test every result on data the model has never seen. If performance drops more than 20%, reject it."
- If there's a common mistake or trap in this domain, name it explicitly. "Do NOT [common mistake] because [reason]."
- Keep each principle to 1-2 sentences. If it takes more, it's too vague.

## Success Criteria section
Write 3-6 numbered criteria. Rules:
- Every criterion must be pass/fail testable. A stranger should be able to read it and say "yes, this is met" or "no, it isn't" with no ambiguity.
- Include at least one criterion for PRACTICAL USE: "Produce a plain-English guide that a non-expert can follow to [use the findings / make decisions / take action]. The guide must include specific [thresholds / rules / steps / parameters] — not references to other documents."
- Where possible, include specific numbers or thresholds (even if approximate). BAD: "Good risk-adjusted returns." GOOD: "Risk-adjusted returns (Sharpe ratio) above 0.8 after accounting for trading costs."
- The LAST criterion should always be: can a human who reads ONLY the final output actually DO something with it? If not, the project hasn't succeeded regardless of how rigorous the research is.

BAD success criteria (too vague, unmeasurable):
- "Achieve good performance"
- "Demonstrate robustness"
- "Complete thorough analysis"

GOOD success criteria (specific, testable, action-oriented):
- "Out-of-sample Sharpe ratio exceeds buy-and-hold by at least 0.3 across 3+ market regimes"
- "A non-expert can follow the output rules to make daily decisions without reading any other document"
- "Single command reproduces all results from raw data with 0 test failures"

Existing topics (avoid duplicates): ${existingNames || 'none'}

Respond with ONLY a JSON object, no markdown fences:
{"name":"...","handle":"...","icon":"...","description":"...","first_principles":"..."}`,
      messages: [{ role: 'user', content: description }],
      max_tokens: 4000,
      reasoning: { effort: 'medium' },
    });

    try {
      const parsed = JSON.parse(response.content);
      return {
        name: String(parsed.name || '').slice(0, 255),
        handle: String(parsed.handle || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 64),
        icon: String(parsed.icon || '').slice(0, 4),
        description: String(parsed.description || '').slice(0, 20000),
        first_principles: String(parsed.first_principles || '').slice(0, 50000),
      };
    } catch {
      throw new Error('AI returned invalid JSON. Please try again.');
    }
  },

  async generateFirstPrinciplesQuestions(
    topicId: string,
    workspaceId: string,
  ): Promise<{
    questions: Array<{
      id: string;
      context: string;
      question: string;
      options: Array<{ label: string; description: string; value: string }>;
    }>;
  }> {
    const apiKey = process.env.OPENAI_KEY;
    if (!apiKey) throw new Error('OPENAI_KEY environment variable not set');

    const provider = new OpenAIProvider(apiKey);
    const context = await assembleFirstPrinciplesContext(topicId, workspaceId);

    const response = await provider.complete({
      model: 'gpt-5.2',
      system: `You generate strategic multiple-choice questions to help a human refine the guiding principles and success criteria for a project.

Given the topic context, generate exactly 3 questions. Each question has 3-4 options.

STRUCTURE — every question has THREE parts:
1. "context": 1-2 sentences of plain-English background. Summarize the relevant finding or tension. Translate ALL jargon and acronyms inline. Include specific numbers from the topic context. This is displayed as a gray blurb ABOVE the question.
2. "question": A short, clear question a non-expert could understand (max 15 words ideal, 25 words max). No acronyms. No jargon. This is the main text the human reads.
3. "options": Each option has a SHORT "label" (2-6 words, scannable at a glance) and a "description" (1 sentence explaining what this choice means and what you give up).

RULES FOR MAXIMUM INFORMATION GAIN:
- Each question should resolve a DIFFERENT strategic fork. Don't ask two questions about the same tension.
- Q1 and Q2 should probe the biggest unresolved trade-offs in the project (where evidence points in two directions, or where a choice was made but could be revisited).
- Q3 (the last question) MUST ask about practical use: "What should a human be able to DO with the final output?" Options should range from simple checklists to reference documents to decision frameworks.
- Options must represent genuinely different directions. A human should hesitate — if one option is obviously best, the question is bad.
- Put the most impactful/differentiating question first.

FORMAT RULES:
- Context: plain English, specific numbers, no jargon without inline explanation.
- Question: short and punchy. "What matters more — X or Y?" is ideal. NOT a paragraph.
- Option labels: 2-6 words. "Loss protection first" not "Switch to tail-risk gate as primary: require CED <= 0.70"
- Option descriptions: one sentence clarifying the trade-off.

BAD question:
  context: "" (missing)
  question: "Phase 3's vol-managed leverage gate FAILed on CAGR (-12.77% vs the -0.50% threshold) but PASSed on tail-risk (CED 0.320 vs 0.70). Given that evidence, which metric should be primary?" (too long, jargon-heavy)
  option label: "Keep CAGR gate as primary: require CAGR gap >= -0.50% even if CED stays strong (e.g., 0.320)." (too long, not scannable)

GOOD question:
  context: "Testing showed the strategy trails the market by 12.8% on returns, but cuts worst-case losses in half (loss score 0.32 vs 0.70 maximum)."
  question: "What matters more — keeping returns close to the market, or cutting losses?"
  option label: "Cut losses first"
  option description: "Accept trailing the market on returns as long as worst-case losses stay small."

Respond with ONLY a JSON object, no markdown fences:
{"questions":[{"id":"q1","context":"...","question":"...","options":[{"label":"...","description":"...","value":"..."},...]},...]}`  ,
      messages: [{ role: 'user', content: context }],
      max_tokens: 4000,
      reasoning: { effort: 'low' },
    });

    try {
      const parsed = JSON.parse(response.content);
      return {
        questions: (parsed.questions || []).slice(0, 4).map((q: any, i: number) => ({
          id: String(q.id || `q${i + 1}`),
          context: String(q.context || '').slice(0, 1000),
          question: String(q.question || '').slice(0, 1000),
          options: (q.options || []).slice(0, 5).map((o: any) => ({
            label: String(o.label || '').slice(0, 200),
            description: String(o.description || '').slice(0, 500),
            value: String(o.value || o.label || '').slice(0, 500),
          })),
        })),
      };
    } catch {
      throw new Error('AI returned invalid JSON for questions. Please try again.');
    }
  },

  async suggestFirstPrinciples(
    topicId: string,
    answers: Record<string, string>,
    workspaceId: string,
    additionalContext?: string,
  ): Promise<{
    current: string;
    suggested: string;
    diff_lines: Array<{ type: 'add' | 'remove' | 'context'; text: string }>;
  }> {
    const apiKey = process.env.OPENAI_KEY;
    if (!apiKey) throw new Error('OPENAI_KEY environment variable not set');

    const provider = new OpenAIProvider(apiKey);
    const context = await assembleFirstPrinciplesContext(topicId, workspaceId);
    const topic = await topicRepository.findById(topicId);
    const currentFP = topic?.first_principles || '';

    const answersBlock = Object.entries(answers)
      .map(([question, answer]) => `Q: ${question}\nA: ${answer}`)
      .join('\n\n');

    const additionalBlock = additionalContext?.trim()
      ? [``, `## Additional Context from User`, ``, additionalContext.trim()]
      : [];

    const userMessage = [
      context,
      '',
      '## User Priorities (from wizard questions)',
      '',
      answersBlock,
      ...additionalBlock,
      '',
      '## Current First Principles',
      '',
      currentFP || '(empty — no first principles defined yet)',
    ].join('\n');

    const response = await provider.complete({
      model: 'gpt-5.2',
      system: `You are rewriting the guiding principles and success criteria for a knowledge management topic. The user has answered strategic questions — use their answers to shape the output.

CRITICAL: Write for a smart person who knows NOTHING about this domain. No jargon. No acronyms without expansion. No room for misinterpretation. Every sentence should be immediately clear on first read.

Generate a markdown document with exactly two sections:

## First Principles
3-6 numbered items. Each starts with a **bold key phrase** followed by a concrete rule. Rules for writing these:
- Each principle is a DECISION RULE, not an aspiration. It tells you what to do when you face a choice.
  BAD: "Prioritize robustness over optimization."
  GOOD: "Test every claimed result on data the model hasn't seen. If out-of-sample performance drops more than 20% from in-sample, reject the approach."
- If there's a common trap or mistake, call it out: "Do NOT [thing] because [reason]."
- 1-2 sentences each. If you need more, the principle is too vague — make it more specific.
- Preserve principles from the current version that are already strong and specific. Improve vague ones.

## Success Criteria
3-6 numbered items. Rules:
- Every criterion MUST be pass/fail testable by a stranger. They should be able to say "yes met" or "no not met" with zero ambiguity.
- Include specific numbers or thresholds. BAD: "Good performance." GOOD: "Sharpe ratio above 0.8 after trading costs, measured over at least 3 years of out-of-sample data."
- MANDATORY: Include a "Practical Use" criterion (usually the last one). This criterion requires the project to produce output a non-expert can act on — specific rules, thresholds, steps, or a decision guide. Not a reference document — an action guide.
  Example: "Produce a plain-English rule set that tells a non-expert exactly what to do in each scenario, with specific numbers and thresholds. Someone reading only this guide should be able to make correct decisions without consulting any other document."
- Use the user's answers to calibrate ambition level, focus areas, and trade-off preferences.
- If the user indicated they want simple daily rules, make that a top-priority criterion, not an afterthought.

Also produce a line-by-line diff comparing current to suggested.
- Lines only in current → type "remove"
- Lines only in suggested → type "add"
- Lines similar in both → type "context"
- If current is empty, all suggested lines are "add"

Respond with ONLY a JSON object, no markdown fences:
{"suggested":"...the full markdown text...","diff_lines":[{"type":"add|remove|context","text":"..."},...]}`,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 8000,
      reasoning: { effort: 'medium' },
    });

    try {
      const parsed = JSON.parse(response.content);
      return {
        current: currentFP,
        suggested: String(parsed.suggested || '').slice(0, 50000),
        diff_lines: (parsed.diff_lines || []).map((line: any) => ({
          type: ['add', 'remove', 'context'].includes(line.type) ? line.type : 'context' as const,
          text: String(line.text || ''),
        })),
      };
    } catch {
      throw new Error('AI returned invalid JSON for suggestion. Please try again.');
    }
  },

  async detectStaleness(
    topicId: string,
    workspaceId: string,
  ): Promise<TriggerAiJobResponse> {
    const context = await assembleStalenessContext(topicId, workspaceId);
    const execRunner = getRunner(workspaceId);
    const result = await execRunner.execute({
      workspaceId,
      persona: 'scribe',
      feature: 'staleness-detection',
      targetId: topicId,
      context,
    });
    const postedTo = await routeAndGetLocation({
      jobId: result.jobId,
      persona: 'scribe',
      feature: 'staleness-detection',
      targetId: topicId,
      content: result.content,
      workspaceId,
    });
    const job = await aiJobRepository.findById(result.jobId);
    return { job: formatJob(job!), content: result.content, posted_to: postedTo };
  },

  async generatePlan(
    topicId: string,
    workspaceId: string,
    effort: 'standard' | 'deep' = 'standard',
  ): Promise<{ job: AiJob; content: string; thread_id: string }> {
    // Map user-facing effort to reasoning_effort + token budget
    // GPT-5.2 shares max_completion_tokens between reasoning + output.
    // High reasoning can consume 50K+ tokens, so Deep Think needs 128K headroom.
    const effortConfig = effort === 'deep'
      ? { reasoningEffort: 'high' as const, maxTokens: 128000 }
      : { reasoningEffort: 'medium' as const, maxTokens: 32000 };

    // 1. Fetch latest research for this topic (bridges research → plan)
    const latestResearchJob = await aiJobRepository.findLatestResearchByTarget(
      workspaceId, topicId
    );
    const researchOutput = latestResearchJob?.output as { content?: string } | null;
    const latestResearch = researchOutput?.content
      ? { content: researchOutput.content, created_at: latestResearchJob!.created_at.toISOString() }
      : null;

    // 1b. Fetch latest research critique (if Critic reviewed the research)
    const latestCritique = latestResearchJob
      ? await aiJobRepository.findLatestByFeatureAndTarget(
          workspaceId, 'research-critique', latestResearchJob.id
        )
      : null;
    const critiqueContent = (latestCritique?.output as { content?: string })?.content || null;
    if (!critiqueContent && latestResearchJob) {
      console.warn(
        `[generatePlan] Research critique not yet available for job ${latestResearchJob.id}. ` +
        `Plan will be generated without critic feedback.`
      );
    }

    // 2. Assemble plan-specific context (includes research + critique if available)
    const context = await assembleTopicPlanContext(topicId, workspaceId, latestResearch, critiqueContent);

    // 3. Execute via runner (planner persona, 'project-plan' feature)
    const execRunner = getRunner(workspaceId);
    const result = await execRunner.execute({
      workspaceId,
      persona: 'planner',
      feature: 'project-plan',
      targetId: topicId,
      context,
      reasoningEffort: effortConfig.reasoningEffort,
      maxTokens: effortConfig.maxTokens,
    });

    // 4. Archive any existing plan threads for this topic
    const existingThreads = await threadRepository.findAll(workspaceId, { limit: 10, topicId });
    const planThreads = existingThreads.filter(
      t => t.tags?.includes('project-plan') && t.status === 'open'
    );
    for (const pt of planThreads) {
      await threadRepository.update(pt.id, { status: 'archived' });
    }

    // 5. Create plan thread
    const topic = await topicRepository.findById(topicId);
    const principalId = (await getAnalystPrincipalId(workspaceId)) || workspaceId;
    const thread = await threadService.create(workspaceId, principalId, {
      topic_id: topicId,
      title: `Project Plan: ${topic!.name}`,
      type: 'discussion',
      body: result.content,
      summary: 'AI-generated project plan based on first principles and topic context.',
      tags: ['project-plan', 'ai-generated'],
    });

    // 6. Update AI job output to include thread_id for later retrieval
    // (The runner already stored { content } in output; merge thread_id into it)
    await aiJobRepository.updateStatus(result.jobId, 'completed', {
      output: { content: result.content, thread_id: thread.id },
    });

    const job = await aiJobRepository.findById(result.jobId);

    // Fire-and-forget: trigger Critic review of the plan
    const planJobId = result.jobId;
    const planThreadId = thread.id;
    setImmediate(async () => {
      try {
        await aiService.reviewPlan(planJobId, planThreadId, workspaceId);
        console.log(`Plan critique completed for job ${planJobId}`);
      } catch (err) {
        console.error('Plan critique failed (non-blocking):', err);
      }
    });

    // Fire-and-forget: refresh progress scorecard after plan generation
    setImmediate(async () => {
      try {
        await aiService.generateScorecard(topicId, workspaceId);
        console.log(`Progress scorecard refreshed after plan for topic ${topicId}`);
      } catch (err) {
        console.error('Scorecard refresh after plan failed (non-blocking):', err);
      }
    });

    return {
      job: formatJob(job!),
      content: result.content,
      thread_id: thread.id,
    };
  },

  async research(
    topicId: string,
    query: string,
    mode: 'gap-directed' | 'exploratory',
    workspaceId: string,
    autoPlan: boolean = false,
    planEffort: 'standard' | 'deep' = 'standard',
  ): Promise<TriggerAiJobResponse> {
    // 1. Fetch topic for context
    const topic = await topicRepository.findById(topicId);
    if (!topic) throw new Error(`Topic not found: ${topicId}`);

    // 2. Build shared context (topic info + prior research)
    const topicContextLines: string[] = [
      `## Research Request`,
      '',
      `**Topic:** ${topic.name} (${topic.handle})`,
      `**Mode:** ${mode}`,
      `**Query:** ${query}`,
      '',
    ];

    if (topic.first_principles) {
      topicContextLines.push(
        `## Topic First Principles`,
        '',
        topic.first_principles,
        '',
      );
    }

    if (topic.description) {
      topicContextLines.push(
        `## Topic Description`,
        '',
        topic.description,
        '',
      );
    }

    // Fetch prior research for this topic so the researcher can build on it
    const priorResearchJob = await aiJobRepository.findLatestResearchByTarget(
      workspaceId, topicId
    );
    const priorResearchOutput = priorResearchJob?.output as { content?: string } | null;
    const priorResearchLines: string[] = [];
    if (priorResearchOutput?.content) {
      const MAX_PRIOR_RESEARCH_CHARS = 8000;
      let priorContent = priorResearchOutput.content;
      if (priorContent.length > MAX_PRIOR_RESEARCH_CHARS) {
        priorContent = priorContent.slice(0, MAX_PRIOR_RESEARCH_CHARS) +
          '\n\n[... prior research truncated for context budget. Key sections above. ' +
          'Use cortex_search to retrieve specific findings if needed.]';
      }
      priorResearchLines.push(
        `## Prior Research Report (Summary)`,
        ``,
        `The following research report was produced on ${priorResearchJob!.created_at.toISOString()}. ` +
        `Do NOT repeat these findings verbatim. Instead: reference still-valid findings by number, ` +
        `focus on gaps and limitations the prior report identified, go deeper on topics it only mentioned ` +
        `in passing, and challenge or update findings where you find new evidence.`,
        ``,
        priorContent,
        ``,
      );
    }

    // Fetch the critique of the prior research
    const priorCritiqueLines: string[] = [];
    if (priorResearchJob) {
      const priorCritique = await aiJobRepository.findLatestByFeatureAndTarget(
        workspaceId, 'research-critique', priorResearchJob.id
      );
      const priorCritiqueContent = (priorCritique?.output as { content?: string })?.content;
      if (priorCritiqueContent) {
        const MAX_CRITIQUE_CHARS = 3000;
        let critiqueText = priorCritiqueContent;
        if (critiqueText.length > MAX_CRITIQUE_CHARS) {
          critiqueText = critiqueText.slice(0, MAX_CRITIQUE_CHARS) +
            '\n\n[... critique truncated for context budget.]';
        }
        priorCritiqueLines.push(
          `## Critic Review of Prior Research`,
          ``,
          `The Critic agent reviewed the above prior research and flagged these issues. ` +
          `Do NOT repeat the same patterns — particularly any tag inflation ` +
          `(findings tagged [APPLIED] that the Critic said should be [STANDARD]).`,
          ``,
          critiqueText,
          ``,
        );
      }
    }

    // Fetch scorecard progress indicators for prioritization
    const scorecardLines = await getScorecardProgressLines(workspaceId, topicId);

    const hasWebSearch = !!process.env.TAVILY_API_KEY;
    const agenticRunner = getAgenticRunner(workspaceId);

    // ── PASS 1: Discovery ─────────────────────────────────────────
    // Map the research landscape: internal knowledge + external source identification.
    // Uses all tools (including web_search). Output: structured source list.
    const discoveryContextLines = [
      ...topicContextLines,
      ...priorResearchLines,
      ...priorCritiqueLines,
      ...scorecardLines,
      `## Discovery Phase Instructions`,
      '',
      `Use your tools to search the Cortex knowledge base${hasWebSearch ? ' AND the internet' : ''} to map the research landscape.`,
      `Start with broad Cortex searches, then drill into specific artifacts and threads that look relevant.`,
      `Try multiple query terms to ensure thorough coverage.`,
      ...(hasWebSearch ? [
        '',
        `**IMPORTANT: You have web search tools (web_search, web_read).** After reviewing internal knowledge, ` +
        `use web_search extensively to find external research, papers, techniques, and innovations. ` +
        `Use web_read to quickly evaluate whether sources are worth a deep read — skim for methodology relevance. ` +
        `Your goal is to identify the BEST sources for the Synthesis Phase to read deeply.`,
      ] : []),
      '',
      mode === 'gap-directed'
        ? `Focus on finding knowledge related to the specific query above. Identify what's known, what's missing, and what evidence supports or contradicts existing approaches.${hasWebSearch ? ' Search externally for solutions to identified gaps.' : ''}`
        : `Cast a wide net. Look for patterns, approaches, and connections across the knowledge base that relate to this topic. Surface creative ideas, cross-domain connections, and approaches that top practitioners would consider.${hasWebSearch ? ' Use web search to find cutting-edge techniques and innovations from external sources.' : ''}`,
    ];

    const discoveryTools = [
      createCortexSearchTool(workspaceId),
      createCortexGetArtifactTool(workspaceId),
      createCortexGetThreadTool(workspaceId),
      ...(process.env.TAVILY_API_KEY ? [createWebSearchTool(), createWebReadTool()] : []),
    ];

    const discoveryResult = await agenticRunner.execute({
      workspaceId,
      persona: 'researcher',
      feature: 'research-discovery',
      targetId: topicId,
      context: discoveryContextLines.join('\n'),
      tools: discoveryTools,
      systemPromptOverride: DISCOVERY_SYSTEM_PROMPT,
      agenticConfig: { max_iterations: 8, trace: true },
    });

    console.log(`Discovery phase completed: job ${discoveryResult.jobId}, ${discoveryResult.iterations} iterations, ${discoveryResult.inputTokens + discoveryResult.outputTokens} tokens`);

    // ── Extract reading assignments from discovery output ──────────
    // Parse the discovery output for the "External Sources to Deep-Read" section.
    // Split into required (top 8, must-read) and optional (nice-to-have).
    const requiredAssignments: string[] = [];
    const optionalAssignments: string[] = [];
    const discoveryContent = discoveryResult.content;
    const sourceSectionMatch = discoveryContent.match(
      /##\s*External Sources to Deep[- ]Read([\s\S]*?)(?=\n##\s|\n---|\Z)/i,
    );
    if (sourceSectionMatch) {
      const sourceBlock = sourceSectionMatch[1];
      const entries = sourceBlock.split(/\n(?=\d+\.\s|\*\s|-\s)/).filter((e) => e.trim());
      let reqIdx = 1;
      let optIdx = 1;
      for (const entry of entries) {
        const urlMatch = entry.match(/https?:\/\/[^\s)>\]]+/);
        if (urlMatch) {
          const url = urlMatch[0].replace(/[.,;:]+$/, '');
          const lines = entry.trim().split('\n');
          const titleLine = lines[0]
            .replace(/^\d+\.\s*|\*\s*|-\s*/, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/, '$1')
            .trim();
          const extractLine = lines.find((l) => /what to extract|extract|why/i.test(l));
          const extractHint = extractLine
            ? extractLine.replace(/^[\s*-]*(?:what to extract|why)[:\s]*/i, '').trim()
            : '';

          // Check if discovery marked this as [OPTIONAL]; otherwise treat as required (up to cap of 8)
          const isOptional = /\[OPTIONAL\]/i.test(entry);
          const target = isOptional || reqIdx > 8 ? optionalAssignments : requiredAssignments;
          const idx = isOptional || reqIdx > 8 ? optIdx : reqIdx;

          target.push(
            `${idx}. **${titleLine || 'Source ' + idx}**`,
            `   URL: ${url}`,
            `   Action: web_read this URL. Extract: core method, parameters, results, limitations.`,
            ...(extractHint ? [`   Focus: ${extractHint}`] : []),
            '',
          );

          if (isOptional || reqIdx > 8) optIdx++;
          else reqIdx++;
        }
      }
    }

    // Fallback: if structured section parsing failed, extract all unique external URLs (cap required at 8)
    if (requiredAssignments.length === 0) {
      const allUrls = [
        ...new Set(
          (discoveryContent.match(/https?:\/\/[^\s)>\]]+/g) || []).map((u) =>
            u.replace(/[.,;:]+$/, ''),
          ),
        ),
      ];
      allUrls.forEach((url, i) => {
        const target = i < 8 ? requiredAssignments : optionalAssignments;
        const idx = i < 8 ? i + 1 : i - 7;
        target.push(
          `${idx}. URL: ${url}`,
          `   Action: web_read this URL. Extract: core method, parameters, results, limitations.`,
          '',
        );
      });
    }

    const readingAssignmentBlock =
      requiredAssignments.length > 0
        ? [
            `## ⚡ Required Reading Assignments (MUST READ)`,
            '',
            `Below are the highest-priority sources identified by the Discovery Phase.`,
            `You MUST web_read every one of these FIRST, before doing anything else.`,
            `Work through them systematically — read each one, extract implementation-level detail, then move to the next.`,
            '',
            ...requiredAssignments,
            ...(optionalAssignments.length > 0
              ? [
                  `## 📖 Optional Sources (read if time permits)`,
                  '',
                  `These additional sources were identified by Discovery but are lower priority.`,
                  `Read them after completing all required sources, if you have iterations remaining.`,
                  '',
                  ...optionalAssignments,
                ]
              : []),
          ]
        : [];

    // ── PASS 2: Deep Read & Synthesis ─────────────────────────────
    // Read assigned sources deeply, then creative exploration. Produce the full research report.
    const synthesisContextLines = [
      ...topicContextLines,
      ...readingAssignmentBlock,
      `## Discovery Phase Results`,
      '',
      `The Discovery Phase has already mapped the research landscape. Below are its findings.`,
      '',
      discoveryResult.content,
      '',
      ...priorResearchLines,
      ...priorCritiqueLines,
      `## Synthesis Phase Instructions`,
      '',
      `Produce the full research report using your standard output format.`,
      `Your workflow has two phases:`,
      '',
      `**Phase A — Required Reading (do this FIRST):**`,
      `web_read every URL in the Required Reading Assignments above. For each source:`,
      `1. Use web_read with a focused query parameter to extract the most relevant sections`,
      `2. Extract: core method (algorithm, parameters), key assumptions, reported results, limitations`,
      `3. Assess: how specifically would this apply to THIS project's constraints and data?`,
      `4. This level of detail is what earns [APPLIED] — not just noting a technique exists`,
      '',
      `**Phase B — Creative Exploration (after required reading is complete):**`,
      `Once you have read all required sources, you may use web_search to chase promising leads,`,
      `cross-domain connections, or questions that emerged during reading. This is your opportunity`,
      `to find non-obvious insights that the Discovery Phase may have missed.`,
      '',
      `For internal knowledge from the Discovery Phase, use cortex_get_artifact and cortex_get_thread to read full content.`,
      '',
      mode === 'gap-directed'
        ? `Focus on the specific query. Use the Discovery Phase sources to build deep, evidence-backed findings.`
        : `Use the Discovery Phase sources to build creative, well-evidenced findings with cross-domain connections.`,
    ];

    // Pass 2 tools: cortex + web_read + web_search (search restored for creative exploration)
    const synthesisTools = [
      createCortexSearchTool(workspaceId),
      createCortexGetArtifactTool(workspaceId),
      createCortexGetThreadTool(workspaceId),
      ...(process.env.TAVILY_API_KEY ? [createWebSearchTool(), createWebReadTool()] : []),
    ];

    const synthesisResult = await agenticRunner.execute({
      workspaceId,
      persona: 'researcher',
      feature: 'research-synthesis',
      targetId: topicId,
      context: synthesisContextLines.join('\n'),
      parentJobId: discoveryResult.jobId,
      tools: synthesisTools,
      agenticConfig: { max_iterations: 12, trace: true },
    });

    console.log(`Synthesis phase completed: job ${synthesisResult.jobId}, ${synthesisResult.iterations} iterations, ${synthesisResult.inputTokens + synthesisResult.outputTokens} tokens`);

    const job = await aiJobRepository.findById(synthesisResult.jobId);

    // Fire-and-forget: trigger Critic review of the synthesis output
    const researchJobId = synthesisResult.jobId;
    setImmediate(async () => {
      try {
        await aiService.reviewResearch(researchJobId, workspaceId);
        console.log(`Research critique completed for job ${researchJobId}`);
      } catch (err) {
        console.error('Research critique failed (non-blocking):', err);
      }
    });

    if (autoPlan) {
      // Auto-chain: research → plan → (plan already fires scorecard + critique)
      console.log(`Auto-plan enabled for topic ${topicId}, chaining generatePlan (effort: ${planEffort})`);
      setImmediate(async () => {
        try {
          await aiService.generatePlan(topicId, workspaceId, planEffort);
          console.log(`Auto-plan completed for topic ${topicId}`);
        } catch (err) {
          console.error('Auto-plan failed (non-blocking):', err);
        }
      });
    } else {
      // Standalone research: just refresh scorecard
      setImmediate(async () => {
        try {
          await aiService.generateScorecard(topicId, workspaceId);
          console.log(`Progress scorecard refreshed after research for topic ${topicId}`);
        } catch (err) {
          console.error('Scorecard refresh after research failed (non-blocking):', err);
        }
      });
    }

    return {
      job: formatJob(job!),
      content: synthesisResult.content,
    };
  },

  async reviewResearch(
    researchJobId: string,
    workspaceId: string,
  ): Promise<TriggerAiJobResponse> {
    // 1. Fetch the research job (retry with backoff in case DB write hasn't committed)
    let researchJob = await aiJobRepository.findById(researchJobId);
    for (let attempt = 0; attempt < 3; attempt++) {
      if ((researchJob?.output as { content?: string })?.content) break;
      await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt)));
      researchJob = await aiJobRepository.findById(researchJobId);
    }
    if (!researchJob) throw new Error(`Research job not found: ${researchJobId}`);
    const researchContent = (researchJob.output as { content?: string })?.content;
    if (!researchContent) throw new Error('Research job has no content');

    // 2. Fetch topic for first principles context
    const topicId = (researchJob.input as { targetId?: string })?.targetId;
    const topic = topicId ? await topicRepository.findById(topicId) : null;

    // 3. Assemble critique context with domain-specific guidance
    const contextLines: string[] = [
      `You are reviewing a **research report** produced by the Researcher agent.`,
      ``,
      `Evaluate it with your standard framework (Completeness, Consistency, Epistemic Quality)`,
      `but pay special attention to:`,
      `- Are innovation tags ([STANDARD], [APPLIED], [NOVEL], [CONTRARIAN]) correctly applied?`,
      `  [NOVEL] surprise test: would a 10-year domain expert say "huh, I hadn't considered that"?`,
      `  If not, it's not [NOVEL].`,
      `  [APPLIED] adaptation test: does the finding describe a concrete analytical adaptation`,
      `  (a specific modification for this project's constraints/data), or is it just`,
      `  "technique X exists and could work here"? If no adaptation step is described, it's [STANDARD].`,
      `- Is the Quantitative Sanity Check arithmetic sound? Do the numbers add up?`,
      `- Does the Strategic Assessment follow logically from the findings?`,
      `- Is the [CONTRARIAN] finding actually challenging the project's own approach,`,
      `  or is it attacking a strawman nobody was going to use?`,
      `- Are there claims presented as findings that are really just search result summaries`,
      `  without enough depth (the "depth mandate" requires 2+ tool calls per [NOVEL]/[APPLIED])?`,
      ``,
    ];

    if (topic?.first_principles) {
      contextLines.push(
        `## Topic First Principles (success criteria the research should serve)`,
        ``, topic.first_principles, ``,
      );
    }

    contextLines.push(
      `## Research Report to Review`,
      ``,
      researchContent,
    );

    const context = contextLines.join('\n');

    // 4. Execute Critic
    const execRunner = getRunner(workspaceId);
    const result = await execRunner.execute({
      workspaceId,
      persona: 'critic',
      feature: 'research-critique',
      targetId: researchJobId,
      context,
    });

    const job = await aiJobRepository.findById(result.jobId);
    return { job: formatJob(job!), content: result.content };
  },

  async reviewPlan(
    planJobId: string,
    planThreadId: string,
    workspaceId: string,
  ): Promise<TriggerAiJobResponse> {
    // 1. Fetch the plan job (retry with backoff in case DB write hasn't committed)
    let planJob = await aiJobRepository.findById(planJobId);
    for (let attempt = 0; attempt < 3; attempt++) {
      if ((planJob?.output as { content?: string })?.content) break;
      await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt)));
      planJob = await aiJobRepository.findById(planJobId);
    }
    if (!planJob) throw new Error(`Plan job not found: ${planJobId}`);
    const planContent = (planJob.output as { content?: string })?.content;
    if (!planContent) throw new Error('Plan job has no content');

    // 2. Fetch topic + latest research for cross-reference
    const topicId = (planJob.input as { targetId?: string })?.targetId;
    const topic = topicId ? await topicRepository.findById(topicId) : null;
    const latestResearch = topicId
      ? await aiJobRepository.findLatestResearchByTarget(workspaceId, topicId)
      : null;
    const researchContent = (latestResearch?.output as { content?: string })?.content;

    // 3. Assemble critique context with plan-specific guidance
    const contextLines: string[] = [
      `You are reviewing a **project plan** produced by the Planner agent.`,
      ``,
      `Evaluate it with your standard framework but pay special attention to:`,
      `- Does the Arithmetic Gate math actually add up? Are baseline + technique estimates`,
      `  consistent with go/no-go gate thresholds?`,
      `- Are go/no-go gates genuinely numeric and falsifiable, or are they vague?`,
      `- Does every phase reference specific research findings (by number/tag)?`,
      `- Is the [HIGH-VARIANCE] experiment genuinely creative (>40% failure chance),`,
      `  or is it just a slightly different version of a safe experiment?`,
      `- Are the pivot paths creative reimaginings, or just "do a simpler version"?`,
      `- Is the Overfitting Protocol realistic given the parameter count?`,
      `- Does the plan confront the biggest threat identified in the Strategic Assessment,`,
      `  or does it defer it to a later phase?`,
      ``,
    ];

    if (topic?.first_principles) {
      contextLines.push(
        `## Topic First Principles`, ``, topic.first_principles, ``,
      );
    }

    if (researchContent) {
      // Truncate research to key sections for cross-reference
      const truncated = researchContent.length > 6000
        ? researchContent.slice(0, 6000) + '\n\n[...truncated]'
        : researchContent;
      contextLines.push(
        `## Research Report (for cross-reference)`, ``, truncated, ``,
      );
    }

    contextLines.push(`## Project Plan to Review`, ``, planContent);
    const context = contextLines.join('\n');

    // 4. Execute Critic
    const execRunner = getRunner(workspaceId);
    const result = await execRunner.execute({
      workspaceId,
      persona: 'critic',
      feature: 'plan-critique',
      targetId: planJobId,
      context,
    });

    // 5. Post critique as comment on plan thread (visible to user)
    // Note: comment_count is auto-incremented by DB trigger on comment INSERT
    const principalId = await getAnalystPrincipalId(workspaceId);
    if (principalId && planThreadId) {
      await commentRepository.create(planThreadId, principalId, {
        type: 'observation',
        body: `## Critic Review\n\n${result.content}`,
        tags: ['ai-critic', 'plan-critique'],
      });
    }

    const job = await aiJobRepository.findById(result.jobId);
    return { job: formatJob(job!), content: result.content };
  },

  async generateScorecard(
    topicId: string,
    workspaceId: string,
  ): Promise<{ job: AiJob; scorecard: any }> {
    const apiKey = process.env.OPENAI_KEY;
    if (!apiKey) throw new Error('OPENAI_KEY environment variable not set');

    const context = await assembleProgressScorecardContext(topicId, workspaceId);

    // Create ai_job record manually (not using runner, since this is a lightweight direct call)
    const { id: jobId } = await aiJobRepository.create({
      workspaceId,
      persona: 'scribe',
      feature: 'progress-scorecard',
      jobInput: { targetId: topicId },
      depth: 0,
    });
    await aiJobRepository.updateStatus(jobId, 'running', { startedAt: new Date() });

    try {
      const provider = new OpenAIProvider(apiKey);
      const response = await provider.complete({
        model: 'gpt-5.2',
        system: `You are a plain-language progress evaluator. Your audience is a non-technical domain expert — someone who understands the concepts but not jargon.

You will receive a topic's First Principles & Success Criteria, plus evidence from research, plans, completed work, and open tasks.

Your job: evaluate progress toward each Success Criterion listed in the first principles.

RULES:
1. ONE bullet per Success Criterion. If the first principles list 3 success criteria, you produce exactly 3 criteria entries.
2. Each assessment must be 1-2 sentences of plain, honest language. Say what was tried, what worked, what didn't. Use concrete numbers from the evidence when available.
3. Closeness indicator per criterion — pick exactly one: NOT_STARTED, EARLY, MAKING_PROGRESS, NEARLY_THERE, ACHIEVED, BLOCKED
4. An overall summary: 1 sentence gut-feel + overall closeness indicator.
5. If a previous scorecard is provided, include a delta_note (1 sentence on what changed). Otherwise delta_note is null.
6. Do NOT use jargon, Greek letters, or formula notation. Translate everything into plain English.
7. Be honest. If evidence is thin, say so. If the project is stuck, say so.
8. Include a "bottom_line" field. THIS IS THE MOST IMPORTANT FIELD. Write it for a human who has NOT read ANY artifacts and wants to know: "What can I actually do RIGHT NOW with what we've learned?" Be ruthlessly practical:
   - If something is usable today, give SPECIFIC step-by-step instructions: "When X happens, do Y. When Z happens, do W." Use plain numbers, thresholds, and actions — not references to prototypes or artifact names.
   - If it's not usable yet, say exactly what's missing in one sentence.
   - End with the single most important next step.
   - NO jargon, NO prototype names (translate them), NO "the research shows..." — just tell the human what to do as if you're giving them a cheat sheet they can tape to their monitor.
9. Include a "practical_wins" array. For EACH criterion at MAKING_PROGRESS, NEARLY_THERE, or ACHIEVED, extract specific validated findings a human can use TODAY. Each win object has:
   - "criterion": which success criterion this belongs to
   - "win": one-sentence plain-English description of what was validated
   - "how_to_use": array of 2-5 step-by-step instructions written for someone who knows NOTHING about this project. CRITICAL RULES for how_to_use:
     * Include the ACTUAL numbers, thresholds, parameters, and rules from the artifact content provided. You have the full artifact text — use it.
     * If there's a table of states/transitions/rules, reproduce the key rows inline (e.g., "When market shifts from State A to State B, reduce exposure by 50%")
     * If there are specific parameter values, write them out (e.g., "Set period to 28, smoothing factor to 7, and multiplier to 0.8")
     * NEVER say "check the rules" or "look up the transition" or "apply the trend check from the rules" — instead WRITE OUT what the rule or check actually says
     * NEVER reference artifact names, document titles, or internal terminology the human wouldn't know
     * Use plain English a non-expert would understand. Translate all jargon.
   - "confidence": "high", "medium", or "low"
   Skip criteria at NOT_STARTED, EARLY, or BLOCKED — they have no wins. If no wins exist at all, use an empty array.

Respond with ONLY a JSON object, no markdown fences:
{"bottom_line":"<practical takeaway>","practical_wins":[{"criterion":"<name>","win":"<what was validated>","how_to_use":["Step 1...","Step 2..."],"confidence":"high|medium|low"}],"criteria":[{"name":"<criterion name>","assessment":"<plain language>","closeness":"<indicator>"}],"overall":{"assessment":"<1 sentence>","closeness":"<indicator>"},"delta_note":<string or null>}`,
        messages: [{ role: 'user', content: context }],
        max_tokens: 8000,
        reasoning: { effort: 'medium' },
      });

      const scorecard = JSON.parse(response.content);

      // Validate structure minimally
      if (!scorecard.criteria || !Array.isArray(scorecard.criteria) || !scorecard.overall) {
        throw new Error('Invalid scorecard structure');
      }

      await aiJobRepository.updateStatus(jobId, 'completed', {
        output: { scorecard },
        tokensUsed: (response.input_tokens || 0) + (response.output_tokens || 0),
        completedAt: new Date(),
      });

      // Auto-convergence check (fire-and-forget)
      setImmediate(async () => {
        try {
          const topic = await topicRepository.findById(topicId);
          if (!topic || topic.lifecycle_state !== 'exploring') return;
          const settings = topic.settings as Record<string, unknown> | null;
          if (!settings?.auto_converge) return;

          const criteria = scorecard.criteria as Array<{ closeness: string }>;
          const total = criteria.length;
          if (total === 0) return;
          const met = criteria.filter(c =>
            c.closeness === 'NEARLY_THERE' || c.closeness === 'ACHIEVED'
          ).length;
          if (met / total >= 0.5) {
            await topicRepository.update(topicId, { lifecycle_state: 'converging' });
            console.log(`Auto-converged topic ${topicId}: ${met}/${total} criteria met`);
          }
        } catch (err) {
          console.error('Auto-convergence check failed:', err);
        }
      });

      const job = await aiJobRepository.findById(jobId);
      return { job: formatJob(job!), scorecard };
    } catch (err) {
      await aiJobRepository.updateStatus(jobId, 'failed', {
        output: { error: (err as Error).message },
      });
      throw err;
    }
  },

  async generateConclusion(
    topicId: string,
    workspaceId: string,
  ): Promise<{ job: AiJob; conclusion: string }> {
    const apiKey = process.env.OPENAI_KEY;
    if (!apiKey) throw new Error('OPENAI_KEY environment variable not set');

    const context = await assembleConclusionContext(topicId, workspaceId);

    // Create ai_job record
    const { id: jobId } = await aiJobRepository.create({
      workspaceId,
      persona: 'scribe',
      feature: 'conclusion',
      jobInput: { targetId: topicId },
      depth: 0,
    });
    await aiJobRepository.updateStatus(jobId, 'running', { startedAt: new Date() });

    try {
      const provider = new OpenAIProvider(apiKey);
      const response = await provider.complete({
        model: 'gpt-5.2',
        system: `You are a conclusion synthesizer. Your job is to produce the definitive, actionable summary of a research topic — the document a domain expert tapes to their monitor and uses every day.

CRITICAL PRINCIPLE: Every finding must be presented so a human can ACT on it without reading anything else. No "see artifact X" — spell it out right here. Use tables for multi-item data. Use numbered steps for procedures. Use plain English always.

You will receive a topic's first principles, success criteria, research, plans, scorecard, artifacts, and completed work. Synthesize everything into a practical conclusion.

OUTPUT FORMAT (use these exact markdown headers):

## Executive Summary
2-3 sentences. What did this project find? What's the verdict?

## Practical Playbook
THIS IS THE MOST IMPORTANT SECTION. Organized by use case or scenario.
- For each validated finding, give step-by-step instructions a human can follow
- Use markdown tables for parameters, thresholds, states, or rules (e.g., "| Condition | Action | Confidence |")
- Use numbered lists for procedures
- Include actual numbers, thresholds, and conditions — not references to other documents
- If something requires a tool or calculation, say exactly how to do it
- Group related items under sub-headings (### When to..., ### How to..., ### Parameters)

## Key Conclusions
Numbered list. Each conclusion is a concrete answer or validated finding. Map each to the success criterion it addresses. Be specific — "X works when Y > Z" not "X shows promise."

## What Worked
Bullet list of validated approaches. For each: what it is, when to use it, and the key parameters. Use a table if there are 3+ items with comparable attributes.

## What Failed
Bullet list of dead ends. Keep brief: what, why it failed, when (if ever) to revisit.

## Open Questions
Anything unresolved. Be honest about gaps. Prioritize by impact.

## Quick Reference Card
A compressed "cheat sheet" version of the Practical Playbook. Maximum 10 bullet points. Each bullet is one actionable rule in the form: "When [condition], do [action]" or "[Parameter]: [value/range]". This is what gets taped to the monitor.

RULES:
1. Be concrete and specific. No vague platitudes. Use actual numbers from the evidence.
2. Write in plain English — no jargon, no Greek letters, no formula notation. Translate everything: "Frobenius norm" → "the matrix distance measure", "alpha" → "excess return".
3. The Practical Playbook and Quick Reference Card are the two most important sections. A human should be able to read ONLY those two sections and know exactly what to do.
4. Use markdown tables whenever presenting 3+ items with comparable attributes (parameters, rules, states, conditions).
5. Be honest about what the evidence does and doesn't support.
6. If the project hasn't reached conclusive answers, say so clearly — don't force conclusions.
7. Every claim must be traceable to evidence. Say "Research found X" or "Backtest showed Y" — but spell out X and Y, don't just reference document titles.`,
        messages: [{ role: 'user', content: context }],
        max_tokens: 8000,
        reasoning: { effort: 'medium' },
      });

      const conclusion = response.content;

      // Store result
      await aiJobRepository.updateStatus(jobId, 'completed', {
        output: { content: conclusion },
        tokensUsed: (response.input_tokens || 0) + (response.output_tokens || 0),
        completedAt: new Date(),
      });

      // Create conclusion artifact
      const topic = await topicRepository.findById(topicId);
      if (topic) {
        try {
          const principalId = (await getAnalystPrincipalId(workspaceId)) || workspaceId;
          const artifact = await artifactRepository.create(workspaceId, principalId, {
            topic_id: topicId,
            title: `Conclusion: ${topic.name}`,
            type: 'document',
            body: conclusion,
            summary: `AI-generated conclusion and practical playbook for ${topic.name}`,
            tags: ['conclusion', 'cross-project', 'ai-generated'],
          });
          // Auto-accept since this is an agent artifact
          await artifactRepository.updateStatus(artifact.id, 'accepted', principalId);
        } catch (artifactErr) {
          console.error('Failed to create conclusion artifact (non-blocking):', artifactErr);
        }

        // Transition topic to concluded
        try {
          await topicRepository.update(topicId, { lifecycle_state: 'concluded' });
        } catch (stateErr) {
          console.error('Failed to update lifecycle state (non-blocking):', stateErr);
        }
      }

      const job = await aiJobRepository.findById(jobId);
      return { job: formatJob(job!), conclusion };
    } catch (err) {
      await aiJobRepository.updateStatus(jobId, 'failed', {
        output: { error: (err as Error).message },
      });
      throw err;
    }
  },
};
