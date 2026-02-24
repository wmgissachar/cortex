/**
 * cortex.checkpoint
 *
 * Record a progress checkpoint.
 * Creates an observation summarizing current work progress.
 */

import { z } from 'zod';
import { client } from '../client.js';
import { appendActiveThreadFooter } from './state.js';

export const checkpointSchema = z.object({
  thread_id: z
    .string()
    .uuid()
    .optional()
    .describe('Thread ID for checkpoint (uses CORTEX_CHECKPOINT_THREAD_ID env var if not provided)'),
  summary: z
    .string()
    .min(1)
    .max(10000)
    .describe('Summary of current work progress'),
});

export type CheckpointInput = z.infer<typeof checkpointSchema>;

export const checkpointTool = {
  name: 'cortex_checkpoint',
  description:
    'Record a checkpoint of your current work progress. Use this periodically ' +
    'during long tasks to document what you have done, what you are doing, and ' +
    'what you plan to do next. Checkpoints help maintain context and provide ' +
    'a trail for review.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      thread_id: {
        type: 'string',
        format: 'uuid',
        description: 'Thread ID for checkpoint (uses CORTEX_CHECKPOINT_THREAD_ID env var if not provided)',
      },
      summary: {
        type: 'string',
        description: 'Summary of current work progress',
        minLength: 1,
        maxLength: 10000,
      },
    },
    required: ['summary'],
  },

  async execute(input: CheckpointInput): Promise<string> {
    // Resolve thread ID
    const threadId = input.thread_id || process.env.CORTEX_CHECKPOINT_THREAD_ID;

    if (!threadId) {
      throw new Error(
        'No thread_id provided and CORTEX_CHECKPOINT_THREAD_ID environment variable is not set. ' +
        'Either provide a thread_id parameter or set the environment variable to a valid thread UUID.'
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(threadId)) {
      throw new Error(`Invalid thread ID format: ${threadId}. Expected UUID format.`);
    }

    // Format checkpoint body with timestamp
    const timestamp = new Date().toISOString();
    const checkpointBody = `## Checkpoint - ${timestamp}\n\n${input.summary}`;

    try {
      const comment = await client.createComment(threadId, checkpointBody, {
        type: 'observation',
        tags: ['checkpoint'],
      });

      let output = `# Checkpoint Recorded ✓\n\n`;
      output += `- **Comment ID:** \`${comment.id}\`\n`;
      output += `- **Thread ID:** \`${comment.thread_id}\`\n`;
      output += `- **Timestamp:** ${timestamp}\n`;
      output += `\n## Summary\n\n`;

      // Show the summary (truncated if very long)
      const preview = input.summary.length > 1000
        ? input.summary.slice(0, 1000) + '...'
        : input.summary;
      output += preview;

      return appendActiveThreadFooter(output);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Thread not found')) {
        return appendActiveThreadFooter(
          `# Error: Thread not found\n\n` +
          `The thread ID \`${threadId}\` does not exist. ` +
          `This can happen if the thread was never created or if the ID is incorrect.\n\n` +
          `## How to fix\n\n` +
          `1. Use \`cortex_create_thread\` to create a new session thread first\n` +
          `2. Then use the returned thread ID for your checkpoint\n` +
          `3. Use \`cortex_list_threads\` to find existing threads if you need to resume one`
        );
      }
      throw error;
    }
  },
};
