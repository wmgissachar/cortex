/**
 * cortex.observe
 *
 * Add an observation to a thread.
 * Creates a comment with type 'observation'.
 */

import { z } from 'zod';
import { client } from '../client.js';
import { appendActiveThreadFooter } from './state.js';

export const observeSchema = z.object({
  thread_id: z
    .string()
    .uuid()
    .describe('Thread ID to add observation to'),
  body: z
    .string()
    .min(1)
    .max(50000)
    .describe('Observation content (supports markdown)'),
  tags: z
    .array(z.string().max(64))
    .max(20)
    .optional()
    .describe('Optional tags for categorization'),
  sub_type: z
    .enum(['result', 'negative-result', 'decision', 'question', 'methodology'])
    .optional()
    .describe('Observation category. Use negative-result for failed approaches, question for open questions, decision for choices made, methodology for approach notes.'),
  significance: z
    .number()
    .int()
    .min(0)
    .max(2)
    .default(0)
    .optional()
    .describe('0=routine (default), 1=notable, 2=critical. Use 2 for findings that would change someone\'s approach.'),
});

export type ObserveInput = z.infer<typeof observeSchema>;

export const observeTool = {
  name: 'cortex_observe',
  description:
    'Add an observation to a thread. Use this to record insights, notes, ' +
    'analysis results, or any relevant information during your work. ' +
    'Observations are timestamped and attributed to your agent identity.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      thread_id: {
        type: 'string',
        format: 'uuid',
        description: 'Thread ID to add observation to',
      },
      body: {
        type: 'string',
        description: 'Observation content (supports markdown)',
        minLength: 1,
        maxLength: 50000,
      },
      tags: {
        type: 'array',
        items: { type: 'string', maxLength: 64 },
        maxItems: 20,
        description: 'Optional tags for categorization',
      },
      sub_type: {
        type: 'string',
        enum: ['result', 'negative-result', 'decision', 'question', 'methodology'],
        description: 'Observation category. Use negative-result for failed approaches, question for open questions, decision for choices made.',
      },
      significance: {
        type: 'number',
        minimum: 0,
        maximum: 2,
        description: '0=routine (default), 1=notable, 2=critical. Use 2 for findings that would change someone\'s approach.',
      },
    },
    required: ['thread_id', 'body'],
  },

  async execute(input: ObserveInput): Promise<string> {
    try {
      const tags = [...(input.tags || [])];
      if (input.sub_type) {
        tags.push(input.sub_type);
      }

      const comment = await client.createComment(input.thread_id, input.body, {
        type: 'observation',
        tags: tags.length > 0 ? tags : undefined,
        significance: input.significance,
      });

      let output = `# Observation Created\n\n`;
      output += `- **Comment ID:** \`${comment.id}\`\n`;
      output += `- **Thread ID:** \`${comment.thread_id}\`\n`;
      output += `- **Created at:** ${new Date(comment.created_at).toISOString()}\n`;

      if (input.tags && input.tags.length > 0) {
        output += `- **Tags:** ${input.tags.join(', ')}\n`;
      }

      output += `\n## Content Preview\n\n`;
      // Show first 500 characters of the observation
      const preview = input.body.length > 500
        ? input.body.slice(0, 500) + '...'
        : input.body;
      output += preview;

      return appendActiveThreadFooter(output);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Thread not found')) {
        return (
          `# Error: Thread not found\n\n` +
          `The thread ID \`${input.thread_id}\` does not exist. ` +
          `This can happen if the thread was never created or if the ID is incorrect.\n\n` +
          `## How to fix\n\n` +
          `1. Use \`cortex_list_threads\` to find existing threads you can observe on\n` +
          `2. Or use \`cortex_create_thread\` to create a new thread first, then observe on the returned thread ID\n` +
          `3. Do NOT re-use thread IDs from previous sessions without verifying they still exist`
        );
      }
      throw error;
    }
  },
};
