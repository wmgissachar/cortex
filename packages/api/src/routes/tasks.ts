import type { FastifyInstance } from 'fastify';
import { createTaskSchema, updateTaskSchema, paginationSchema } from '@cortex/shared';
import { taskService } from '../services/task.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireContributor } from '../middleware/authorize.js';

export async function tasksRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authenticate);

  // GET /tasks - List tasks
  app.get('/', async (request, reply) => {
    const query = paginationSchema.parse(request.query);
    const { status, assignee_id } = request.query as { status?: string; assignee_id?: string };

    const result = await taskService.list(request.user!.workspace_id, {
      limit: query.limit,
      cursor: query.cursor,
      status,
      assigneeId: assignee_id,
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

  // GET /tasks/:id - Get task by ID
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await taskService.getById(id);

    return {
      data: task,
      meta: { request_id: request.id },
    };
  });

  // POST /tasks - Create task (requires contributor)
  app.post('/', { preHandler: [requireContributor] }, async (request, reply) => {
    const input = createTaskSchema.parse(request.body);
    const task = await taskService.create(
      request.user!.workspace_id,
      request.user!.sub,
      input
    );

    reply.status(201);
    return {
      data: task,
      meta: { request_id: request.id },
    };
  });

  // PATCH /tasks/:id - Update task (requires contributor)
  app.patch('/:id', { preHandler: [requireContributor] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = updateTaskSchema.parse(request.body);
    const task = await taskService.update(id, input, request.user!.sub);

    return {
      data: task,
      meta: { request_id: request.id },
    };
  });

  // DELETE /tasks/:id - Delete task (requires contributor)
  app.delete('/:id', { preHandler: [requireContributor] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await taskService.delete(id);

    return {
      data: { deleted: true },
      meta: { request_id: request.id },
    };
  });
}
