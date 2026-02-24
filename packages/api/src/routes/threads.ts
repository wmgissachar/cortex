import type { FastifyInstance } from 'fastify';
import { createThreadSchema, updateThreadSchema, paginationSchema, uuidSchema, sessionAuditSchema } from '@cortex/shared';
import { threadService } from '../services/thread.service.js';
import { auditLogRepository } from '../repositories/audit-log.repository.js';
import { auditSession } from '../services/session-audit.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireContributor } from '../middleware/authorize.js';

export async function threadsRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authenticate);

  // GET /threads - List threads
  app.get('/', async (request, reply) => {
    const query = paginationSchema.parse(request.query);
    const { topic_id, status } = request.query as { topic_id?: string; status?: string };

    const result = await threadService.list(request.user!.workspace_id, {
      limit: query.limit,
      cursor: query.cursor,
      topicId: topic_id,
      status,
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

  // GET /threads/:id - Get thread by ID
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const thread = await threadService.getById(id);

    return {
      data: thread,
      meta: { request_id: request.id },
    };
  });

  // POST /threads - Create thread (requires contributor)
  app.post('/', { preHandler: [requireContributor] }, async (request, reply) => {
    const input = createThreadSchema.parse(request.body);
    const thread = await threadService.create(
      request.user!.workspace_id,
      request.user!.sub,
      input
    );

    reply.status(201);
    return {
      data: thread,
      meta: { request_id: request.id },
    };
  });

  // PATCH /threads/:id - Update thread (requires contributor)
  app.patch('/:id', { preHandler: [requireContributor] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = updateThreadSchema.parse(request.body);
    const thread = await threadService.update(id, input, request.user!.sub);

    return {
      data: thread,
      meta: { request_id: request.id },
    };
  });

  // DELETE /threads/:id - Delete thread (requires contributor)
  app.delete('/:id', { preHandler: [requireContributor] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await threadService.delete(id);

    return {
      data: { deleted: true },
      meta: { request_id: request.id },
    };
  });

  // GET /threads/:id/audit-logs - Get audit history for a thread
  app.get('/:id/audit-logs', async (request, reply) => {
    const { id } = request.params as { id: string };
    const logs = await auditLogRepository.findByEntity('thread', id);

    return {
      data: logs,
      meta: { request_id: request.id },
    };
  });

  // GET /threads/:id/session-audit - Audit session documentation quality
  app.get('/:id/session-audit', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { topic_id } = sessionAuditSchema.parse(request.query);
    const result = await auditSession(id, topic_id, request.user!.workspace_id);

    return {
      data: result,
      meta: { request_id: request.id },
    };
  });
}
