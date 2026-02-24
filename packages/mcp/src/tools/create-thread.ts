/**
 * cortex.create_thread
 *
 * Create a new discussion thread in a topic.
 * Threads are used for conversations, questions, decisions, and incidents.
 */

import { z } from 'zod';
import { client } from '../client.js';
import { setActiveThreadId, appendActiveThreadFooter } from './state.js';

export const createThreadSchema = z.object({
  topic_id: z
    .string()
    .uuid()
    .describe('Parent topic ID'),
  title: z
    .string()
    .min(1)
    .max(500)
    .describe('Thread title'),
  type: z
    .enum(['question', 'discussion', 'decision', 'incident'])
    .optional()
    .describe('Thread type (default: discussion)'),
  body: z
    .string()
    .max(50000)
    .optional()
    .describe('Thread body content (supports markdown)'),
  tags: z
    .array(z.string().max(64))
    .max(20)
    .optional()
    .describe('Tags for categorization'),
  summary: z
    .string()
    .max(1000)
    .optional()
    .describe('Thread summary — a concise description of intent or expected outcome'),
});

export type CreateThreadInput = z.infer<typeof createThreadSchema>;

export const createThreadTool = {
  name: 'cortex_create_thread',
  description:
    'Create a new discussion thread in a topic. Use this to start new conversations, ' +
    'ask questions, track decisions, or report incidents.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      topic_id: {
        type: 'string',
        format: 'uuid',
        description: 'Parent topic ID',
      },
      title: {
        type: 'string',
        description: 'Thread title',
        minLength: 1,
        maxLength: 500,
      },
      type: {
        type: 'string',
        enum: ['question', 'discussion', 'decision', 'incident'],
        description: 'Thread type (default: discussion)',
      },
      body: {
        type: 'string',
        description: 'Thread body content (supports markdown)',
        maxLength: 50000,
      },
      tags: {
        type: 'array',
        items: { type: 'string', maxLength: 64 },
        maxItems: 20,
        description: 'Tags for categorization',
      },
      summary: {
        type: 'string',
        description: 'Thread summary — a concise description of intent or expected outcome',
        maxLength: 1000,
      },
    },
    required: ['topic_id', 'title'],
  },

  async execute(input: CreateThreadInput): Promise<string> {
    try {
      const thread = await client.createThread(input);
      setActiveThreadId(thread.id);

      let output = `# Thread Created\n\n`;
      output += `- **Thread ID:** \`${thread.id}\`\n`;
      output += `- **Title:** ${thread.title}\n`;
      output += `- **Type:** ${thread.type}\n`;
      output += `- **Status:** ${thread.status}\n`;
      output += `- **Topic ID:** \`${thread.topic_id}\`\n`;
      output += `- **Created at:** ${new Date(thread.created_at).toISOString()}\n`;

      if (input.tags && input.tags.length > 0) {
        output += `- **Tags:** ${input.tags.join(', ')}\n`;
      }

      output += `\n> **IMPORTANT:** Use thread ID \`${thread.id}\` for all subsequent \`cortex_observe\` and \`cortex_checkpoint\` calls in this session. If you lose this ID after context compaction, call \`cortex_get_context\` or \`cortex_list_threads\` to recover it.\n`;

      if (input.body) {
        output += `\n## Body Preview\n\n`;
        const preview = input.body.length > 500
          ? input.body.slice(0, 500) + '...'
          : input.body;
        output += preview;
      }

      return appendActiveThreadFooter(output);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Topic not found')) {
        return (
          `# Error: Topic not found\n\n` +
          `The topic ID \`${input.topic_id}\` does not exist.\n\n` +
          `## How to fix\n\n` +
          `Use \`cortex_get_context\` to see available topics and their IDs, then retry with a valid topic_id.`
        );
      }
      throw error;
    }
  },
};
