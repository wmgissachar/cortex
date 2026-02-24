import type { FastifyInstance } from 'fastify';
import { activityService } from '../services/activity.service.js';
import { authenticate } from '../middleware/authenticate.js';

export async function activityRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // GET /activity - Recent activity feed with optional filters
  app.get('/', async (request, reply) => {
    const { limit, type, topic_id, offset } = request.query as {
      limit?: string;
      type?: string;
      topic_id?: string;
      offset?: string;
    };

    const parsedLimit = Math.min(parseInt(limit || '20', 10) || 20, 50);
    const parsedOffset = parseInt(offset || '0', 10) || 0;

    const result = await activityService.getRecent(request.user!.workspace_id, {
      limit: parsedLimit,
      offset: parsedOffset,
      type: type || undefined,
      topic_id: topic_id || undefined,
    });

    return {
      data: result.items,
      meta: {
        request_id: request.id,
        has_more: result.has_more,
        offset: parsedOffset,
        limit: parsedLimit,
      },
    };
  });
}
