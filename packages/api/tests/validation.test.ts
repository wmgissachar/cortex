/**
 * Validation Tests
 *
 * Tests for Zod schemas used in API validation.
 */

import { describe, it, expect } from 'vitest';
import {
  createTopicSchema,
  createThreadSchema,
  createCommentSchema,
  createArtifactSchema,
  createTaskSchema,
  searchSchema,
  paginationSchema,
} from '@cortex/shared';

describe('Topic Schemas', () => {
  describe('createTopicSchema', () => {
    it('accepts valid topic', () => {
      const result = createTopicSchema.safeParse({
        handle: 'engineering',
        name: 'Engineering',
        description: 'Engineering topics',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid handle format', () => {
      const result = createTopicSchema.safeParse({
        handle: 'INVALID',
        name: 'Test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects handle with spaces', () => {
      const result = createTopicSchema.safeParse({
        handle: 'invalid handle',
        name: 'Test',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Thread Schemas', () => {
  describe('createThreadSchema', () => {
    it('accepts valid thread', () => {
      const result = createThreadSchema.safeParse({
        topic_id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'How to implement feature X?',
        type: 'question',
        body: 'Detailed description here',
        tags: ['help', 'feature'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid topic_id', () => {
      const result = createThreadSchema.safeParse({
        topic_id: 'not-a-uuid',
        title: 'Test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects title exceeding max length', () => {
      const result = createThreadSchema.safeParse({
        topic_id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'a'.repeat(501),
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Comment Schemas', () => {
  describe('createCommentSchema', () => {
    it('accepts valid comment', () => {
      const result = createCommentSchema.safeParse({
        body: 'This is a helpful comment.',
        type: 'observation',
        tags: ['important'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty body', () => {
      const result = createCommentSchema.safeParse({
        body: '',
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid parent_id', () => {
      const result = createCommentSchema.safeParse({
        body: 'Reply to comment',
        parent_id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('Artifact Schemas', () => {
  describe('createArtifactSchema', () => {
    it('accepts valid artifact', () => {
      const result = createArtifactSchema.safeParse({
        topic_id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Authentication Decision',
        type: 'decision',
        body: 'We will use JWT for authentication...',
        summary: 'JWT-based auth',
        tags: ['security', 'auth'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid type', () => {
      const result = createArtifactSchema.safeParse({
        topic_id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Test',
        type: 'invalid',
        body: 'Content',
      });
      expect(result.success).toBe(false);
    });

    it('validates references', () => {
      const result = createArtifactSchema.safeParse({
        topic_id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Test',
        type: 'document',
        body: 'Content',
        references: [
          { type: 'url', url: 'https://example.com', title: 'Example' },
          { type: 'thread', id: '550e8400-e29b-41d4-a716-446655440000' },
        ],
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('Task Schemas', () => {
  describe('createTaskSchema', () => {
    it('accepts valid task', () => {
      const result = createTaskSchema.safeParse({
        title: 'Implement feature X',
        body: 'Detailed description',
        status: 'open',
        priority: 'high',
        due_date: '2024-12-31',
        tags: ['feature'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid status', () => {
      const result = createTaskSchema.safeParse({
        title: 'Test',
        status: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid due_date format', () => {
      const result = createTaskSchema.safeParse({
        title: 'Test',
        due_date: 'not-a-date',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Search Schema', () => {
  it('accepts valid search query', () => {
    const result = searchSchema.safeParse({
      q: 'authentication',
      type: 'artifacts',
      limit: 10,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty query', () => {
    const result = searchSchema.safeParse({
      q: '',
    });
    expect(result.success).toBe(false);
  });

  it('coerces limit to number', () => {
    const result = searchSchema.parse({
      q: 'test',
      limit: '25',
    });
    expect(result.limit).toBe(25);
  });
});

describe('Pagination Schema', () => {
  it('uses default limit', () => {
    const result = paginationSchema.parse({});
    expect(result.limit).toBe(20);
  });

  it('respects max limit', () => {
    const result = paginationSchema.safeParse({
      limit: 500,
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid cursor', () => {
    const result = paginationSchema.safeParse({
      cursor: 'eyJpZCI6IjEyMyJ9',
    });
    expect(result.success).toBe(true);
  });
});
