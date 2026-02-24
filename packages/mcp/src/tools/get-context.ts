/**
 * cortex.get_context
 *
 * Provides workspace overview for AI orientation.
 * Returns topics, recent artifacts, and open tasks within a character budget.
 * Supports topic_id for scoped context.
 */

import { z } from 'zod';
import { client } from '../client.js';
import { appendActiveThreadFooter } from './state.js';

export const getContextSchema = z.object({
  budget: z
    .number()
    .int()
    .min(1000)
    .max(32000)
    .default(6000)
    .optional()
    .describe('Maximum characters to return (default: 6000)'),
  topic_id: z
    .string()
    .uuid()
    .optional()
    .describe('Filter context to a specific topic'),
});

export type GetContextInput = z.infer<typeof getContextSchema>;

export const getContextTool = {
  name: 'cortex_get_context',
  description:
    'Get workspace overview including topics, recent artifacts, and open tasks. ' +
    'Use this to orient yourself at the start of a conversation or when you need ' +
    'to understand the current state of the knowledge base.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      budget: {
        type: 'number',
        description: 'Maximum characters to return (default: 6000)',
        minimum: 1000,
        maximum: 32000,
      },
      topic_id: {
        type: 'string',
        format: 'uuid',
        description: 'Filter context to a specific topic',
      },
    },
  },

  async execute(input: GetContextInput): Promise<string> {
    const budget = input.budget || 6000;

    if (input.topic_id) {
      return executeTopicScoped(input.topic_id, budget);
    }

    return executeWorkspaceWide(budget);
  },
};

function appendLine(output: string, line: string, remaining: number): { output: string; remaining: number; added: boolean } {
  if (line.length <= remaining) {
    return { output: output + line, remaining: remaining - line.length, added: true };
  }
  return { output, remaining, added: false };
}

