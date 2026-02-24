/**
 * cortex.list_threads
 *
 * List threads with optional filtering.
 * Use to discover discussions and navigate the knowledge base.
 */

import { z } from 'zod';
import { client } from '../client.js';
import { appendActiveThreadFooter } from './state.js';

export const listThreadsSchema = z.object({
  topic_id: z
    .string()
    .uuid()
    .optional()
    .describe('Filter by topic ID'),
  status: z
    .enum(['open', 'resolved', 'archived'])
    .optional()
    .describe('Filter by thread status'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .optional()
    .describe('Maximum results (default: 20)'),
});

export type ListThreadsInput = z.infer<typeof listThreadsSchema>;

export const listThreadsTool = {
  name: 'cortex_list_threads',
  description:
    'List threads with optional filtering by topic and status. ' +
    'Use this to discover discussions and navigate the knowledge base.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      topic_id: {
        type: 'string',
        format: 'uuid',
        description: 'Filter by topic ID',
      },
      status: {
        type: 'string',
        enum: ['open', 'resolved', 'archived'],
        description: 'Filter by thread status',
      },
      limit: {
        type: 'number',
        description: 'Maximum results (default: 20)',
        minimum: 1,
        maximum: 50,
      },
    },
    required: [] as string[],
  },

  async execute(input: ListThreadsInput): Promise<string> {
    const threads = await client.getThreads({
      topicId: input.topic_id,
      status: input.status,
      limit: input.limit || 20,
    });

    if (threads.length === 0) {
      let msg = 'No threads found';
      const filters: string[] = [];
      if (input.topic_id) filters.push(`topic_id=${input.topic_id}`);
      if (input.status) filters.push(`status=${input.status}`);
      if (filters.length > 0) {
        msg += ` matching filters: ${filters.join(', ')}`;
      }
      return appendActiveThreadFooter(msg);
    }

    let output = `# Threads\n\n`;
    output += `Found ${threads.length} thread(s)\n\n`;

    for (const thread of threads) {
      output += `## [${thread.type.toUpperCase()}] ${thread.title}\n`;
      output += `- **ID:** \`${thread.id}\`\n`;
      output += `- **Status:** ${thread.status}\n`;
      output += `- **Comments:** ${thread.comment_count}\n`;
      output += `- **Created:** ${new Date(thread.created_at).toISOString()}\n`;
      output += `\n`;
    }

    return appendActiveThreadFooter(output);
  },
};
