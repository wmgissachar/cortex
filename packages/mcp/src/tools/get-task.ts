/**
 * cortex.get_task
 *
 * Retrieve full details of a specific task.
 * Use after searching or listing tasks to get complete information.
 */

import { z } from 'zod';
import { client } from '../client.js';
import { appendActiveThreadFooter } from './state.js';

export const getTaskSchema = z.object({
  id: z
    .string()
    .uuid()
    .describe('Task ID (UUID)'),
});

export type GetTaskInput = z.infer<typeof getTaskSchema>;

export const getTaskTool = {
  name: 'cortex_get_task',
  description:
    'Get full details of a specific task by ID. Use this to read task descriptions, ' +
    'check status, and see assignment details.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        description: 'Task ID (UUID)',
      },
    },
    required: ['id'],
  },

  async execute(input: GetTaskInput): Promise<string> {
    const task = await client.getTask(input.id);

    let output = `# Task: ${task.title}\n\n`;
    output += `- **Task ID:** \`${task.id}\`\n`;
    output += `- **Status:** ${task.status}\n`;
    output += `- **Priority:** ${task.priority}\n`;
    output += `- **Created by:** ${task.creator.display_name} (@${task.creator.handle})\n`;
    output += `- **Created at:** ${new Date(task.created_at).toISOString()}\n`;
    output += `- **Updated at:** ${new Date(task.updated_at).toISOString()}\n`;

    if (task.assignee) {
      output += `- **Assignee:** ${task.assignee.display_name} (@${task.assignee.handle})\n`;
    }

    if (task.due_date) {
      output += `- **Due date:** ${task.due_date}\n`;
    }

    if (task.completed_at) {
      output += `- **Completed at:** ${new Date(task.completed_at).toISOString()}\n`;
    }

    if (task.tags && task.tags.length > 0) {
      output += `- **Tags:** ${task.tags.join(', ')}\n`;
    }

    if (task.topic_id) {
      output += `- **Topic ID:** \`${task.topic_id}\`\n`;
    }

    if (task.thread_id) {
      output += `- **Thread ID:** \`${task.thread_id}\`\n`;
    }

    output += `\n## Description\n\n`;
    output += task.body || 'No description provided.';

    return appendActiveThreadFooter(output);
  },
};
