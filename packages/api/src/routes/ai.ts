import type { FastifyInstance } from 'fastify';
import { aiJobsQuerySchema, aiUsageQuerySchema, updateAiConfigSchema, triggerAiJobSchema, generateBriefingSchema, askCortexSchema, generatePlanSchema, researchSchema, firstPrinciplesQuestionsSchema, firstPrinciplesSuggestSchema, generateScorecardSchema, generateConclusionSchema } from '@cortex/shared';
import { aiService } from '../services/ai.service.js';
import db from '../db/index.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/authorize.js';
import type { AiPersona, AiJobStatus } from '@cortex/shared';

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authenticate);

  // GET /ai/team - Team dashboard composite endpoint
  app.get('/team', async (request) => {
    const team = await aiService.getTeam(request.user!.workspace_id);
    return {
      data: team,
      meta: { request_id: request.id },
    };
  });

  // POST /ai/jobs - Trigger an AI agent manually
  app.post('/jobs', async (request, reply) => {
    const input = triggerAiJobSchema.parse(request.body);
    try {
      const result = await aiService.triggerJob(
        input.persona as AiPersona,
        input.target_id,
        request.user!.workspace_id,
      );
      reply.status(201);
      return {
        data: result,
        meta: { request_id: request.id },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Return structured errors for known failure modes
      if (message.includes('Blocked:') || message.includes('Circuit breaker')) {
        reply.status(429);
        return {
          error: { code: 'AI_BLOCKED', message },
          meta: { request_id: request.id },
        };
      }
      if (message.includes('not found')) {
        reply.status(404);
        return {
          error: { code: 'NOT_FOUND', message },
          meta: { request_id: request.id },
        };
      }
      throw error;
    }
  });

  // GET /ai/jobs - List AI jobs
  app.get('/jobs', async (request) => {
    const query = aiJobsQuerySchema.parse(request.query);
    const result = await aiService.listJobs(request.user!.workspace_id, {
      limit: query.limit,
      cursor: query.cursor,
      persona: query.persona as AiPersona | undefined,
      status: query.status as AiJobStatus | undefined,
      feature: query.feature,
    });

    return {
      data: result.items,
      meta: {
        request_id: request.id,
        has_more: result.hasMore,
        next_cursor: result.nextCursor,
      },
    };
  });

  // GET /ai/jobs/:id - Get single AI job
  app.get('/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await aiService.getJob(id);

    if (!job) {
      reply.status(404);
      return {
        error: { code: 'NOT_FOUND', message: 'AI job not found' },
        meta: { request_id: request.id },
      };
    }

    return {
      data: job,
      meta: { request_id: request.id },
    };
  });

  // GET /ai/usage - Usage statistics
  app.get('/usage', async (request) => {
    const query = aiUsageQuerySchema.parse(request.query);
    const stats = await aiService.getUsageStats(
      request.user!.workspace_id,
      query.days,
      query.persona as AiPersona | undefined
    );

    return {
      data: stats,
      meta: { request_id: request.id },
    };
  });

  // GET /ai/config - Get workspace AI config
  app.get('/config', async (request) => {
    const config = await aiService.getConfig(request.user!.workspace_id);

    return {
      data: config,
      meta: { request_id: request.id },
    };
  });

  // GET /ai/digest/latest - Get most recent daily digest
  app.get('/digest/latest', async (request, reply) => {
    const jobs = await aiService.listJobs(request.user!.workspace_id, {
      limit: 1,
      feature: 'daily-digest',
    });

    if (jobs.items.length === 0) {
      reply.status(404);
      return {
        error: { code: 'NOT_FOUND', message: 'No digest generated yet' },
        meta: { request_id: request.id },
      };
    }

    return {
      data: jobs.items[0],
      meta: { request_id: request.id },
    };
  });

  // POST /ai/digest/generate - Manually trigger a daily digest
  app.post('/digest/generate', async (request, reply) => {
    try {
      const result = await aiService.triggerJob(
        'scribe' as AiPersona,
        request.user!.workspace_id,
        request.user!.workspace_id,
        { feature: 'daily-digest', targetType: 'workspace' },
      );
      reply.status(201);
      return {
        data: result,
        meta: { request_id: request.id },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Blocked:') || message.includes('Circuit breaker')) {
        reply.status(429);
        return {
          error: { code: 'AI_BLOCKED', message },
          meta: { request_id: request.id },
        };
      }
      throw error;
    }
  });

  // POST /ai/briefing - Generate a topic briefing
  app.post('/briefing', async (request, reply) => {
    const input = generateBriefingSchema.parse(request.body);
    try {
      const result = await aiService.generateBriefing(
        input.topic_id,
        request.user!.workspace_id,
        input.task_description,
      );
      reply.status(201);
      return {
        data: result,
        meta: { request_id: request.id },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Blocked:') || message.includes('Circuit breaker')) {
        reply.status(429);
        return {
          error: { code: 'AI_BLOCKED', message },
          meta: { request_id: request.id },
        };
      }
      if (message.includes('not found')) {
        reply.status(404);
        return {
          error: { code: 'NOT_FOUND', message },
          meta: { request_id: request.id },
        };
      }
      throw error;
    }
  });

  // GET /ai/briefing/latest - Get most recent briefing for a topic
  app.get('/briefing/latest', async (request, reply) => {
    const { topic_id } = request.query as { topic_id?: string };
    if (!topic_id) {
      reply.status(400);
      return {
        error: { code: 'MISSING_PARAM', message: 'topic_id query parameter is required' },
        meta: { request_id: request.id },
      };
    }

    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM ai_jobs
       WHERE workspace_id = $1 AND feature = 'briefing' AND status = 'completed'
         AND input->>'targetId' = $2
       ORDER BY created_at DESC LIMIT 1`,
      [request.user!.workspace_id, topic_id],
    );

    if (rows.length === 0) {
      reply.status(404);
      return {
        error: { code: 'NOT_FOUND', message: 'No briefing generated for this topic yet' },
        meta: { request_id: request.id },
      };
    }

    const job = await aiService.getJob(rows[0].id);
    return {
      data: job,
      meta: { request_id: request.id },
    };
  });

  // POST /ai/plan - Generate a project plan thread
  app.post('/plan', async (request, reply) => {
    const input = generatePlanSchema.parse(request.body);
    try {
      const result = await aiService.generatePlan(
        input.topic_id,
        request.user!.workspace_id,
        input.effort,
      );
      reply.status(201);
      return {
        data: result,
        meta: { request_id: request.id },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Blocked:') || message.includes('Circuit breaker')) {
        reply.status(429);
        return {
          error: { code: 'AI_BLOCKED', message },
          meta: { request_id: request.id },
        };
      }
      if (message.includes('not found')) {
        reply.status(404);
        return {
          error: { code: 'NOT_FOUND', message },
          meta: { request_id: request.id },
        };
      }
      throw error;
    }
  });

  // GET /ai/plan/latest - Get most recent plan for a topic
  app.get('/plan/latest', async (request, reply) => {
    const { topic_id } = request.query as { topic_id?: string };
    if (!topic_id) {
      reply.status(400);
      return {
        error: { code: 'MISSING_PARAM', message: 'topic_id query parameter is required' },
        meta: { request_id: request.id },
      };
    }

    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM ai_jobs
       WHERE workspace_id = $1 AND feature = 'project-plan' AND status = 'completed'
         AND input->>'targetId' = $2
       ORDER BY created_at DESC LIMIT 1`,
      [request.user!.workspace_id, topic_id],
    );

    if (rows.length === 0) {
      reply.status(404);
      return {
        error: { code: 'NOT_FOUND', message: 'No plan generated for this topic yet' },
        meta: { request_id: request.id },
      };
    }

    const job = await aiService.getJob(rows[0].id);
    return {
      data: job,
      meta: { request_id: request.id },
    };
  });

  // POST /ai/ask - Ask Cortex Q&A
  app.post('/ask', async (request, reply) => {
    const input = askCortexSchema.parse(request.body);
    try {
      const result = await aiService.askCortex(
        input.query,
        request.user!.workspace_id,
        input.topic_id,
      );
      reply.status(201);
      return {
        data: result,
        meta: { request_id: request.id },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Blocked:') || message.includes('Circuit breaker')) {
        reply.status(429);
        return {
          error: { code: 'AI_BLOCKED', message },
          meta: { request_id: request.id },
        };
      }
      throw error;
    }
  });

  // POST /ai/triage - Triage observations in a thread
  app.post('/triage', async (request, reply) => {
    const { thread_id } = request.body as { thread_id: string };
    if (!thread_id) {
      reply.status(400);
      return {
        error: { code: 'MISSING_PARAM', message: 'thread_id is required' },
        meta: { request_id: request.id },
      };
    }
    try {
      const result = await aiService.triageObservations(thread_id, request.user!.workspace_id);
      reply.status(201);
      return {
        data: result,
        meta: { request_id: request.id },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Blocked:') || message.includes('Circuit breaker')) {
        reply.status(429);
        return { error: { code: 'AI_BLOCKED', message }, meta: { request_id: request.id } };
      }
      if (message.includes('not found')) {
        reply.status(404);
        return { error: { code: 'NOT_FOUND', message }, meta: { request_id: request.id } };
      }
      throw error;
    }
  });

  // POST /ai/contradictions - Detect contradictions in a topic
  app.post('/contradictions', async (request, reply) => {
    const { topic_id } = request.body as { topic_id: string };
    if (!topic_id) {
      reply.status(400);
      return {
        error: { code: 'MISSING_PARAM', message: 'topic_id is required' },
        meta: { request_id: request.id },
      };
    }
    try {
      const result = await aiService.detectContradictions(topic_id, request.user!.workspace_id);
      reply.status(201);
      return {
        data: result,
        meta: { request_id: request.id },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Blocked:') || message.includes('Circuit breaker')) {
        reply.status(429);
        return { error: { code: 'AI_BLOCKED', message }, meta: { request_id: request.id } };
      }
      if (message.includes('not found')) {
        reply.status(404);
        return { error: { code: 'NOT_FOUND', message }, meta: { request_id: request.id } };
      }
      throw error;
    }
  });

  // POST /ai/synthesis - Generate topic synthesis
  app.post('/synthesis', async (request, reply) => {
    const { topic_id } = request.body as { topic_id: string };
    if (!topic_id) {
      reply.status(400);
      return {
        error: { code: 'MISSING_PARAM', message: 'topic_id is required' },
        meta: { request_id: request.id },
      };
    }
    try {
      const result = await aiService.generateTopicSynthesis(topic_id, request.user!.workspace_id);
      reply.status(201);
      return {
        data: result,
        meta: { request_id: request.id },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Blocked:') || message.includes('Circuit breaker')) {
        reply.status(429);
        return { error: { code: 'AI_BLOCKED', message }, meta: { request_id: request.id } };
      }
      if (message.includes('not found')) {
        reply.status(404);
        return { error: { code: 'NOT_FOUND', message }, meta: { request_id: request.id } };
      }
      throw error;
    }
  });

  // POST /ai/staleness - Detect stale artifacts in a topic
  app.post('/staleness', async (request, reply) => {
    const { topic_id } = request.body as { topic_id: string };
    if (!topic_id) {
      reply.status(400);
      return {
        error: { code: 'MISSING_PARAM', message: 'topic_id is required' },
        meta: { request_id: request.id },
      };
    }
    try {
      const result = await aiService.detectStaleness(topic_id, request.user!.workspace_id);
      reply.status(201);
      return {
        data: result,
        meta: { request_id: request.id },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Blocked:') || message.includes('Circuit breaker')) {
        reply.status(429);
        return { error: { code: 'AI_BLOCKED', message }, meta: { request_id: request.id } };
      }
      if (message.includes('not found')) {
        reply.status(404);
        return { error: { code: 'NOT_FOUND', message }, meta: { request_id: request.id } };
      }
      throw error;
    }
  });

  // POST /ai/generate-topic - Generate topic fields from a loose description
  app.post('/generate-topic', async (request, reply) => {
    const { description } = request.body as { description?: string };
    if (!description || typeof description !== 'string' || description.trim().length < 3) {
      reply.status(400);
      return {
        error: { code: 'MISSING_PARAM', message: 'description (min 3 chars) is required' },
        meta: { request_id: request.id },
      };
    }
    try {
      const result = await aiService.generateTopicFields(description.trim(), request.user!.workspace_id);
      return {
        data: result,
        meta: { request_id: request.id },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Blocked:') || message.includes('Circuit breaker')) {
        reply.status(429);
        return { error: { code: 'AI_BLOCKED', message }, meta: { request_id: request.id } };
      }
      throw error;
    }
  });

  // POST /ai/first-principles/questions - Generate wizard questions
  app.post('/first-principles/questions', async (request, reply) => {
    const input = firstPrinciplesQuestionsSchema.parse(request.body);
    try {
      const result = await aiService.generateFirstPrinciplesQuestions(
        input.topic_id,
        request.user!.workspace_id,
      );
      return { data: result, meta: { request_id: request.id } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Blocked:') || message.includes('Circuit breaker')) {
        reply.status(429);
        return { error: { code: 'AI_BLOCKED', message }, meta: { request_id: request.id } };
      }
      if (message.includes('not found')) {
        reply.status(404);
        return { error: { code: 'NOT_FOUND', message }, meta: { request_id: request.id } };
      }
      throw error;
    }
  });

  // POST /ai/first-principles/suggest - Generate first principles suggestion with diff
  app.post('/first-principles/suggest', async (request, reply) => {
    const input = firstPrinciplesSuggestSchema.parse(request.body);
    try {
      const result = await aiService.suggestFirstPrinciples(
        input.topic_id,
        input.answers,
        request.user!.workspace_id,
        input.additional_context,
      );
      return { data: result, meta: { request_id: request.id } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Blocked:') || message.includes('Circuit breaker')) {
        reply.status(429);
        return { error: { code: 'AI_BLOCKED', message }, meta: { request_id: request.id } };
      }
      if (message.includes('not found')) {
        reply.status(404);
        return { error: { code: 'NOT_FOUND', message }, meta: { request_id: request.id } };
      }
      throw error;
    }
  });

  // POST /ai/research - Trigger research on a topic
  app.post('/research', async (request, reply) => {
    const input = researchSchema.parse(request.body);
    try {
      const result = await aiService.research(
        input.topic_id,
        input.query,
        input.mode,
        request.user!.workspace_id,
        input.auto_plan,
        input.plan_effort,
      );
      reply.status(201);
      return {
        data: result,
        meta: { request_id: request.id },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Blocked:') || message.includes('Circuit breaker')) {
        reply.status(429);
        return { error: { code: 'AI_BLOCKED', message }, meta: { request_id: request.id } };
      }
      if (message.includes('not found')) {
        reply.status(404);
        return { error: { code: 'NOT_FOUND', message }, meta: { request_id: request.id } };
      }
      throw error;
    }
  });

  // GET /ai/research/latest - Get most recent research job for a topic
  app.get('/research/latest', async (request, reply) => {
    const { topic_id } = request.query as { topic_id?: string };
    if (!topic_id) {
      reply.status(400);
      return {
        error: { code: 'MISSING_PARAM', message: 'topic_id query parameter is required' },
        meta: { request_id: request.id },
      };
    }

    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM ai_jobs
       WHERE workspace_id = $1 AND feature IN ('research', 'research-synthesis') AND status = 'completed'
         AND input->>'targetId' = $2
       ORDER BY created_at DESC LIMIT 1`,
      [request.user!.workspace_id, topic_id],
    );

    if (rows.length === 0) {
      reply.status(404);
      return {
        error: { code: 'NOT_FOUND', message: 'No research completed for this topic yet' },
        meta: { request_id: request.id },
      };
    }

    const job = await aiService.getJob(rows[0].id);
    return {
      data: job,
      meta: { request_id: request.id },
    };
  });

  // GET /ai/research/phase - Get current research phase for a topic (for stepper polling)
  app.get('/research/phase', async (request, reply) => {
    const { topic_id } = request.query as { topic_id?: string };
    if (!topic_id) {
      reply.status(400);
      return {
        error: { code: 'MISSING_PARAM', message: 'topic_id query parameter is required' },
        meta: { request_id: request.id },
      };
    }

    const { rows } = await db.query<{ feature: string; status: string; created_at: Date }>(
      `SELECT feature, status, created_at FROM ai_jobs
       WHERE workspace_id = $1 AND input->>'targetId' = $2
         AND feature IN ('research-discovery', 'research-synthesis')
       ORDER BY created_at DESC LIMIT 1`,
      [request.user!.workspace_id, topic_id],
    );

    let phase: 'idle' | 'discovery' | 'synthesis' | 'complete' = 'idle';
    if (rows.length > 0) {
      const latest = rows[0];
      if (latest.feature === 'research-synthesis') {
        phase = latest.status === 'running' ? 'synthesis' : latest.status === 'completed' ? 'complete' : 'idle';
      } else if (latest.feature === 'research-discovery') {
        phase = latest.status === 'running' ? 'discovery' : latest.status === 'completed' ? 'synthesis' : 'idle';
      }
    }

    return {
      data: { phase },
      meta: { request_id: request.id },
    };
  });

  // POST /ai/cancel - Cancel running jobs for a topic
  app.post('/cancel', async (request, reply) => {
    const { topic_id } = request.body as { topic_id?: string };
    if (!topic_id) {
      reply.status(400);
      return {
        error: { code: 'MISSING_PARAM', message: 'topic_id is required' },
        meta: { request_id: request.id },
      };
    }

    const { rowCount } = await db.query(
      `UPDATE ai_jobs SET status = 'failed', output = jsonb_build_object('error', 'Cancelled by user')
       WHERE workspace_id = $1 AND input->>'targetId' = $2 AND status IN ('running', 'pending')`,
      [request.user!.workspace_id, topic_id],
    );

    return {
      data: { cancelled: rowCount || 0 },
      meta: { request_id: request.id },
    };
  });

  // POST /ai/scorecard - Generate progress scorecard for a topic
  app.post('/scorecard', async (request, reply) => {
    const input = generateScorecardSchema.parse(request.body);
    try {
      const result = await aiService.generateScorecard(
        input.topic_id,
        request.user!.workspace_id,
      );
      reply.status(201);
      return {
        data: result,
        meta: { request_id: request.id },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Blocked:') || message.includes('Circuit breaker')) {
        reply.status(429);
        return { error: { code: 'AI_BLOCKED', message }, meta: { request_id: request.id } };
      }
      if (message.includes('not found')) {
        reply.status(404);
        return { error: { code: 'NOT_FOUND', message }, meta: { request_id: request.id } };
      }
      throw error;
    }
  });

  // GET /ai/scorecard/latest - Get most recent scorecard for a topic
  app.get('/scorecard/latest', async (request, reply) => {
    const { topic_id } = request.query as { topic_id?: string };
    if (!topic_id) {
      reply.status(400);
      return {
        error: { code: 'MISSING_PARAM', message: 'topic_id query parameter is required' },
        meta: { request_id: request.id },
      };
    }

    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM ai_jobs
       WHERE workspace_id = $1 AND feature = 'progress-scorecard' AND status = 'completed'
         AND input->>'targetId' = $2
       ORDER BY created_at DESC LIMIT 1`,
      [request.user!.workspace_id, topic_id],
    );

    if (rows.length === 0) {
      reply.status(404);
      return {
        error: { code: 'NOT_FOUND', message: 'No scorecard generated for this topic yet' },
        meta: { request_id: request.id },
      };
    }

    const job = await aiService.getJob(rows[0].id);
    return {
      data: job,
      meta: { request_id: request.id },
    };
  });

  // POST /ai/conclusion - Generate conclusion for a topic (admin only)
  app.post('/conclusion', { preHandler: [requireAdmin] }, async (request, reply) => {
    const input = generateConclusionSchema.parse(request.body);
    try {
      const result = await aiService.generateConclusion(
        input.topic_id,
        request.user!.workspace_id,
      );
      reply.status(201);
      return {
        data: result,
        meta: { request_id: request.id },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Blocked:') || message.includes('Circuit breaker')) {
        reply.status(429);
        return { error: { code: 'AI_BLOCKED', message }, meta: { request_id: request.id } };
      }
      if (message.includes('not found')) {
        reply.status(404);
        return { error: { code: 'NOT_FOUND', message }, meta: { request_id: request.id } };
      }
      throw error;
    }
  });

  // GET /ai/conclusion/latest - Get most recent conclusion for a topic
  app.get('/conclusion/latest', async (request, reply) => {
    const { topic_id } = request.query as { topic_id?: string };
    if (!topic_id) {
      reply.status(400);
      return {
        error: { code: 'MISSING_PARAM', message: 'topic_id query parameter is required' },
        meta: { request_id: request.id },
      };
    }

    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM ai_jobs
       WHERE workspace_id = $1 AND feature = 'conclusion' AND status = 'completed'
         AND input->>'targetId' = $2
       ORDER BY created_at DESC LIMIT 1`,
      [request.user!.workspace_id, topic_id],
    );

    if (rows.length === 0) {
      reply.status(404);
      return {
        error: { code: 'NOT_FOUND', message: 'No conclusion generated for this topic yet' },
        meta: { request_id: request.id },
      };
    }

    const job = await aiService.getJob(rows[0].id);
    return {
      data: job,
      meta: { request_id: request.id },
    };
  });

  // PATCH /ai/config - Update workspace AI config (admin only)
  app.patch('/config', { preHandler: [requireAdmin] }, async (request) => {
    const input = updateAiConfigSchema.parse(request.body);
    const config = await aiService.updateConfig(request.user!.workspace_id, input);

    return {
      data: config,
      meta: { request_id: request.id },
    };
  });
}
