/**
 * cortex.create_knowledge_link
 *
 * Create a relationship link between two artifacts.
 * Supports: supersedes, supports, contradicts, depends_on, related_to
 */

import { z } from 'zod';
import { client } from '../client.js';
import { appendActiveThreadFooter } from './state.js';

export const createKnowledgeLinkSchema = z.object({
  source_id: z
    .string()
    .uuid()
    .describe('Source artifact ID'),
  target_id: z
    .string()
    .uuid()
    .describe('Target artifact ID'),
  link_type: z
    .enum(['supersedes', 'supports', 'contradicts', 'depends_on', 'related_to'])
    .describe('Relationship type. supersedes: source replaces target. contradicts: source conflicts with target. supports: source provides evidence for target. depends_on: source depends on target. related_to: general relationship.'),
});

export type CreateKnowledgeLinkInput = z.infer<typeof createKnowledgeLinkSchema>;

export const createKnowledgeLinkTool = {
  name: 'cortex_create_knowledge_link',
  description:
    'Create a relationship link between two artifacts. ' +
    'Use this to mark supersession, contradiction, support, dependency, or general relationships between knowledge artifacts.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      source_id: {
        type: 'string',
        format: 'uuid',
        description: 'Source artifact ID',
      },
      target_id: {
        type: 'string',
        format: 'uuid',
        description: 'Target artifact ID',
      },
      link_type: {
        type: 'string',
        enum: ['supersedes', 'supports', 'contradicts', 'depends_on', 'related_to'],
        description: 'Relationship type',
      },
    },
    required: ['source_id', 'target_id', 'link_type'],
  },

  async execute(input: CreateKnowledgeLinkInput): Promise<string> {
    try {
      // Fetch both artifacts for confirmation output
      const [source, target] = await Promise.all([
        client.getArtifact(input.source_id),
        client.getArtifact(input.target_id),
      ]);

      await client.createKnowledgeLink({
        source_id: input.source_id,
        target_id: input.target_id,
        link_type: input.link_type,
      });

      const linkVerb: Record<string, string> = {
        supersedes: 'supersedes',
        supports: 'supports',
        contradicts: 'contradicts',
        depends_on: 'depends on',
        related_to: 'is related to',
      };

      let output = `# Knowledge Link Created\n\n`;
      output += `**${source.title}** ${linkVerb[input.link_type]} **${target.title}**\n\n`;
      output += `- **Link type:** ${input.link_type}\n`;
      output += `- **Source:** \`${input.source_id}\`\n`;
      output += `- **Target:** \`${input.target_id}\`\n`;

      if (input.link_type === 'supersedes') {
        output += `\n> The target artifact should be deprecated if it hasn't been already.\n`;
      }
      if (input.link_type === 'contradicts') {
        output += `\n> A contradiction has been recorded. This should be resolved — consider which artifact reflects current truth.\n`;
      }

      return appendActiveThreadFooter(output);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('not found') || message.includes('Not found')) {
        return appendActiveThreadFooter(
          `# Error: Artifact not found\n\n` +
          `One or both artifact IDs do not exist. Use \`cortex_search\` or \`cortex_list_artifacts\` to find valid IDs.`
        );
      }
      throw error;
    }
  },
};
