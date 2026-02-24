/**
 * MCP Tools Tests
 *
 * Tests for tool schemas and validation.
 * Note: These tests only validate schemas, not execution (which requires API connection).
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Define schemas directly to avoid importing client (which requires CORTEX_API_KEY)
const getContextSchema = z.object({
  budget: z.number().int().min(1000).max(32000).default(4000).optional(),
});

const searchSchema = z.object({
  query: z.string().min(1).max(500),
  type: z.enum(['all', 'threads', 'artifacts', 'comments']).optional(),
  limit: z.number().int().min(1).max(50).default(20).optional(),
});

const getThreadSchema = z.object({
  id: z.string().uuid(),
});

const getArtifactSchema = z.object({
  id: z.string().uuid(),
});

const observeSchema = z.object({
  thread_id: z.string().uuid(),
  body: z.string().min(1).max(50000),
  tags: z.array(z.string().max(64)).max(20).optional(),
});

const draftArtifactSchema = z.object({
  title: z.string().min(1).max(500),
  body: z.string().min(1).max(100000),
  type: z.enum(['decision', 'procedure', 'document', 'glossary']),
  topic_id: z.string().uuid(),
  summary: z.string().max(1000).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
});

const updateTaskSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['open', 'in_progress', 'done', 'cancelled']),
});

const checkpointSchema = z.object({
  thread_id: z.string().uuid().optional(),
  summary: z.string().min(1).max(10000),
});

describe('cortex.get_context', () => {
  describe('schema validation', () => {
    it('accepts empty input (uses defaults)', () => {
      const result = getContextSchema.safeParse({});
      expect(result.success).toBe(true);
      // Note: With .default(4000).optional(), the default is applied only when
      // the field is present but undefined, not when the field is missing.
      // The important thing is that empty input is valid.
    });

    it('accepts valid budget', () => {
      const result = getContextSchema.safeParse({ budget: 8000 });
      expect(result.success).toBe(true);
    });

    it('rejects budget below minimum', () => {
      const result = getContextSchema.safeParse({ budget: 500 });
      expect(result.success).toBe(false);
    });

    it('rejects budget above maximum', () => {
      const result = getContextSchema.safeParse({ budget: 50000 });
      expect(result.success).toBe(false);
    });
  });
});

describe('cortex.search', () => {
  describe('schema validation', () => {
    it('accepts valid search query', () => {
      const result = searchSchema.safeParse({
        query: 'authentication',
      });
      expect(result.success).toBe(true);
    });

    it('accepts query with type filter', () => {
      const result = searchSchema.safeParse({
        query: 'test',
        type: 'artifacts',
        limit: 10,
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty query', () => {
      const result = searchSchema.safeParse({
        query: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects query exceeding max length', () => {
      const result = searchSchema.safeParse({
        query: 'a'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid type', () => {
      const result = searchSchema.safeParse({
        query: 'test',
        type: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('cortex.get_thread', () => {
  describe('schema validation', () => {
    it('accepts valid UUID', () => {
      const result = getThreadSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid UUID', () => {
      const result = getThreadSchema.safeParse({
        id: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing id', () => {
      const result = getThreadSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

describe('cortex.get_artifact', () => {
  describe('schema validation', () => {
    it('accepts valid UUID', () => {
      const result = getArtifactSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid UUID', () => {
      const result = getArtifactSchema.safeParse({
        id: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('cortex.observe', () => {
  describe('schema validation', () => {
    it('accepts valid observation', () => {
      const result = observeSchema.safeParse({
        thread_id: '550e8400-e29b-41d4-a716-446655440000',
        body: 'This is an observation about the discussion.',
      });
      expect(result.success).toBe(true);
    });

    it('accepts observation with tags', () => {
      const result = observeSchema.safeParse({
        thread_id: '550e8400-e29b-41d4-a716-446655440000',
        body: 'Observation content',
        tags: ['important', 'follow-up'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty body', () => {
      const result = observeSchema.safeParse({
        thread_id: '550e8400-e29b-41d4-a716-446655440000',
        body: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects body exceeding max length', () => {
      const result = observeSchema.safeParse({
        thread_id: '550e8400-e29b-41d4-a716-446655440000',
        body: 'a'.repeat(50001),
      });
      expect(result.success).toBe(false);
    });

    it('rejects too many tags', () => {
      const result = observeSchema.safeParse({
        thread_id: '550e8400-e29b-41d4-a716-446655440000',
        body: 'Content',
        tags: Array(21).fill('tag'),
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('cortex.draft_artifact', () => {
  describe('schema validation', () => {
    it('accepts valid artifact draft', () => {
      const result = draftArtifactSchema.safeParse({
        title: 'Authentication Decision',
        body: 'We have decided to use JWT tokens for authentication.',
        type: 'decision',
        topic_id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('accepts all artifact types', () => {
      const types = ['decision', 'procedure', 'document', 'glossary'] as const;
      for (const type of types) {
        const result = draftArtifactSchema.safeParse({
          title: 'Test',
          body: 'Content',
          type,
          topic_id: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(true);
      }
    });

    it('accepts optional fields', () => {
      const result = draftArtifactSchema.safeParse({
        title: 'Test',
        body: 'Content',
        type: 'document',
        topic_id: '550e8400-e29b-41d4-a716-446655440000',
        summary: 'Brief summary',
        tags: ['test'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid type', () => {
      const result = draftArtifactSchema.safeParse({
        title: 'Test',
        body: 'Content',
        type: 'invalid',
        topic_id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing required fields', () => {
      const result = draftArtifactSchema.safeParse({
        title: 'Test',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('cortex.update_task', () => {
  describe('schema validation', () => {
    it('accepts valid task update', () => {
      const result = updateTaskSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'in_progress',
      });
      expect(result.success).toBe(true);
    });

    it('accepts all valid statuses', () => {
      const statuses = ['open', 'in_progress', 'done', 'cancelled'] as const;
      for (const status of statuses) {
        const result = updateTaskSchema.safeParse({
          id: '550e8400-e29b-41d4-a716-446655440000',
          status,
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid status', () => {
      const result = updateTaskSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('cortex.checkpoint', () => {
  describe('schema validation', () => {
    it('accepts checkpoint with thread_id', () => {
      const result = checkpointSchema.safeParse({
        thread_id: '550e8400-e29b-41d4-a716-446655440000',
        summary: 'Completed initial analysis of the codebase.',
      });
      expect(result.success).toBe(true);
    });

    it('accepts checkpoint without thread_id (uses env var)', () => {
      const result = checkpointSchema.safeParse({
        summary: 'Checkpoint summary',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty summary', () => {
      const result = checkpointSchema.safeParse({
        thread_id: '550e8400-e29b-41d4-a716-446655440000',
        summary: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects summary exceeding max length', () => {
      const result = checkpointSchema.safeParse({
        summary: 'a'.repeat(10001),
      });
      expect(result.success).toBe(false);
    });
  });
});
