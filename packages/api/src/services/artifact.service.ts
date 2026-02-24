import { AppError, type CreateArtifactInput, type UpdateArtifactInput, type ArtifactWithCreator, type PrincipalKind } from '@cortex/shared';
import { artifactRepository } from '../repositories/artifact.repository.js';
import { topicRepository } from '../repositories/topic.repository.js';
import { threadRepository } from '../repositories/thread.repository.js';
import { auditLogRepository } from '../repositories/audit-log.repository.js';
import { buildPaginatedResponse, type PaginatedResult } from '../utils/pagination.js';
import { containsSecret } from '../utils/secret-detector.js';
import { eventBus } from '../utils/event-bus.js';

function formatArtifactWithCreator(row: {
  id: string;
  workspace_id: string;
  topic_id: string;
  thread_id: string | null;
  title: string;
  type: string;
  status: string;
  body: string;
  summary: string | null;
  tags: string[];
  references: unknown[];
  version: number;
  created_at: Date;
  created_by: string;
  updated_at: Date;
  accepted_at: Date | null;
  accepted_by: string | null;
  creator_id: string;
  creator_handle: string;
  creator_display_name: string;
  topic_handle: string;
  topic_name: string;
}): ArtifactWithCreator {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    topic_id: row.topic_id,
    thread_id: row.thread_id,
    title: row.title,
    type: row.type as ArtifactWithCreator['type'],
    status: row.status as ArtifactWithCreator['status'],
    body: row.body,
    summary: row.summary,
    tags: row.tags,
    references: row.references as ArtifactWithCreator['references'],
    version: row.version,
    created_at: row.created_at,
    created_by: row.created_by,
    updated_at: row.updated_at,
    accepted_at: row.accepted_at,
    accepted_by: row.accepted_by,
    creator: {
      id: row.creator_id,
      handle: row.creator_handle,
      display_name: row.creator_display_name,
    },
    topic: {
      id: row.topic_id,
      handle: row.topic_handle,
      name: row.topic_name,
    },
  };
}

export const artifactService = {
  async list(
    workspaceId: string,
    options: {
      limit: number;
      cursor?: string;
      topicId?: string;
      status?: string;
      type?: string;
    }
  ): Promise<PaginatedResult<ArtifactWithCreator>> {
    const artifacts = await artifactRepository.findAll(workspaceId, options);
    const formatted = artifacts.map(formatArtifactWithCreator);
    return buildPaginatedResponse(formatted, options.limit);
  },

  async getById(id: string): Promise<ArtifactWithCreator> {
    const artifact = await artifactRepository.findById(id);
    if (!artifact) {
      throw AppError.notFound('Artifact');
    }
    return formatArtifactWithCreator(artifact);
  },

  async create(
    workspaceId: string,
    createdBy: string,
    input: CreateArtifactInput,
    creatorKind?: PrincipalKind
  ): Promise<ArtifactWithCreator> {
    // Verify topic exists and is not archived
    const topic = await topicRepository.findById(input.topic_id);
    if (!topic || topic.workspace_id !== workspaceId) {
      throw AppError.notFound('Topic');
    }
    if (topic.archived_at) {
      throw AppError.validation('Cannot create content in an archived topic');
    }

    // Check for secrets
    if (containsSecret(input.body)) {
      throw AppError.contentBlocked('Content contains potential secrets');
    }

    // Auto-create a discussion thread for this artifact
    const discussionThread = await threadRepository.create(workspaceId, createdBy, {
      topic_id: input.topic_id,
      title: `Discussion: ${input.title}`,
      type: 'discussion',
    });

    const artifact = await artifactRepository.create(workspaceId, createdBy, input, discussionThread.id);

    // Auto-accept artifacts created by agents
    if (creatorKind === 'agent') {
      await artifactRepository.updateStatus(artifact.id, 'accepted', createdBy);
    }

    // Fire-and-forget audit log
    auditLogRepository.create(
      workspaceId, createdBy, 'artifact.created', 'artifact', artifact.id,
      { after: { title: input.title, type: input.type, status: creatorKind === 'agent' ? 'accepted' : 'draft' } }
    ).catch(err => console.error('Audit log error:', err));

    // Emit event for AI layer
    eventBus.emitEvent('artifact.created', {
      artifactId: artifact.id,
      workspaceId: workspaceId,
      creatorKind: creatorKind || 'human',
      topicId: input.topic_id,
    });

    return this.getById(artifact.id);
  },

  async update(id: string, userId: string, input: UpdateArtifactInput): Promise<ArtifactWithCreator> {
    // Check current status
    const existing = await artifactRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Artifact');
    }

    if (existing.status !== 'draft') {
      throw AppError.validation('Only draft artifacts can be edited');
    }

    if (existing.created_by !== userId) {
      throw AppError.forbidden('Only the creator can edit this artifact');
    }

    // Check for secrets
    if (input.body && containsSecret(input.body)) {
      throw AppError.contentBlocked('Content contains potential secrets');
    }

    const artifact = await artifactRepository.update(id, input);
    if (!artifact) {
      throw AppError.notFound('Artifact');
    }

    return this.getById(artifact.id);
  },

  async propose(id: string, userId: string): Promise<ArtifactWithCreator> {
    const existing = await artifactRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Artifact');
    }

    if (existing.status !== 'draft') {
      throw AppError.validation('Only draft artifacts can be proposed');
    }

    if (existing.created_by !== userId) {
      throw AppError.forbidden('Only the creator can propose this artifact');
    }

    const artifact = await artifactRepository.updateStatus(id, 'proposed');
    if (!artifact) {
      throw AppError.notFound('Artifact');
    }

    return this.getById(artifact.id);
  },

  async accept(id: string, adminId: string): Promise<ArtifactWithCreator> {
    const existing = await artifactRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Artifact');
    }

    if (existing.status !== 'proposed') {
      throw AppError.validation('Only proposed artifacts can be accepted');
    }

    const artifact = await artifactRepository.updateStatus(id, 'accepted', adminId);
    if (!artifact) {
      throw AppError.notFound('Artifact');
    }

    return this.getById(artifact.id);
  },

  async deprecate(id: string, userId?: string): Promise<ArtifactWithCreator> {
    const existing = await artifactRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Artifact');
    }

    if (existing.status !== 'accepted') {
      throw AppError.validation('Only accepted artifacts can be deprecated');
    }

    const artifact = await artifactRepository.updateStatus(id, 'deprecated');
    if (!artifact) {
      throw AppError.notFound('Artifact');
    }

    // Fire-and-forget audit log
    if (userId) {
      auditLogRepository.create(
        existing.workspace_id, userId, 'artifact.deprecated', 'artifact', id,
        { before: { status: 'accepted' }, after: { status: 'deprecated' } }
      ).catch(err => console.error('Audit log error:', err));
    }

    return this.getById(artifact.id);
  },
};
