import type { FastifyInstance } from 'fastify';
import { createTopicSchema, updateTopicSchema, paginationSchema, TrustTier, AppError } from '@cortex/shared';
import { topicService } from '../services/topic.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireContributor } from '../middleware/authorize.js';

export async function topicsRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authenticate);

  // GET /topics - List topics
  app.get('/', async (request, reply) => {
    const query = paginationSchema.parse(request.query);
    const includeArchived = (request.query as { include_archived?: string }).include_archived === 'true';

    const result = await topicService.list(request.user!.workspace_id, {
      limit: query.limit,
      cursor: query.cursor,
      includeArchived,
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

  // GET /topics/:id - Get topic by ID
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const topic = await topicService.getById(id);

    return {
      data: topic,
      meta: { request_id: request.id },
    };
  });

  // POST /topics - Create topic (requires contributor)
  app.post('/', { preHandler: [requireContributor] }, async (request, reply) => {
    const input = createTopicSchema.parse(request.body);
    const topic = await topicService.create(
      request.user!.workspace_id,
      request.user!.sub,
      input
    );

    reply.status(201);
    return {
      data: topic,
      meta: { request_id: request.id },
    };
  });

  // GET /topics/:id/tags - Get tags in use for this topic
  app.get('/:id/tags', async (request, reply) => {
    const { id } = request.params as { id: string };
    const tags = await topicService.getTagsInUse(id);

    return {
      data: tags,
      meta: { request_id: request.id },
    };
  });

  // PATCH /topics/:id - Update topic (requires contributor; archiving requires admin)
  app.patch('/:id', { preHandler: [requireContributor] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = updateTopicSchema.parse(request.body);
    if (input.archived !== undefined && request.user!.tier < TrustTier.ADMIN) {
      throw AppError.forbidden('Only admins can archive or unarchive topics');
    }
    if (input.lifecycle_state !== undefined && request.user!.tier < TrustTier.ADMIN) {
      throw AppError.forbidden('Only admins can change topic lifecycle state');
    }
    if (input.settings !== undefined && request.user!.tier < TrustTier.ADMIN) {
      throw AppError.forbidden('Only admins can change topic settings');
    }
    const topic = await topicService.update(id, input);

    return {
      data: topic,
      meta: { request_id: request.id },
    };
  });
}
