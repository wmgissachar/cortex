/**
 * cortex.draft_artifact
 *
 * Create a new artifact draft.
 * Artifacts must be reviewed and accepted by a human (trust tier 2).
 */

import { z } from 'zod';
import { client } from '../client.js';
import { appendActiveThreadFooter } from './state.js';

export const draftArtifactSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(500)
    .describe('Artifact title'),
  body: z
    .string()
    .min(1)
    .max(100000)
    .describe('Artifact content (supports markdown)'),
  type: z
    .enum(['decision', 'procedure', 'document', 'glossary'])
    .describe('Artifact type: decision (architectural choices), procedure (how-to guides), document (general docs), glossary (term definitions)'),
  topic_id: z
    .string()
    .uuid()
    .describe('Parent topic ID'),
  summary: z
    .string()
    .max(1000)
    .optional()
    .describe('Brief summary for search results (recommended)'),
  tags: z
    .array(z.string().max(64))
    .max(20)
    .optional()
    .describe('Tags for categorization'),
  supersedes: z
    .string()
    .uuid()
    .optional()
    .describe('ID of artifact this one supersedes (creates a knowledge link)'),
});

export type DraftArtifactInput = z.infer<typeof draftArtifactSchema>;

export const draftArtifactTool = {
  name: 'cortex_draft_artifact',
  description:
    'Create a new artifact draft for documentation, decisions, procedures, or glossary entries. ' +
    'The artifact will be created with status "draft" and must be reviewed and accepted by a human ' +
    'administrator before it becomes part of the accepted knowledge base. ' +
    'Use this to propose new documentation based on your analysis or discussions.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      title: {
        type: 'string',
        description: 'Artifact title',
        minLength: 1,
        maxLength: 500,
      },
      body: {
        type: 'string',
        description: 'Artifact content (supports markdown)',
        minLength: 1,
        maxLength: 100000,
      },
      type: {
        type: 'string',
        enum: ['decision', 'procedure', 'document', 'glossary'],
        description: 'Artifact type',
      },
      topic_id: {
        type: 'string',
        format: 'uuid',
        description: 'Parent topic ID',
      },
      summary: {
        type: 'string',
        description: 'Brief summary for search results (recommended)',
        maxLength: 1000,
      },
      tags: {
        type: 'array',
        items: { type: 'string', maxLength: 64 },
        maxItems: 20,
        description: 'Tags for categorization',
      },
      supersedes: {
        type: 'string',
        format: 'uuid',
        description: 'ID of artifact this supersedes (creates a knowledge link)',
      },
    },
    required: ['title', 'body', 'type', 'topic_id'],
  },

  async execute(input: DraftArtifactInput): Promise<string> {
    const artifact = await client.createArtifact({
      title: input.title,
      body: input.body,
      type: input.type,
      topic_id: input.topic_id,
      summary: input.summary,
      tags: input.tags,
    });

    let output = `# Artifact Draft Created\n\n`;
    output += `- **Artifact ID:** \`${artifact.id}\`\n`;
    output += `- **Title:** ${artifact.title}\n`;
    output += `- **Type:** ${artifact.type}\n`;
    output += `- **Status:** ${artifact.status}\n`;
    output += `- **Topic:** ${artifact.topic.name} (\`${artifact.topic.handle}\`)\n`;
    output += `- **Created at:** ${new Date(artifact.created_at).toISOString()}\n`;

    if (artifact.thread_id) {
      output += `- **Discussion Thread:** \`${artifact.thread_id}\`\n`;
    }

    if (input.tags && input.tags.length > 0) {
      output += `- **Tags:** ${input.tags.join(', ')}\n`;
    }

    if (artifact.thread_id) {
      output += `\n> **TIP:** Use thread ID \`${artifact.thread_id}\` with \`cortex_observe\` to add discussion comments to this artifact.\n`;
    }

    output += `\n## Summary\n\n`;
    output += artifact.summary || '*No summary provided*';

    if (input.supersedes) {
      try {
        await client.createKnowledgeLink({
          source_id: artifact.id,
          target_id: input.supersedes,
          link_type: 'supersedes',
        });
        output += `\n- **Supersedes:** Artifact \`${input.supersedes}\` (knowledge link created)\n`;
      } catch (err) {
        output += `\n> Warning: Could not create supersession link: ${err instanceof Error ? err.message : String(err)}\n`;
      }
    }

    // Outcome tag tip
    const hasOutcomeTag = input.tags?.some(t => ['dead-end', 'blocked', 'validated', 'exploratory'].includes(t));
    if (!hasOutcomeTag) {
      output += `\n> **TIP:** Consider adding an outcome tag (\`dead-end\`, \`validated\`, \`blocked\`, or \`exploratory\`) to help briefings surface this artifact appropriately.\n`;
    }

    output += `\n\n---\n\n`;
    output += `**Note:** This artifact has been created as a draft. `;
    output += `It must be reviewed and accepted by a workspace administrator `;
    output += `before it becomes part of the accepted knowledge base.`;

    return appendActiveThreadFooter(output);
  },
};
