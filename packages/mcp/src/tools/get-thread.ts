/**
 * cortex.get_thread
 *
 * Retrieve a thread with all its comments.
 * Use after searching to get full thread context.
 */

import { z } from 'zod';
import { client } from '../client.js';
import { appendActiveThreadFooter } from './state.js';

export const getThreadSchema = z.object({
  id: z
    .string()
    .uuid()
    .describe('Thread ID (UUID)'),
});

export type GetThreadInput = z.infer<typeof getThreadSchema>;

export const getThreadTool = {
  name: 'cortex_get_thread',
  description:
    'Get a thread with all its comments. Use this to read a full discussion ' +
    'including all replies and observations.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        description: 'Thread ID (UUID)',
      },
    },
    required: ['id'],
  },

  async execute(input: GetThreadInput): Promise<string> {
    const thread = await client.getThread(input.id);

    let output = `# ${thread.title}\n\n`;
    output += `- **Thread ID:** \`${thread.id}\`\n`;
    output += `- **Type:** ${thread.type}\n`;
    output += `- **Status:** ${thread.status}\n`;
    output += `- **Topic:** ${thread.topic.name} (\`${thread.topic.handle}\`)\n`;
    output += `- **Topic ID:** \`${thread.topic.id}\`\n`;
    output += `- **Created by:** ${thread.creator.display_name} (@${thread.creator.handle})\n`;
    output += `- **Created at:** ${new Date(thread.created_at).toISOString()}\n`;

    if (thread.tags && thread.tags.length > 0) {
      output += `- **Tags:** ${thread.tags.join(', ')}\n`;
    }

    output += `\n`;

    // Thread body
    if (thread.body) {
      output += `## Description\n\n${thread.body}\n\n`;
    }

    // Comments
    if (thread.comments.length > 0) {
      output += `## Comments (${thread.comments.length})\n\n`;

      for (const comment of thread.comments) {
        const indent = '  '.repeat(comment.depth);
        const typeLabel = comment.type !== 'reply' ? ` [${comment.type}]` : '';

        output += `${indent}### ${comment.creator.display_name}${typeLabel}\n`;
        output += `${indent}*@${comment.creator.handle} · ${new Date(comment.created_at).toISOString()}*\n`;
        output += `${indent}*Comment ID: \`${comment.id}\`*\n\n`;

        // Indent the comment body
        const bodyLines = comment.body.split('\n');
        for (const line of bodyLines) {
          output += `${indent}${line}\n`;
        }

        if (comment.tags && comment.tags.length > 0) {
          output += `${indent}Tags: ${comment.tags.join(', ')}\n`;
        }

        output += `\n`;
      }
    } else {
      output += `*No comments yet.*\n`;
    }

    return appendActiveThreadFooter(output);
  },
};
