/**
 * cortex.session_complete
 *
 * Audits session documentation quality and returns a scorecard.
 * Agents should call this BEFORE resolving their session thread.
 */

import { z } from 'zod';
import { client } from '../client.js';

export const sessionCompleteSchema = z.object({
  thread_id: z
    .string()
    .uuid()
    .describe('Your session thread ID'),
  topic_id: z
    .string()
    .uuid()
    .describe('The topic you worked on'),
});

export type SessionCompleteInput = z.infer<typeof sessionCompleteSchema>;

interface AuditSuggestion {
  priority: 'must' | 'should' | 'consider';
  message: string;
  action_hint?: string;
}

interface AuditResult {
  thread: {
    id: string;
    title: string;
    status: string;
    has_summary: boolean;
    has_body: boolean;
    created_at: string;
  };
  observations: {
    total: number;
    with_sub_type: number;
    by_sub_type: Record<string, number>;
    untyped: Array<{ id: string; body_preview: string }>;
  };
  checkpoints: { total: number };
  artifacts: {
    total: number;
    by_type: Record<string, number>;
  };
  tasks: {
    total: number;
    by_priority: Record<string, number>;
  };
  knowledge_links: { total: number };
  suggestions: AuditSuggestion[];
  score: {
    completed: number;
    total: number;
  };
}

function scoreLabel(completed: number, total: number): string {
  const ratio = completed / total;
  if (ratio >= 1) return 'Excellent';
  if (ratio >= 0.85) return 'Good';
  if (ratio >= 0.6) return 'Needs attention';
  return 'Incomplete';
}

export const sessionCompleteTool = {
  name: 'cortex_session_complete',
  description:
    'Audits your session documentation and returns a scorecard showing what\'s ' +
    'well-documented and what\'s missing. Call this BEFORE resolving your session ' +
    'thread. Address all \'must\' items and consider \'should\' items before closing out. ' +
    'Required at the end of every non-trivial session.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      thread_id: {
        type: 'string',
        format: 'uuid',
        description: 'Your session thread ID',
      },
      topic_id: {
        type: 'string',
        format: 'uuid',
        description: 'The topic you worked on',
      },
    },
    required: ['thread_id', 'topic_id'],
  },

  async execute(input: SessionCompleteInput): Promise<string> {
    try {
      const audit = await client.getSessionAudit(
        input.thread_id,
        input.topic_id,
      ) as unknown as AuditResult;

      const { score, suggestions, thread, observations, checkpoints, artifacts, tasks, knowledge_links } = audit;
      const label = scoreLabel(score.completed, score.total);

      let output = `## Session Documentation Scorecard\n\n`;
      output += `**Score: ${score.completed}/${score.total} — ${label}**\n\n`;

      // Completed items
      const completed: string[] = [];
      if (thread.title.length > 10) completed.push('Thread created with descriptive title');
      if (thread.has_summary) completed.push('Thread has summary');
      if (observations.total > 0) completed.push(`${observations.total} observation(s) posted`);
      if (observations.with_sub_type > 0) {
        const types = Object.entries(observations.by_sub_type)
          .map(([k, v]) => `${v} ${k}`)
          .join(', ');
        completed.push(`Typed observations: ${types}`);
      }
      if (checkpoints.total > 0) completed.push(`${checkpoints.total} checkpoint(s) recorded`);
      if (artifacts.total > 0) {
        const types = Object.entries(artifacts.by_type)
          .map(([k, v]) => `${v} ${k}`)
          .join(', ');
        completed.push(`${artifacts.total} artifact(s) created: ${types}`);
      }
      if (tasks.total > 0) completed.push(`${tasks.total} task(s) created`);
      if (knowledge_links.total > 0) completed.push(`${knowledge_links.total} knowledge link(s)`);

      if (completed.length > 0) {
        output += `### Completed\n`;
        for (const item of completed) {
          output += `- [x] ${item}\n`;
        }
        output += `\n`;
      }

      // Group suggestions by priority
      const must = suggestions.filter((s: AuditSuggestion) => s.priority === 'must');
      const should = suggestions.filter((s: AuditSuggestion) => s.priority === 'should');
      const consider = suggestions.filter((s: AuditSuggestion) => s.priority === 'consider');

      if (must.length > 0) {
        output += `### Must Address\n`;
        for (const s of must) {
          output += `- [ ] **${s.message.split('\n')[0]}**\n`;
          // Show sub-lines (indented details)
          const lines = s.message.split('\n').slice(1);
          for (const line of lines) {
            output += `${line}\n`;
          }
          if (s.action_hint) {
            output += `  → \`${s.action_hint}\`\n`;
          }
        }
        output += `\n`;
      }

      if (should.length > 0) {
        output += `### Should Address\n`;
        for (const s of should) {
          output += `- [ ] **${s.message.split('\n')[0]}**\n`;
          const lines = s.message.split('\n').slice(1);
          for (const line of lines) {
            output += `${line}\n`;
          }
          if (s.action_hint) {
            output += `  → \`${s.action_hint}\`\n`;
          }
        }
        output += `\n`;
      }

      if (consider.length > 0) {
        output += `### Consider\n`;
        for (const s of consider) {
          output += `- [ ] ${s.message.split('\n')[0]}\n`;
          const lines = s.message.split('\n').slice(1);
          for (const line of lines) {
            output += `${line}\n`;
          }
        }
        output += `\n`;
      }

      if (must.length === 0 && should.length === 0 && consider.length === 0) {
        output += `### All checks passed!\n\n`;
        output += `Your session documentation looks complete. You can resolve this thread.\n`;
      } else {
        output += `---\n\n`;
        output += `Address the items above, then resolve your thread with:\n`;
        output += `\`cortex_update_thread({ id: "${input.thread_id}", status: "resolved", summary: "..." })\`\n`;
      }

      return output;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Thread not found') || message.includes('not found')) {
        return (
          `# Error: Thread or topic not found\n\n` +
          `Could not find thread \`${input.thread_id}\` or topic \`${input.topic_id}\`.\n\n` +
          `## How to fix\n\n` +
          `1. Use \`cortex_list_threads\` to find your session thread\n` +
          `2. Use \`cortex_get_context\` to find the correct topic ID\n`
        );
      }
      throw error;
    }
  },
};
