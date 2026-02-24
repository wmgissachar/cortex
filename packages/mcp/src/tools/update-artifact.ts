/**
 * cortex.update_artifact
 *
 * Update a draft artifact.
 * Only artifacts with 'draft' status can be updated.
 */

import { z } from 'zod';
import { client } from '../client.js';
import { appendActiveThreadFooter } from './state.js';

export const updateArtifactSchema = z.object({
  id: z
    .string()
    .uuid()
    .describe('Artifact ID (UUID)'),
  title: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe('New title'),
  body: z
    .string()
    .min(1)
    .max(100000)
    .optional()
    .describe('New content (supports markdown)'),
  summary: z
    .string()
    .max(1000)
    .optional()
    .describe('New summary'),
  tags: z
    .array(z.string().max(64))
    .max(20)
    .optional()
    .describe('New tags'),
});

export type UpdateArtifactInput = z.infer<typeof updateArtifactSchema>;

export const updateArtifactTool = {
  name: 'cortex_update_artifact',
  description:
    'Update a draft artifact. Only artifacts with \'draft\' status can be updated. ' +
    'Use this to improve documentation before it is reviewed and accepted.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        description: 'Artifact ID (UUID)',
      },
      title: {
        type: 'string',
        description: 'New title',
        minLength: 1,
        maxLength: 500,
      },
      body: {
        type: 'string',
        description: 'New content (supports markdown)',
        minLength: 1,
        maxLength: 100000,
      },
      summary: {
        type: 'string',
        description: 'New summary',
        maxLength: 1000,
      },
      tags: {
        type: 'array',
        items: { type: 'string', maxLength: 64 },
        maxItems: 20,
        description: 'New tags',
      },
    },
    required: ['id'],
  },

  async execute(input: UpdateArtifactInput): Promise<string> {
    const updates: Record<string, unknown> = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.body !== undefined) updates.body = input.body;
    if (input.summary !== undefined) updates.summary = input.summary;
    if (input.tags !== undefined) updates.tags = input.tags;

    const artifact = await client.updateArtifact(input.id, updates);

    let output = `# Artifact Updated\n\n`;
    output += `- **Artifact ID:** \`${artifact.id}\`\n`;
    output += `- **Title:** ${artifact.title}\n`;
    output += `- **Type:** ${artifact.type}\n`;
    output += `- **Status:** ${artifact.status}\n`;
    output += `- **Updated at:** ${new Date(artifact.updated_at).toISOString()}\n`;

    output += `\n## Updated Fields\n\n`;
    if (input.title !== undefined) output += `- title\n`;
    if (input.body !== undefined) output += `- body\n`;
    if (input.summary !== undefined) output += `- summary\n`;
    if (input.tags !== undefined) output += `- tags\n`;

    return appendActiveThreadFooter(output);
  },
};
