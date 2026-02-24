import type { FastifyInstance } from 'fastify';
import { searchSchema } from '@cortex/shared';
import { searchService } from '../services/search.service.js';
import { authenticate } from '../middleware/authenticate.js';

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authenticate);

  // GET /search - Full-text search
  app.get('/', async (request, reply) => {
    const query = searchSchema.parse(request.query);

    const tags = query.tags ? query.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : undefined;

    const results = await searchService.search(request.user!.workspace_id, {
      query: query.q,
      type: query.type,
      topicId: query.topic_id,
      status: query.status,
      tags,
      creatorKind: query.creator_kind,
      limit: query.limit,
    });

    return {
      data: results,
      meta: {
        request_id: request.id,
        query: query.q,
        count: results.length,
      },
    };
  });

  // GET /search/suggestions - Autocomplete suggestions
  app.get('/suggestions', async (request, reply) => {
    const { q } = request.query as { q: string };

    if (!q || q.length < 2) {
      return {
        data: [],
        meta: { request_id: request.id },
      };
    }

    const suggestions = await searchService.suggestions(request.user!.workspace_id, q);

    return {
      data: suggestions,
      meta: { request_id: request.id },
    };
  });
}
