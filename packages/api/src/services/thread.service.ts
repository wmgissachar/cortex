import { AppError, type CreateThreadInput, type UpdateThreadInput, type ThreadWithCreator } from '@cortex/shared';
import { threadRepository } from '../repositories/thread.repository.js';
import { topicRepository } from '../repositories/topic.repository.js';
import { auditLogRepository } from '../repositories/audit-log.repository.js';
import { buildPaginatedResponse, type PaginatedResult } from '../utils/pagination.js';
import { containsSecret } from '../utils/secret-detector.js';
import { eventBus } from '../utils/event-bus.js';

function formatThreadWithCreator(row: {
  id: string;
  workspace_id: string;
  topic_id: string;
  title: string;
  type: string;
  status: string;
  body: string | null;
  summary: string | null;
  tags: string[];
  comment_count: number;
  pinned: boolean;
  created_at: Date;
  created_by: string;
  updated_at: Date;
  creator_id: string;
  creator_handle: string;
  creator_display_name: string;
}): ThreadWithCreator {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    topic_id: row.topic_id,
    title: row.title,
    type: row.type as ThreadWithCreator['type'],
    status: row.status as ThreadWithCreator['status'],
    body: row.body,
    summary: row.summary,
    tags: row.tags,
    comment_count: row.comment_count,
    pinned: row.pinned,
    created_at: row.created_at,
    created_by: row.created_by,
    updated_at: row.updated_at,
    creator: {
      id: row.creator_id,
      handle: row.creator_handle,
      display_name: row.creator_display_name,
    },
  };
}

export const threadService = {
  async list(
    workspaceId: string,
    options: { limit: number; cursor?: string; topicId?: string; status?: string }
  ): Promise<PaginatedResult<ThreadWithCreator>> {
    const threads = await threadRepository.findAll(workspaceId, options);
    const formatted = threads.map(formatThreadWithCreator);
    return buildPaginatedResponse(formatted, options.limit);
  },

  async getById(id: string): Promise<ThreadWithCreator> {
    const thread = await threadRepository.findById(id);
    if (!thread) {
      throw AppError.notFound('Thread');
    }
    return formatThreadWithCreator(thread);
  },

  async create(
    workspaceId: string,
    createdBy: string,
    input: CreateThreadInput
  ): Promise<ThreadWithCreator> {
    // Verify topic exists and is not archived
    const topic = await topicRepository.findById(input.topic_id);
    if (!topic || topic.workspace_id !== workspaceId) {
      throw AppError.notFound('Topic');
    }
    if (topic.archived_at) {
      throw AppError.validation('Cannot create content in an archived topic');
    }

    // Check for secrets
    if (input.body && containsSecret(input.body)) {
      throw AppError.contentBlocked('Content contains potential secrets');
    }

    const thread = await threadRepository.create(workspaceId, createdBy, input);

    // Fire-and-forget audit log
    auditLogRepository.create(
      workspaceId, createdBy, 'thread.created', 'thread', thread.id,
      { after: { title: input.title, type: input.type || 'discussion' } }
    ).catch(err => console.error('Audit log error:', err));

    // Fetch with creator info
    return this.getById(thread.id);
  },

  async update(id: string, input: UpdateThreadInput, userId?: string): Promise<ThreadWithCreator> {
    // Check for secrets
    if (input.body && containsSecret(input.body)) {
      throw AppError.contentBlocked('Content contains potential secrets');
    }

    // Capture previous status for audit logging
    let previousStatus: string | undefined;
    if (input.status && userId) {
      const existing = await threadRepository.findById(id);
      if (existing) {
        previousStatus = existing.status;
      }
    }

    const thread = await threadRepository.update(id, input);
    if (!thread) {
      throw AppError.notFound('Thread');
    }

    // Fire-and-forget audit log for status changes
    if (input.status && userId && previousStatus && previousStatus !== input.status) {
      const actionMap: Record<string, string> = {
        resolved: 'thread.resolved',
        archived: 'thread.archived',
        open: 'thread.reopened',
      };
      const action = actionMap[input.status] || `thread.${input.status}`;
      auditLogRepository.create(
        thread.workspace_id, userId, action, 'thread', id,
        { before: { status: previousStatus }, after: { status: input.status } }
      ).catch(err => console.error('Audit log error:', err));
    }

    // Emit event for AI layer
    if (input.status === 'resolved' && previousStatus && previousStatus !== 'resolved') {
      eventBus.emitEvent('thread.resolved', {
        threadId: id,
        workspaceId: thread.workspace_id,
        resolvedBy: userId || '',
      });
    }

    // Fetch with creator info
    return this.getById(thread.id);
  },

  async delete(id: string): Promise<void> {
    const deleted = await threadRepository.delete(id);
    if (!deleted) {
      throw AppError.notFound('Thread');
    }
  },
};
