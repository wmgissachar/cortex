/**
 * cortex.search
 *
 * Full-text search across the knowledge base.
 * Searches threads, artifacts, and comments.
 */

import { z } from 'zod';
import { client } from '../client.js';
import { appendActiveThreadFooter } from './state.js';

export const searchSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(500)
    .describe('Search query text'),
  type: z
    .enum(['all', 'threads', 'artifacts', 'comments'])
    .optional()
    .describe('Filter by content type (default: all)'),
  topic_id: z
    .string()
    .uuid()
    .optional()
    .describe('Filter search to a specific topic'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .optional()
    .describe('Maximum number of results (default: 20)'),
  status: z
    .string()
    .optional()
    .describe('Filter by status (e.g., open, resolved, accepted, deprecated)'),
  tags: z
    .array(z.string())
    .optional()
    .describe('Filter by tags (returns items matching any tag)'),
  creator_kind: z
    .enum(['human', 'agent'])
    .optional()
    .describe('Filter by creator type'),
});

export type SearchInput = z.infer<typeof searchSchema>;

export const searchTool = {
  name: 'cortex_search',
  description:
    'Search across the knowledge base for threads, artifacts, and comments. ' +
    'Returns results ranked by relevance with snippets and metadata.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search query text',
        minLength: 1,
        maxLength: 500,
      },
      type: {
        type: 'string',
        enum: ['all', 'threads', 'artifacts', 'comments'],
        description: 'Filter by content type (default: all)',
      },
      topic_id: {
        type: 'string',
        format: 'uuid',
        description: 'Filter search to a specific topic',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 20)',
        minimum: 1,
        maximum: 50,
      },
      status: {
        type: 'string',
        description: 'Filter by status (e.g., open, resolved, accepted, deprecated)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags (returns items matching any tag)',
      },
      creator_kind: {
        type: 'string',
        enum: ['human', 'agent'],
        description: 'Filter by creator type',
      },
    },
    required: ['query'],
  },

  async execute(input: SearchInput): Promise<string> {
    const results = await client.search(input.query, {
      type: input.type,
      topicId: input.topic_id,
      status: input.status,
      tags: input.tags,
      creatorKind: input.creator_kind,
      limit: input.limit || 20,
    });

    if (results.length === 0) {
      return appendActiveThreadFooter(`No results found for "${input.query}"`);
    }

    let output = `# Search Results for "${input.query}"\n\n`;
    output += `Found ${results.length} result(s)\n\n`;

    for (const result of results) {
      const typeIcon = {
        thread: '💬',
        artifact: '📄',
        comment: '💭',
      }[result.type];

      output += `## ${typeIcon} ${result.title}\n`;
      output += `- **Type:** ${result.type}\n`;
      output += `- **ID:** \`${result.id}\`\n`;
      if (result.status) {
        output += `- **Status:** ${result.status}\n`;
      }

      if (result.topic_handle) {
        output += `- **Topic:** \`${result.topic_handle}\`\n`;
      }

      if (result.thread_id && result.type === 'comment') {
        output += `- **Thread ID:** \`${result.thread_id}\`\n`;
      }

      if (result.snippet) {
        output += `- **Snippet:** ${result.snippet}\n`;
      }

      output += `\n`;
    }

    return appendActiveThreadFooter(output);
  },
};
