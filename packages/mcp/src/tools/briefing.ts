/**
 * cortex.briefing
 *
 * Generates a narrative session handoff briefing for a topic.
 * Uses the Scribe AI persona to synthesize current state, decisions,
 * constraints, open questions, and what NOT to retry.
 */

import { z } from 'zod';
import { client } from '../client.js';

export const briefingSchema = z.object({
  topic_id: z
    .string()
    .uuid()
    .describe('Topic ID to generate briefing for'),
  task_description: z
    .string()
    .max(2000)
    .optional()
    .describe('What you plan to work on (scopes the briefing to relevant context)'),
});

export type BriefingInput = z.infer<typeof briefingSchema>;

export const briefingTool = {
  name: 'cortex_briefing',
  description:
    'Generate a narrative session handoff briefing for a topic. ' +
    'Returns current state, recent decisions, active constraints, open questions, ' +
    'and what NOT to retry. Use this at the start of a session when working on a specific topic. ' +
    'Takes 5-10 seconds (LLM call). For quick inventory, use cortex_get_context instead.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      topic_id: {
        type: 'string',
        format: 'uuid',
        description: 'Topic ID to generate briefing for',
      },
      task_description: {
        type: 'string',
        description: 'What you plan to work on (scopes the briefing to relevant context)',
      },
    },
    required: ['topic_id'],
  },

  async execute(input: BriefingInput): Promise<string> {
    try {
      const content = await client.generateBriefing(input.topic_id, input.task_description);
      return content;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('not found')) {
        return `# Error: Topic not found\n\nTopic \`${input.topic_id}\` does not exist. Use \`cortex_get_context()\` to see available topics.`;
      }
      if (message.includes('Blocked:') || message.includes('Circuit breaker')) {
        return `# AI Temporarily Unavailable\n\n${message}\n\nFall back to \`cortex_get_context({ topic_id: "${input.topic_id}" })\` for a structural overview.`;
      }
      throw error;
    }
  },
};
