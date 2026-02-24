/**
 * cortex.list_artifacts
 *
 * List artifacts with optional filtering.
 * Use to browse documentation, decisions, and procedures.
 */

import { z } from 'zod';
import { client } from '../client.js';
import { appendActiveThreadFooter } from './state.js';

export const listArtifactsSchema = z.object({
  topic_id: z
    .string()
    .uuid()
    .optional()
    .describe('Filter by topic ID'),
  status: z
    .enum(['draft', 'proposed', 'accepted', 'deprecated'])
    .optional()
    .describe('Filter by artifact status'),
  // Note: type filter is accepted in schema for future use but
  // the client API does not currently support server-side type filtering.
  // Filtering is applied client-side when this parameter is provided.
  type: z
    .enum(['decision', 'procedure', 'document', 'glossary'])
    .optional()
    .describe('Filter by artifact type'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .optional()
    .describe('Maximum results (default: 20)'),
});

export type ListArtifactsInput = z.infer<typeof listArtifactsSchema>;

export const listArtifactsTool = {
  name: 'cortex_list_artifacts',
  description:
    'List artifacts with optional filtering by topic, status, and type. ' +
    'Use this to browse documentation, decisions, and procedures.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      topic_id: {
        type: 'string',
        format: 'uuid',
        description: 'Filter by topic ID',
      },
      status: {
        type: 'string',
        enum: ['draft', 'proposed', 'accepted', 'deprecated'],
        description: 'Filter by artifact status',
      },
      type: {
        type: 'string',
        enum: ['decision', 'procedure', 'document', 'glossary'],
        description: 'Filter by artifact type',
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

  async execute(input: ListArtifactsInput): Promise<string> {
    // Note: client.getArtifacts does not support type filter server-side.
    // We pass topicId, status, and limit, then filter by type client-side.
    const artifacts = await client.getArtifacts({
      topicId: input.topic_id,
      status: input.status,
      limit: input.limit || 20,
    });

    // Apply client-side type filter if provided
    const filtered = input.type
      ? artifacts.filter(a => a.type === input.type)
      : artifacts;

    if (filtered.length === 0) {
      let msg = 'No artifacts found';
      const filters: string[] = [];
      if (input.topic_id) filters.push(`topic_id=${input.topic_id}`);
      if (input.status) filters.push(`status=${input.status}`);
      if (input.type) filters.push(`type=${input.type}`);
      if (filters.length > 0) {
        msg += ` matching filters: ${filters.join(', ')}`;
      }
      return appendActiveThreadFooter(msg);
    }

    let output = `# Artifacts\n\n`;
    output += `Found ${filtered.length} artifact(s)\n\n`;

    for (const artifact of filtered) {
      output += `## ${artifact.title}\n`;
      output += `- **ID:** \`${artifact.id}\`\n`;
      output += `- **Type:** ${artifact.type}\n`;
      output += `- **Status:** ${artifact.status}\n`;
      output += `- **Topic:** ${artifact.topic.name} (\`${artifact.topic.handle}\`)\n`;

      if (artifact.summary) {
        const preview = artifact.summary.length > 200
          ? artifact.summary.substring(0, 200) + '...'
          : artifact.summary;
        output += `- **Summary:** ${preview}\n`;
      }

      output += `\n`;
    }

    return appendActiveThreadFooter(output);
  },
};
