/**
 * cortex.create_task
 *
 * Create a new task to track work.
 * Tasks can be associated with topics or threads for context.
 */

import { z } from 'zod';
import { client } from '../client.js';
import { appendActiveThreadFooter } from './state.js';

export const createTaskSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(500)
    .describe('Task title'),
  body: z
    .string()
    .max(10000)
    .optional()
    .describe('Task description (supports markdown)'),
  topic_id: z
    .string()
    .uuid()
    .optional()
    .describe('Associate with a topic'),
  thread_id: z
    .string()
    .uuid()
    .optional()
    .describe('Associate with a thread'),
  priority: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .describe('Task priority (default: medium)'),
  due_date: z
    .string()
    .optional()
    .describe('Due date (YYYY-MM-DD format)'),
  tags: z
    .array(z.string().max(64))
    .max(20)
    .optional()
    .describe('Tags for categorization'),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const createTaskTool = {
  name: 'cortex_create_task',
  description:
    'Create a new task to track work. Tasks can be associated with topics or ' +
    'threads for context.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'Task title',
        minLength: 1,
        maxLength: 500,
      },
      body: {
        type: 'string',
        description: 'Task description (supports markdown)',
        maxLength: 10000,
      },
      topic_id: {
        type: 'string',
        format: 'uuid',
        description: 'Associate with a topic',
      },
      thread_id: {
        type: 'string',
        format: 'uuid',
        description: 'Associate with a thread',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Task priority (default: medium)',
      },
      due_date: {
        type: 'string',
        description: 'Due date (YYYY-MM-DD format)',
      },
      tags: {
        type: 'array',
        items: { type: 'string', maxLength: 64 },
        maxItems: 20,
        description: 'Tags for categorization',
      },
    },
    required: ['title'],
  },

  async execute(input: CreateTaskInput): Promise<string> {
    const task = await client.createTask(input);

    let output = `# Task Created\n\n`;
    output += `- **Task ID:** \`${task.id}\`\n`;
    output += `- **Title:** ${task.title}\n`;
    output += `- **Status:** ${task.status}\n`;
    output += `- **Priority:** ${task.priority}\n`;
    output += `- **Created at:** ${new Date(task.created_at).toISOString()}\n`;

    if (task.due_date) {
      output += `- **Due date:** ${task.due_date}\n`;
    }

    if (input.tags && input.tags.length > 0) {
      output += `- **Tags:** ${input.tags.join(', ')}\n`;
    }

    if (input.body) {
      output += `\n## Description Preview\n\n`;
      const preview = input.body.length > 500
        ? input.body.slice(0, 500) + '...'
        : input.body;
      output += preview;
    }

    return appendActiveThreadFooter(output);
  },
};
