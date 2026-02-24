import { AppError, type CreateCommentInput, type UpdateCommentInput, type CommentWithCreator } from '@cortex/shared';
import { commentRepository } from '../repositories/comment.repository.js';
import { threadRepository } from '../repositories/thread.repository.js';
import { buildPaginatedResponse, type PaginatedResult } from '../utils/pagination.js';
import { containsSecret } from '../utils/secret-detector.js';
import db from '../db/index.js';

function formatCommentWithCreator(row: {
  id: string;
  thread_id: string;
  parent_id: string | null;
  type: string;
  body: string;
  tags: string[];
  attachments: unknown[];
  depth: number;
  significance: number;
  created_at: Date;
  created_by: string;
  updated_at: Date;
  edited: boolean;
  creator_id: string;
  creator_handle: string;
  creator_display_name: string;
  creator_kind: string;
}): CommentWithCreator {
  return {
    id: row.id,
    thread_id: row.thread_id,
    parent_id: row.parent_id,
    type: row.type as CommentWithCreator['type'],
    body: row.body,
    tags: row.tags,
    attachments: row.attachments as CommentWithCreator['attachments'],
    depth: row.depth,
    significance: row.significance,
    created_at: row.created_at,
    created_by: row.created_by,
    updated_at: row.updated_at,
    edited: row.edited,
    creator: {
      id: row.creator_id,
      handle: row.creator_handle,
      display_name: row.creator_display_name,
      kind: row.creator_kind,
    },
  };
}

export const commentService = {
  async listByThread(
    threadId: string,
    options: { limit: number; cursor?: string }
  ): Promise<PaginatedResult<CommentWithCreator>> {
    const comments = await commentRepository.findByThread(threadId, options);
    const formatted = comments.map(formatCommentWithCreator);
    return buildPaginatedResponse(formatted, options.limit);
  },

  async getById(id: string): Promise<CommentWithCreator> {
    const comment = await commentRepository.findById(id);
    if (!comment) {
      throw AppError.notFound('Comment');
    }
    return formatCommentWithCreator(comment);
  },

  async create(
    threadId: string,
    createdBy: string,
    input: CreateCommentInput
  ): Promise<CommentWithCreator> {
    // Verify thread exists
    const thread = await threadRepository.findById(threadId);
    if (!thread) {
      throw AppError.notFound('Thread');
    }

    // Check for secrets
    if (containsSecret(input.body)) {
      throw AppError.contentBlocked('Content contains potential secrets');
    }

    // Dedup check: same thread, similar body (first 100 chars), within 30 seconds
    const { rows: dupeRows } = await db.query<{ id: string }>(
      `SELECT id FROM comments
       WHERE thread_id = $1 AND LEFT(body, 100) = LEFT($2, 100)
         AND created_at > NOW() - INTERVAL '30 seconds'
       LIMIT 1`,
      [threadId, input.body]
    );
    if (dupeRows.length > 0) {
      return this.getById(dupeRows[0].id);
    }

    // Calculate depth if parent is provided
    let depth = 0;
    if (input.parent_id) {
      const parentDepth = await commentRepository.getParentDepth(input.parent_id);
      if (parentDepth < 0) {
        throw AppError.notFound('Parent comment');
      }
      depth = parentDepth + 1;
      if (depth > 5) {
        throw AppError.validation('Maximum comment nesting depth (5) exceeded');
      }
    }

    const comment = await commentRepository.create(threadId, createdBy, {
      ...input,
      thread_id: threadId,
      depth,
    });

    // Fetch with creator info
    return this.getById(comment.id);
  },

  async update(id: string, input: UpdateCommentInput): Promise<CommentWithCreator> {
    // Check for secrets
    if (input.body && containsSecret(input.body)) {
      throw AppError.contentBlocked('Content contains potential secrets');
    }

    const comment = await commentRepository.update(id, input);
    if (!comment) {
      throw AppError.notFound('Comment');
    }

    // Fetch with creator info
    return this.getById(comment.id);
  },

  async delete(id: string): Promise<void> {
    const deleted = await commentRepository.delete(id);
    if (!deleted) {
      throw AppError.notFound('Comment');
    }
  },
};
