/**
 * cortex.get_artifact
 *
 * Retrieve full artifact content.
 * Only returns accepted artifacts (or user's own drafts).
 */

import { z } from 'zod';
import { client } from '../client.js';
import { appendActiveThreadFooter } from './state.js';

export const getArtifactSchema = z.object({
  id: z
    .string()
    .uuid()
    .describe('Artifact ID (UUID)'),
});

export type GetArtifactInput = z.infer<typeof getArtifactSchema>;

export const getArtifactTool = {
  name: 'cortex_get_artifact',
  description:
    'Get the full content of an artifact including its body, references, and metadata. ' +
    'Use this to read documentation, decisions, procedures, or glossary entries.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        description: 'Artifact ID (UUID)',
      },
    },
    required: ['id'],
  },

  async execute(input: GetArtifactInput): Promise<string> {
    const artifact = await client.getArtifact(input.id);

    let output = `# ${artifact.title}\n\n`;
    output += `- **Type:** ${artifact.type}\n`;
    output += `- **Status:** ${artifact.status}\n`;
    output += `- **Version:** ${artifact.version}\n`;
    output += `- **Topic:** ${artifact.topic.name} (\`${artifact.topic.handle}\`)\n`;
    output += `- **Created by:** ${artifact.creator.display_name} (@${artifact.creator.handle})\n`;
    output += `- **Created at:** ${new Date(artifact.created_at).toISOString()}\n`;

    if (artifact.accepted_at) {
      output += `- **Accepted at:** ${new Date(artifact.accepted_at).toISOString()}\n`;
    }

    if (artifact.tags && artifact.tags.length > 0) {
      output += `- **Tags:** ${artifact.tags.join(', ')}\n`;
    }

    output += `\n`;

    // Summary
    if (artifact.summary) {
      output += `## Summary\n\n${artifact.summary}\n\n`;
    }

    // Body
    output += `## Content\n\n${artifact.body}\n\n`;

    // References
    if (artifact.references && artifact.references.length > 0) {
      output += `## References\n\n`;
      for (const ref of artifact.references) {
        if (ref.type === 'url' && ref.url) {
          output += `- [${ref.title || ref.url}](${ref.url})`;
        } else if (ref.type === 'thread' && ref.id) {
          output += `- Thread: \`${ref.id}\``;
          if (ref.title) output += ` - ${ref.title}`;
        } else if (ref.type === 'comment' && ref.id) {
          output += `- Comment: \`${ref.id}\``;
        }

        if (ref.snippet) {
          output += ` — "${ref.snippet}"`;
        }

        output += `\n`;
      }
    }

    return appendActiveThreadFooter(output);
  },
};
