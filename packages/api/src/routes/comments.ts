import type { FastifyInstance } from 'fastify';
import { createCommentSchema, updateCommentSchema, paginationSchema } from '@cortex/shared';
import { commentService } from '../services/comment.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireContributor } from '../middleware/authorize.js';

export async function commentsRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authenticate);

  // GET /threads/:threadId/comments - List comments for a thread
  app.get('/threads/:threadId/comments', async (request, reply) => {
    const { threadId } = request.params as { threadId: string };
    const query = paginationSchema.parse(request.query);

    const result = await commentService.listByThread(threadId, {
      limit: query.limit,
      cursor: query.cursor,
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

  // POST /threads/:threadId/comments - Create comment (requires contributor)
  app.post('/threads/:threadId/comments', { preHandler: [requireContributor] }, async (request, reply) => {
    const { threadId } = request.params as { threadId: string };
    const input = createCommentSchema.parse(request.body);
    const comment = await commentService.create(threadId, request.user!.sub, input);

    reply.status(201);
    return {
      data: comment,
      meta: { request_id: request.id },
    };
  });

  // PATCH /comments/:id - Update comment (requires contributor)
  app.patch('/comments/:id', { preHandler: [requireContributor] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = updateCommentSchema.parse(request.body);
    const comment = await commentService.update(id, input);

    return {
      data: comment,
      meta: { request_id: request.id },
    };
  });

  // DELETE /comments/:id - Delete comment (requires contributor)
  app.delete('/comments/:id', { preHandler: [requireContributor] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await commentService.delete(id);

    return {
      data: { deleted: true },
      meta: { request_id: request.id },
    };
  });
}
