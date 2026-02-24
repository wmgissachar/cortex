/**
 * cortex.events_summary
 *
 * Get a summary of Cortex activity events for evaluation.
 * Shows human engagement, agent tool usage, and key behavioral metrics.
 */

import { z } from 'zod';
import { client } from '../client.js';

export const eventsSummarySchema = z.object({
  days: z
    .number()
    .int()
    .min(1)
    .max(365)
    .default(30)
    .optional()
    .describe('Number of days to summarize (default: 30, max: 365)'),
});

export type EventsSummaryInput = z.infer<typeof eventsSummarySchema>;

export const eventsSummaryTool = {
  name: 'cortex_events_summary',
  description:
    'Get a summary of Cortex activity events for evaluation. Shows human engagement metrics (page views, digest views, searches, AI usage), agent tool usage patterns, and daily activity breakdown. Use this to assess how well Cortex is being adopted and which features are delivering value.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      days: {
        type: 'number',
        description: 'Number of days to summarize (default: 30, max: 365)',
      },
    },
  },

  async execute(input: EventsSummaryInput): Promise<string> {
    const days = input.days || 30;
    const summary = await client.getEventsSummary(days) as Record<string, unknown>;

    // Format as readable markdown
    const lines: string[] = [];
    lines.push(`# Activity Events Summary (last ${days} days)`);
    lines.push('');

    const period = summary.period as { from: string; to: string } | undefined;
    if (period) {
      lines.push(`**Period:** ${period.from?.substring(0, 10)} to ${period.to?.substring(0, 10)}`);
      lines.push('');
    }

    const human = summary.human as Record<string, unknown> | undefined;
    if (human) {
      lines.push('## Human Engagement');
      lines.push(`- **Active days:** ${human.active_days}`);
      lines.push(`- **Total events:** ${human.total_events}`);
      lines.push(`- **Digest views:** ${human.digest_views}`);
      lines.push(`- **Briefing views:** ${human.briefing_views}`);
      lines.push(`- **Searches:** ${human.searches}`);
      lines.push(`- **Ask AI queries:** ${human.ask_ai_queries}`);
      lines.push(`- **Artifacts edited:** ${human.artifacts_edited}`);
      lines.push(`- **Artifacts deprecated:** ${human.artifacts_deprecated}`);
      lines.push(`- **Threads resolved:** ${human.threads_resolved}`);
      lines.push(`- **Config changes:** ${human.config_changes}`);
      lines.push(`- **Link navigations:** ${human.link_navigations}`);

      const pages = human.pages as Record<string, number> | undefined;
      if (pages && Object.keys(pages).length > 0) {
        lines.push('');
        lines.push('### Page Views');
        for (const [page, count] of Object.entries(pages).sort((a, b) => b[1] - a[1])) {
          lines.push(`- ${page}: ${count}`);
        }
      }

      const aiOutputs = human.ai_outputs_viewed as Record<string, number> | undefined;
      if (aiOutputs && Object.keys(aiOutputs).length > 0) {
        lines.push('');
        lines.push('### AI Outputs Viewed');
        for (const [feature, count] of Object.entries(aiOutputs).sort((a, b) => b[1] - a[1])) {
          lines.push(`- ${feature}: ${count}`);
        }
      }
      lines.push('');
    }

    const agent = summary.agent as Record<string, unknown> | undefined;
    if (agent) {
      lines.push('## Agent Activity');
      lines.push(`- **Total tool calls:** ${agent.total_tool_calls}`);
      lines.push(`- **Estimated sessions:** ${agent.estimated_sessions}`);

      const tools = agent.tools as Record<string, number> | undefined;
      if (tools && Object.keys(tools).length > 0) {
        lines.push('');
        lines.push('### Tool Usage');
        for (const [tool, count] of Object.entries(tools).sort((a, b) => b[1] - a[1])) {
          lines.push(`- ${tool}: ${count}`);
        }
      }
      lines.push('');
    }

    const daily = summary.daily as Array<{ date: string; human_events: number; agent_events: number }> | undefined;
    if (daily && daily.length > 0) {
      lines.push('## Daily Activity');
      lines.push('| Date | Human | Agent |');
      lines.push('|------|-------|-------|');
      for (const day of daily.slice(-14)) { // Last 14 days
        lines.push(`| ${day.date} | ${day.human_events} | ${day.agent_events} |`);
      }
    }

    return lines.join('\n');
  },
};