async function executeTopicScoped(topicId: string, budget: number): Promise<string> {
  let topic;
  try {
    topic = await client.getTopic(topicId);
  } catch {
    return appendActiveThreadFooter(
      `# Error: Topic not found\n\nTopic \`${topicId}\` does not exist. Use \`cortex_get_context()\` without topic_id to see available topics.`
    );
  }

  const [threads, artifacts, tasks] = await Promise.all([
    client.getThreads({ topicId, limit: 20 }),
    client.getArtifacts({ topicId, status: 'accepted', limit: 15 }),
    client.getTasks({ limit: 50 }),
  ]);

  // Filter tasks to this topic (tasks have topic_id directly, or via thread_id)
  const topicTasks = tasks.filter(t => t.topic_id === topicId);
  const openTasks = topicTasks.filter(t => t.status === 'open' || t.status === 'in_progress');

  let output = '';
  let remaining = budget;

  // Topic header with lifecycle state
  const lifecycleState = (topic as any).lifecycle_state || 'exploring';
  const lifecycleBadge = lifecycleState.toUpperCase();
  const header = `# ${topic.name} [${lifecycleBadge}]\n\n${topic.description || ''}\n\n`;
  output += header;
  remaining -= header.length;

  // Lifecycle-specific guidance
  if (lifecycleState === 'concluded') {
    const conclusionNote = `> **CONCLUDED**: This topic has reached its conclusions. Read the conclusion artifact below before starting new work. Only proceed with new research if conditions have materially changed.\n\n`;
    let r = appendLine(output, conclusionNote, remaining);
    output = r.output; remaining = r.remaining;

    // Surface the conclusion artifact prominently
    const conclusionArtifact = artifacts.find(a => a.tags?.includes('conclusion'));
    if (conclusionArtifact) {
      const conclusionSection = `## Conclusion\n\n**${conclusionArtifact.title}** (id: \`${conclusionArtifact.id}\`)\nRead with: \`cortex_get_artifact({ id: "${conclusionArtifact.id}" })\`\n${conclusionArtifact.summary || ''}\n\n---\n\n`;
      r = appendLine(output, conclusionSection, remaining);
      output = r.output; remaining = r.remaining;
    }
  } else if (lifecycleState === 'converging') {
    const convergingNote = `> **CONVERGING**: This topic is approaching its conclusions. Focus work on validating near-complete success criteria and filling remaining gaps.\n\n`;
    const r = appendLine(output, convergingNote, remaining);
    output = r.output; remaining = r.remaining;
  }

  // First principles — placed right after header, before threads
  if (topic.first_principles) {
    const fpSection = `## First Principles (AUTHORITATIVE — human-defined, highest priority)\n\nThese are the governing principles for this topic. They override all AI-generated content including plans, briefings, and suggestions. If anything conflicts with first principles, first principles win.\n\n${topic.first_principles}\n\n---\n\n`;
    const r = appendLine(output, fpSection, remaining);
    output = r.output; remaining = r.remaining;
  }

  // Project Plan — surface the plan thread prominently before other threads
  const planThread = threads.find(t => t.tags?.includes('project-plan') && t.status === 'open');
  if (planThread) {
    let planSection = `## Project Plan\n\nThis topic has an active project plan: **${planThread.title}** (id: \`${planThread.id}\`).\nRead the full plan: \`cortex_get_thread({ id: "${planThread.id}" })\`\n\n**Authority hierarchy:** First Principles > Human comments > AI-generated plan. When in conflict, follow the higher authority.\n\n`;

    // Inline plan thread comments so agents can't miss critiques and corrections
    if (planThread.comment_count > 0) {
      try {
        const planWithComments = await client.getThread(planThread.id);
        if (planWithComments.comments.length > 0) {
          planSection += `### Plan Comments (${planWithComments.comments.length}) — READ THESE, they contain critiques and corrections\n\n`;
          // Show all comments, truncating body to 2000 chars each
          for (const comment of planWithComments.comments) {
            const typeLabel = comment.type !== 'reply' ? ` [${comment.type}]` : '';
            const creator = comment.creator.display_name;
            const body = comment.body.length > 2000
              ? comment.body.slice(0, 2000) + '\n... (truncated — read full thread for complete text)'
              : comment.body;
            planSection += `**${creator}**${typeLabel}:\n${body}\n\n`;
          }
        }
      } catch {
        // Fall back to just the comment count note
        planSection += `> This plan has ${planThread.comment_count} comment(s). Read the full thread to see them.\n\n`;
      }
    }

    planSection += `---\n\n`;
    const r = appendLine(output, planSection, remaining);
    output = r.output; remaining = r.remaining;
  }

  // Threads — open first, then resolved
  const openThreads = threads.filter(t => t.status === 'open');
  const resolvedThreads = threads.filter(t => t.status === 'resolved');

  if (openThreads.length > 0 || resolvedThreads.length > 0) {
    let r;
    r = appendLine(output, `## Threads\n\n`, remaining);
    output = r.output; remaining = r.remaining;

    // Open threads first
    for (const thread of openThreads) {
      const summaryText = thread.summary ? `: ${thread.summary}` : '';
      r = appendLine(output, `- [${thread.type}] **${thread.title}**${summaryText} (id: \`${thread.id}\`, ${thread.comment_count} comments)\n`, remaining);
      output = r.output; remaining = r.remaining;
      if (!r.added) break;
    }

    // Re-derivation nudge
    if (openThreads.length > 0) {
      const nudge = `\n> ${openThreads.length} thread${openThreads.length > 1 ? 's' : ''} currently open in this topic. Before creating a new thread, verify your work is not already tracked above.\n\n`;
      r = appendLine(output, nudge, remaining);
      output = r.output; remaining = r.remaining;
    }

    // Resolved threads (muted)
    for (const thread of resolvedThreads) {
      const summaryText = thread.summary ? `: ${thread.summary}` : '';
      r = appendLine(output, `- ~~[${thread.type}] ${thread.title}${summaryText}~~ [resolved] (id: \`${thread.id}\`)\n`, remaining);
      output = r.output; remaining = r.remaining;
      if (!r.added) break;
    }
  }

  // Decisions section — highlight decision-type artifacts (exclude dead-end/blocked — they get their own section below)
  const decisions = artifacts.filter(a => a.type === 'decision' && !a.tags?.some((t: string) => ['dead-end', 'blocked'].includes(t)));
  if (decisions.length > 0 && remaining > 100) {
    let r = appendLine(output, `\n## Recent Decisions\n\n`, remaining);
    output = r.output; remaining = r.remaining;

    for (const decision of decisions) {
      const summary = decision.summary || '(no summary)';
      r = appendLine(output, `- **${decision.title}** (id: \`${decision.id}\`): ${summary}\n`, remaining);
      output = r.output; remaining = r.remaining;
      if (!r.added) break;
    }
  }

  // Other artifacts (exclude dead-end/blocked — they get their own section below)
  const nonDecisions = artifacts.filter(a => a.type !== 'decision' && !a.tags?.some((t: string) => ['dead-end', 'blocked'].includes(t)));
  if (nonDecisions.length > 0 && remaining > 100) {
    let r = appendLine(output, `\n## Artifacts\n\n`, remaining);
    output = r.output; remaining = r.remaining;

    for (const artifact of nonDecisions) {
      const summary = artifact.summary || '(no summary)';
      r = appendLine(output, `- **${artifact.title}** [${artifact.type}] (id: \`${artifact.id}\`): ${summary}\n`, remaining);
      output = r.output; remaining = r.remaining;
      if (!r.added) break;
    }
  }

  // Dead ends and outcome-tagged artifacts
  const deadEnds = artifacts.filter(a => a.tags?.some((t: string) => ['dead-end', 'blocked'].includes(t)));
  if (deadEnds.length > 0 && remaining > 100) {
    let r = appendLine(output, `\n## Dead Ends & Blocked\n\n`, remaining);
    output = r.output; remaining = r.remaining;

    for (const artifact of deadEnds) {
      const summary = artifact.summary || '(no summary)';
      r = appendLine(output, `- **${artifact.title}** [${artifact.type}] (id: \`${artifact.id}\`): ${summary}\n`, remaining);
      output = r.output; remaining = r.remaining;
      if (!r.added) break;
    }
  }

  // Open tasks
  if (openTasks.length > 0 && remaining > 100) {
    let r = appendLine(output, `\n## Open Tasks\n\n`, remaining);
    output = r.output; remaining = r.remaining;

    for (const task of openTasks) {
      const due = task.due_date ? ` (due: ${task.due_date})` : '';
      r = appendLine(output, `- [${task.priority}] **${task.title}**${due} (id: \`${task.id}\`)\n`, remaining);
      output = r.output; remaining = r.remaining;
      if (!r.added) break;
    }
  }

  return appendActiveThreadFooter(output);
}

