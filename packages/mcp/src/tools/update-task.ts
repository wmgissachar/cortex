/**
 * cortex.update_task
 *
 * Update a task's status.
 * Used to track progress on assigned work.
 */

import { z } from 'zod';
import { client } from '../client.js';
import { appendActiveThreadFooter } from './state.js';

export const updateTaskSchema = z.object({
  id: z
    .string()
    .uuid()
    .describe('Task ID'),
  status: z
    .enum(['open', 'in_progress', 'done', 'cancelled'])
    .optional()
    .describe('New status for the task'),
  title: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe('New title for the task'),
  body: z
    .string()
    .max(10000)
    .optional()
    .describe('New body/description for the task'),
  priority: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .describe('New priority for the task'),
  due_date: z
    .string()
    .optional()
    .describe('New due date for the task (ISO 8601 format)'),
  tags: z
    .array(z.string().max(64))
    .max(20)
    .optional()
    .describe('Tags for the task'),
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const updateTaskTool = {
  name: 'cortex_update_task',
  description:
    "Update a task's status, title, priority, or other fields. Use this to " +
    'track progress and manage work items.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        description: 'Task ID',
      },
      status: {
        type: 'string',
        enum: ['open', 'in_progress', 'done', 'cancelled'],
        description: 'New status for the task',
      },
      title: {
        type: 'string',
        description: 'New title for the task',
        minLength: 1,
        maxLength: 500,
      },
      body: {
        type: 'string',
        description: 'New body/description for the task',
        maxLength: 10000,
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'New priority for the task',
      },
      due_date: {
        type: 'string',
        description: 'New due date for the task (ISO 8601 format)',
      },
      tags: {
        type: 'array',
        items: { type: 'string', maxLength: 64 },
        maxItems: 20,
        description: 'Tags for the task',
      },
    },
    required: ['id'],
  },

  async execute(input: UpdateTaskInput): Promise<string> {
    const updates: Record<string, unknown> = {};
    if (input.status !== undefined) updates.status = input.status;
    if (input.title !== undefined) updates.title = input.title;
    if (input.body !== undefined) updates.body = input.body;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.due_date !== undefined) updates.due_date = input.due_date;
    if (input.tags !== undefined) updates.tags = input.tags;

    const task = await client.updateTask(input.id, updates);

    const statusEmoji = {
      open: '📋',
      in_progress: '🔄',
      done: '✅',
      cancelled: '❌',
    }[task.status] || '📋';

    let output = `# Task Updated ${statusEmoji}\n\n`;
    output += `- **Task ID:** \`${task.id}\`\n`;
    output += `- **Title:** ${task.title}\n`;
    output += `- **Status:** ${task.status}\n`;
    output += `- **Priority:** ${task.priority}\n`;
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

    return appendActiveThreadFooter(output);
  },
};
