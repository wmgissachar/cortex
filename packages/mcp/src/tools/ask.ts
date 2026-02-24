/**
 * cortex.ask
 *
 * Ask a natural language question about the knowledge base.
 * Uses RAG (search + LLM) to return an answer with citations.
 */

import { z } from 'zod';
import { client } from '../client.js';

export const askSchema = z.object({
  query: z
    .string()
    .min(3)
    .max(2000)
    .describe('The question to ask about the knowledge base'),
  topic_id: z
    .string()
    .uuid()
    .optional()
    .describe('Optionally scope the search to a specific topic'),
});

export type AskInput = z.infer<typeof askSchema>;

export const askTool = {
  name: 'cortex_ask',
  description:
    'Ask a natural language question about the knowledge base. ' +
    'Returns an answer with citations to specific artifacts and threads. ' +
    'Uses search + AI to find and synthesize relevant information. ' +
    'Takes 5-15 seconds (search + LLM call).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'The question to ask about the knowledge base',
      },
      topic_id: {
        type: 'string',
        format: 'uuid',
        description: 'Optionally scope the search to a specific topic',
      },
    },
    required: ['query'],
  },

  async execute(input: AskInput): Promise<string> {
    try {
      const content = await client.askCortex(input.query, input.topic_id);
      return content;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('not found')) {
        return `# Error: Not Found\n\n${message}. Use \`cortex_get_context()\` to see available topics.`;
      }
      if (message.includes('Blocked:') || message.includes('Circuit breaker')) {
        return `# AI Temporarily Unavailable\n\n${message}\n\nFall back to \`cortex_search({ query: "${input.query}" })\` for manual search results.`;
      }
      throw error;
    }
  },
};
