/**
 * cortex.list_tasks
 *
 * List tasks with optional filtering.
 * Use to discover work items and track progress.
 */

import { z } from 'zod';
import { client } from '../client.js';
import { appendActiveThreadFooter } from './state.js';

export const listTasksSchema = z.object({
  status: z
    .enum(['open', 'in_progress', 'done', 'cancelled'])
    .optional()
    .describe('Filter by task status'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .optional()
    .describe('Maximum results (default: 20)'),
});

export type ListTasksInput = z.infer<typeof listTasksSchema>;

export const listTasksTool = {
  name: 'cortex_list_tasks',
  description:
    'List tasks with optional filtering by status. ' +
    'Use this to discover work items and track progress.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      status: {
        type: 'string',
        enum: ['open', 'in_progress', 'done', 'cancelled'],
        description: 'Filter by task status',
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

  async execute(input: ListTasksInput): Promise<string> {
    const tasks = await client.getTasks({
      status: input.status,
      limit: input.limit || 20,
    });

    if (tasks.length === 0) {
      let msg = 'No tasks found';
      if (input.status) {
        msg += ` with status: ${input.status}`;
      }
      return appendActiveThreadFooter(msg);
    }

    let output = `# Tasks\n\n`;
    output += `Found ${tasks.length} task(s)\n\n`;

    for (const task of tasks) {
      output += `## ${task.title}\n`;
      output += `- **ID:** \`${task.id}\`\n`;
      output += `- **Status:** ${task.status}\n`;
      output += `- **Priority:** ${task.priority}\n`;

      if (task.assignee) {
        output += `- **Assignee:** ${task.assignee.display_name} (@${task.assignee.handle})\n`;
      }

      if (task.due_date) {
        output += `- **Due date:** ${task.due_date}\n`;
      }

      if (task.body) {
        const preview = task.body.length > 200
          ? task.body.substring(0, 200) + '...'
          : task.body;
        output += `- **Body:** ${preview}\n`;
      }

      output += `\n`;
    }

    return appendActiveThreadFooter(output);
  },
};
