/**
 * cortex.create_topic
 *
 * Create a new topic. Topics organize threads and artifacts by project.
 * IMPORTANT: Only use this after the human has explicitly approved topic creation.
 */

import { z } from 'zod';
import { client } from '../client.js';

export const createTopicSchema = z.object({
  handle: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z][a-z0-9-]*$/, 'Handle must start with a letter and contain only lowercase letters, digits, and hyphens')
    .describe('URL-friendly handle (e.g., "my-project"). Lowercase letters, digits, hyphens. Must start with a letter.'),
  name: z
    .string()
    .min(1)
    .max(200)
    .describe('Display name for the topic (e.g., "My Project")'),
  description: z
    .string()
    .max(20000)
    .optional()
    .describe('What this topic is about — project scope, goals, key areas'),
  icon: z
    .string()
    .max(4)
    .optional()
    .describe('Emoji icon for the topic (e.g., "🔬")'),
  first_principles: z
    .string()
    .max(50000)
    .optional()
    .describe('Markdown defining guiding principles and success criteria for this topic'),
});

export type CreateTopicInput = z.infer<typeof createTopicSchema>;

export const createTopicTool = {
  name: 'cortex_create_topic',
  description:
    'Create a new topic to organize threads and artifacts for a project. ' +
    'Topics represent entire projects — only call this after the human has explicitly approved creation. ' +
    'If your work does not match any existing topic, ASK the human first before calling this tool.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      handle: {
        type: 'string',
        description: 'URL-friendly handle (e.g., "my-project"). Lowercase letters, digits, hyphens. Must start with a letter. Min 3, max 64 chars.',
        minLength: 3,
        maxLength: 64,
      },
      name: {
        type: 'string',
        description: 'Display name for the topic (e.g., "My Project")',
        minLength: 1,
        maxLength: 200,
      },
      description: {
        type: 'string',
        description: 'What this topic is about — project scope, goals, key areas',
        maxLength: 20000,
      },
      icon: {
        type: 'string',
        description: 'Emoji icon for the topic (e.g., "🔬")',
        maxLength: 4,
      },
      first_principles: {
        type: 'string',
        description: 'Markdown defining guiding principles and success criteria for this topic',
        maxLength: 50000,
      },
    },
    required: ['handle', 'name'],
  },

  async execute(input: CreateTopicInput): Promise<string> {
    const topic = await client.createTopic(input);

    let output = `# Topic Created\n\n`;
    output += `- **Topic ID:** \`${topic.id}\`\n`;
    output += `- **Handle:** ${topic.handle}\n`;
    output += `- **Name:** ${topic.name}\n`;
    if (topic.icon) output += `- **Icon:** ${topic.icon}\n`;
    if (topic.description) output += `- **Description:** ${topic.description.slice(0, 200)}${topic.description.length > 200 ? '...' : ''}\n`;
    if (topic.first_principles) output += `- **First Principles:** defined (${topic.first_principles.length} chars)\n`;
    output += `\n> Use topic ID \`${topic.id}\` when creating threads and artifacts for this project.\n`;

    return output;
  },
};
