import type { FastifyInstance } from 'fastify';
import { dashboardRepository } from '../repositories/dashboard.repository.js';
import { authenticate } from '../middleware/authenticate.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // GET /dashboard - Get dashboard overview
  app.get('/', async (request, reply) => {
    const workspaceId = request.user!.workspace_id;
    const principalId = request.user!.sub;
    const { since: sinceParam } = request.query as { since?: string };

    // Determine the "since" timestamp
    let since: Date;
    if (sinceParam) {
      since = new Date(sinceParam);
      if (isNaN(since.getTime())) {
        return reply.status(400).send({
          error: { message: 'Invalid since parameter. Use ISO 8601 format.' },
        });
      }
    } else {
      const lastSeen = await dashboardRepository.getLastSeenAt(principalId);
      since = lastSeen || new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago fallback
    }

    const [summary, needsAttention, recentCompletions, health] = await Promise.all([
      dashboardRepository.getSummary(workspaceId, since),
      dashboardRepository.getNeedsAttention(workspaceId, since),
      dashboardRepository.getRecentCompletions(workspaceId, since),
      dashboardRepository.getKnowledgeBaseHealth(workspaceId),
    ]);

    return {
      data: {
        since: since.toISOString(),
        summary,
        needs_attention: needsAttention,
        recent_completions: recentCompletions,
        knowledge_base_health: health,
      },
      meta: { request_id: request.id },
    };
  });

  // POST /dashboard/mark-reviewed - Update last_seen_at
  app.post('/mark-reviewed', async (request, reply) => {
    await dashboardRepository.markReviewed(request.user!.sub);

    return {
      data: { marked_at: new Date().toISOString() },
      meta: { request_id: request.id },
    };
  });
}
