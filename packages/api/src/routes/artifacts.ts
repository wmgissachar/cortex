import type { FastifyInstance } from 'fastify';
import { createArtifactSchema, updateArtifactSchema, paginationSchema } from '@cortex/shared';
import { artifactService } from '../services/artifact.service.js';
import { knowledgeLinkRepository } from '../repositories/knowledge-link.repository.js';
import { auditLogRepository } from '../repositories/audit-log.repository.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireContributor, requireAdmin } from '../middleware/authorize.js';

export async function artifactsRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook('preHandler', authenticate);

  // GET /artifacts - List artifacts
  app.get('/', async (request, reply) => {
    const query = paginationSchema.parse(request.query);
    const { topic_id, status, type } = request.query as {
      topic_id?: string;
      status?: string;
      type?: string;
    };

    const result = await artifactService.list(request.user!.workspace_id, {
      limit: query.limit,
      cursor: query.cursor,
      topicId: topic_id,
      status,
      type,
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

  // GET /artifacts/:id - Get artifact by ID
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const artifact = await artifactService.getById(id);

    return {
      data: artifact,
      meta: { request_id: request.id },
    };
  });

  // POST /artifacts - Create artifact (requires contributor)
  app.post('/', { preHandler: [requireContributor] }, async (request, reply) => {
    const input = createArtifactSchema.parse(request.body);
    const artifact = await artifactService.create(
      request.user!.workspace_id,
      request.user!.sub,
      input,
      request.user!.kind
    );

    reply.status(201);
    return {
      data: artifact,
      meta: { request_id: request.id },
    };
  });

  // PATCH /artifacts/:id - Update artifact (requires contributor, only drafts)
  app.patch('/:id', { preHandler: [requireContributor] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = updateArtifactSchema.parse(request.body);
    const artifact = await artifactService.update(id, request.user!.sub, input);

    return {
      data: artifact,
      meta: { request_id: request.id },
    };
  });

  // POST /artifacts/:id/propose - Submit for review (requires contributor)
  app.post('/:id/propose', { preHandler: [requireContributor] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const artifact = await artifactService.propose(id, request.user!.sub);

    return {
      data: artifact,
      meta: { request_id: request.id },
    };
  });

  // POST /artifacts/:id/accept - Accept artifact (requires admin)
  app.post('/:id/accept', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const artifact = await artifactService.accept(id, request.user!.sub);

    return {
      data: artifact,
      meta: { request_id: request.id },
    };
  });

  // POST /artifacts/:id/deprecate - Deprecate artifact (requires admin)
  app.post('/:id/deprecate', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const artifact = await artifactService.deprecate(id, request.user!.sub);

    return {
      data: artifact,
      meta: { request_id: request.id },
    };
  });

  // GET /artifacts/:id/links - Get knowledge links for an artifact
  app.get('/:id/links', async (request, reply) => {
    const { id } = request.params as { id: string };
    const links = await knowledgeLinkRepository.findByArtifact(id);
    const superseder = await knowledgeLinkRepository.findSuperseder(id);

    return {
      data: {
        links,
        superseded_by: superseder ? {
          id: superseder.source_id,
          title: superseder.source_title,
          status: superseder.source_status,
          link_id: superseder.id,
        } : null,
      },
      meta: { request_id: request.id },
    };
  });

  // GET /artifacts/:id/audit-logs - Get audit history for an artifact
  app.get('/:id/audit-logs', async (request, reply) => {
    const { id } = request.params as { id: string };
    const logs = await auditLogRepository.findByEntity('artifact', id);

    return {
      data: logs,
      meta: { request_id: request.id },
    };
  });
}