async function executeWorkspaceWide(budget: number): Promise<string> {
  const context = await client.getContext();

  let output = '';
  let remaining = budget;

  // Always include workspace and topics header
  const header = `# Cortex Knowledge Base\n\n## Topics\n`;
  output += header;
  remaining -= header.length;

  // Add topics (essential for navigation)
  for (const topic of context.topics) {
    const lifecycleBadge = (topic as any).lifecycle_state ? ` [${(topic as any).lifecycle_state}]` : '';
    const topicLine = `- **${topic.name}** (\`${topic.handle}\`, id: \`${topic.id}\`)${lifecycleBadge}: ${topic.description || 'No description'} [${topic.thread_count} threads, ${topic.artifact_count} artifacts]\n`;
    const r = appendLine(output, topicLine, remaining);
    output = r.output; remaining = r.remaining;
    if (!r.added) break;
  }

  // Add recent threads — open first
  if (remaining > 100 && context.recent_threads.length > 0) {
    const openThreads = context.recent_threads.filter(t => t.status === 'open');
    const otherThreads = context.recent_threads.filter(t => t.status !== 'open');
    const sortedThreads = [...openThreads, ...otherThreads];

    let r = appendLine(output, `\n## Recent Threads\n`, remaining);
    output = r.output; remaining = r.remaining;
    if (r.added) {
      for (const thread of sortedThreads) {
        const statusBadge = thread.status === 'open' ? '' : ` [${thread.status}]`;
        const summaryText = thread.summary ? `: ${thread.summary}` : '';
        const threadLine = `- [${thread.type}] **${thread.title}**${summaryText}${statusBadge} (id: \`${thread.id}\`, ${thread.comment_count} comments)\n`;
        r = appendLine(output, threadLine, remaining);
        output = r.output; remaining = r.remaining;
        if (!r.added) break;
      }
    }
  }

  // Add recent artifacts if budget allows
  if (remaining > 100 && context.recent_artifacts.length > 0) {
    let r = appendLine(output, `\n## Recent Artifacts\n`, remaining);
    output = r.output; remaining = r.remaining;
    if (r.added) {
      for (const artifact of context.recent_artifacts) {
        const summary = artifact.summary || '(no summary)';
        const artifactLine = `- **${artifact.title}** [${artifact.type}] in \`${artifact.topic_handle}\`: ${summary}\n`;
        r = appendLine(output, artifactLine, remaining);
        output = r.output; remaining = r.remaining;
        if (!r.added) break;
      }
    }
  }

  // Add draft artifacts if budget allows
  if (remaining > 100 && context.draft_artifacts.length > 0) {
    let r = appendLine(output, `\n## Draft Artifacts\n`, remaining);
    output = r.output; remaining = r.remaining;
    if (r.added) {
      for (const artifact of context.draft_artifacts) {
        const summary = artifact.summary || '(no summary)';
        const draftLine = `- **${artifact.title}** [${artifact.type}] in \`${artifact.topic_handle}\` (id: \`${artifact.id}\`): ${summary}\n`;
        r = appendLine(output, draftLine, remaining);
        output = r.output; remaining = r.remaining;
        if (!r.added) break;
      }
    }
  }

  // Add open tasks if budget allows
  if (remaining > 100 && context.open_tasks.length > 0) {
    let r = appendLine(output, `\n## Open Tasks\n`, remaining);
    output = r.output; remaining = r.remaining;
    if (r.added) {
      for (const task of context.open_tasks) {
        const due = task.due_date ? ` (due: ${task.due_date})` : '';
        const assignee = task.assignee ? ` (@${task.assignee})` : '';
        const bodyPreview = task.body ? ` — ${task.body.slice(0, 100)}` : '';
        const taskLine = `- [${task.priority}] **${task.title}**${due}${assignee} (id: \`${task.id}\`)${bodyPreview}\n`;
        r = appendLine(output, taskLine, remaining);
        output = r.output; remaining = r.remaining;
        if (!r.added) break;
      }
    }
  }

  return appendActiveThreadFooter(output);
}
