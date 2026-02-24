/**
 * cortex.update_thread
 *
 * Update a thread's status, title, type, or other fields.
 * Primary use: resolving threads when work is complete.
 */

import { z } from 'zod';
import { client } from '../client.js';
import { appendActiveThreadFooter } from './state.js';

export const updateThreadSchema = z.object({
  id: z
    .string()
    .uuid()
    .describe('Thread ID to update'),
  status: z
    .enum(['open', 'resolved', 'archived'])
    .optional()
    .describe('New thread status'),
  title: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe('New thread title'),
  type: z
    .enum(['question', 'discussion', 'decision', 'incident'])
    .optional()
    .describe('New thread type'),
  body: z
    .string()
    .max(50000)
    .optional()
    .describe('New thread body'),
  tags: z
    .array(z.string().max(64))
    .max(20)
    .optional()
    .describe('New tags (replaces existing)'),
  pinned: z
    .boolean()
    .optional()
    .describe('Pin/unpin thread'),
  summary: z
    .string()
    .max(1000)
    .optional()
    .describe('Thread summary — a concise description of the outcome or conclusion. Set this when resolving a thread.'),
});

export type UpdateThreadInput = z.infer<typeof updateThreadSchema>;

export const updateThreadTool = {
  name: 'cortex_update_thread',
  description:
    'Update a thread\'s status, title, type, or other fields. ' +
    'Use this to resolve threads when work is complete, archive old discussions, ' +
    'or reopen resolved threads if work resumes.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        description: 'Thread ID to update',
      },
      status: {
        type: 'string',
        enum: ['open', 'resolved', 'archived'],
        description: 'New thread status',
      },
      title: {
        type: 'string',
        description: 'New thread title',
        minLength: 1,
        maxLength: 500,
      },
      type: {
        type: 'string',
        enum: ['question', 'discussion', 'decision', 'incident'],
        description: 'New thread type',
      },
      body: {
        type: 'string',
        description: 'New thread body',
        maxLength: 50000,
      },
      tags: {
        type: 'array',
        items: { type: 'string', maxLength: 64 },
        maxItems: 20,
        description: 'New tags (replaces existing)',
      },
      pinned: {
        type: 'boolean',
        description: 'Pin/unpin thread',
      },
      summary: {
        type: 'string',
        description: 'Thread summary — a concise description of the outcome or conclusion. Set this when resolving a thread.',
        maxLength: 1000,
      },
    },
    required: ['id'],
  },

  async execute(input: UpdateThreadInput): Promise<string> {
    try {
      const updates: Record<string, unknown> = {};
      if (input.status !== undefined) updates.status = input.status;
      if (input.title !== undefined) updates.title = input.title;
      if (input.type !== undefined) updates.type = input.type;
      if (input.body !== undefined) updates.body = input.body;
      if (input.tags !== undefined) updates.tags = input.tags;
      if (input.pinned !== undefined) updates.pinned = input.pinned;
      if (input.summary !== undefined) updates.summary = input.summary;

      const thread = await client.updateThread(input.id, updates);

      let output = `# Thread Updated\n\n`;
      output += `- **Thread ID:** \`${thread.id}\`\n`;
      output += `- **Title:** ${thread.title}\n`;
      output += `- **Status:** ${thread.status}\n`;
      output += `- **Updated at:** ${new Date(thread.updated_at).toISOString()}\n`;

      if (input.status === 'resolved') {
        output += input.summary
          ? `\n> Thread resolved with summary. Good practice!\n`
          : `\n> Thread resolved. Consider adding a summary with cortex_update_thread to help future sessions orient quickly.\n`;

        output += `\n## ⚠️ Did you run \`cortex_session_complete\` first?\n\n`;
        output += `Before finalizing, run the session audit to ensure documentation is complete:\n`;
        output += `\`cortex_session_complete({ thread_id: "${input.id}", topic_id: "<your_topic_id>" })\`\n\n`;
        output += `The audit checks for: thread summary, typed observations, artifact creation, negative-result tagging, and follow-up tasks.\n\n`;

        output += `## Consolidation Checklist\n\n`;
        output += `- [ ] **Promote key findings** to artifacts with \`cortex_draft_artifact\` (decisions, results, dead ends)\n`;
        output += `- [ ] **Tag outcomes** on artifacts: \`validated\`, \`dead-end\`, \`blocked\`, \`exploratory\`\n`;
        output += `- [ ] **Supersede old artifacts** if findings replace prior knowledge (use \`supersedes\` parameter)\n`;
        output += `- [ ] **Create follow-up tasks** with \`cortex_create_task\` for any identified next steps\n`;
      }

      return appendActiveThreadFooter(output);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('not found') || message.includes('Not found')) {
        return appendActiveThreadFooter(
          `# Error: Thread not found\n\n` +
          `Thread \`${input.id}\` does not exist. Use \`cortex_list_threads\` to find valid IDs.`
        );
      }
      throw error;
    }
  },
};
