import type { FastifyInstance } from 'fastify';
import { createKnowledgeLinkSchema, AppError } from '@cortex/shared';
import { knowledgeLinkRepository } from '../repositories/knowledge-link.repository.js';
import { artifactRepository } from '../repositories/artifact.repository.js';
import { auditLogRepository } from '../repositories/audit-log.repository.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireContributor } from '../middleware/authorize.js';

export async function knowledgeLinksRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // POST /knowledge-links — Create a relationship between two artifacts
  app.post('/', { preHandler: [requireContributor] }, async (request, reply) => {
    const input = createKnowledgeLinkSchema.parse(request.body);

    // Validate both artifacts exist and are in the same workspace
    const source = await artifactRepository.findById(input.source_id);
    if (!source) throw AppError.notFound('Source artifact');
    const target = await artifactRepository.findById(input.target_id);
    if (!target) throw AppError.notFound('Target artifact');
    if (source.workspace_id !== target.workspace_id) {
      throw AppError.validation('Artifacts must be in the same workspace');
    }

    let link;
    try {
      link = await knowledgeLinkRepository.create(
        input.source_id, input.target_id, input.link_type, request.user!.sub
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('no_self_link')) {
        throw AppError.validation('An artifact cannot link to itself');
      }
      if (message.includes('unique') || message.includes('duplicate')) {
        throw AppError.validation('This link already exists');
      }
      throw err;
    }

    // Fire-and-forget audit log
    auditLogRepository.create(
      request.user!.workspace_id, request.user!.sub,
      'knowledge_link.created', 'knowledge_link', link.id,
      { after: { source_id: input.source_id, target_id: input.target_id, link_type: input.link_type } }
    ).catch(err => console.error('Audit log error:', err));

    reply.status(201);
    return {
      data: link,
      meta: { request_id: request.id },
    };
  });

  // GET /knowledge-links — List links (optional filter by artifact)
  app.get('/', async (request, reply) => {
    const { artifact_id } = request.query as { artifact_id?: string };
    if (!artifact_id) {
      throw AppError.validation('artifact_id query parameter is required');
    }

    const links = await knowledgeLinkRepository.findByArtifact(artifact_id);
    const superseder = await knowledgeLinkRepository.findSuperseder(artifact_id);

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

  // DELETE /knowledge-links/:id — Remove a link
  app.delete('/:id', { preHandler: [requireContributor] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await knowledgeLinkRepository.delete(id);
    if (!deleted) {
      throw AppError.notFound('Knowledge link');
    }

    return {
      data: { deleted: true },
      meta: { request_id: request.id },
    };
  });
}
