import type { FastifyInstance } from 'fastify';
import { createEventsSchema, eventsSummaryQuerySchema } from '@cortex/shared';
import { activityEventService } from '../services/activity-event.service.js';
import { authenticate } from '../middleware/authenticate.js';

export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // POST /events — Record activity events (batch)
  app.post('/', async (request, reply) => {
    const { events } = createEventsSchema.parse(request.body);
    const user = request.user!;

    const source = user.kind === 'agent' ? 'agent' : 'human';

    await activityEventService.recordEvents(
      user.workspace_id,
      user.sub,
      source as 'human' | 'agent',
      events,
    );

    reply.status(201);
    return { data: { recorded: events.length }, meta: { request_id: request.id } };
  });

  // GET /events/summary — Aggregated event summary
  app.get('/summary', async (request, reply) => {
    const { days } = eventsSummaryQuerySchema.parse(request.query);

    const summary = await activityEventService.getSummary(request.user!.workspace_id, days);

    return { data: summary, meta: { request_id: request.id } };
  });
}
