import type { ContextAssembler } from '@cortex/ai';
import { threadRepository } from '../repositories/thread.repository.js';
import { commentRepository } from '../repositories/comment.repository.js';
import { artifactRepository } from '../repositories/artifact.repository.js';
import { dashboardRepository } from '../repositories/dashboard.repository.js';
import { activityRepository } from '../repositories/activity.repository.js';
import { topicRepository } from '../repositories/topic.repository.js';
import { searchService } from './search.service.js';
import { aiJobRepository } from '../repositories/ai-job.repository.js';
import db from '../db/index.js';

/**
 * Assembles context for AI agent invocations by fetching
 * the relevant thread/artifact content from the database.
 */
export const aiContextService: ContextAssembler = {
  async assemble(params) {
    const { targetId, targetType, workspaceId } = params;

    switch (targetType) {
      case 'thread':
        return assembleThreadContext(targetId);
      case 'artifact':
        return assembleArtifactContext(targetId, workspaceId);
      case 'workspace':
        return assembleDashboardContext(targetId); // targetId = workspaceId
      case 'topic':
        return assembleTopicBriefingContext(targetId, workspaceId);
      default:
        throw new Error(`Unknown target type: ${targetType}`);
    }
  },
};

/**
 * Scribe context: full thread with all comments formatted as a discussion transcript.
 */
async function assembleThreadContext(threadId: string): Promise<string> {
  const thread = await threadRepository.findById(threadId);
  if (!thread) throw new Error(`Thread not found: ${threadId}`);

  const comments = await commentRepository.findByThread(threadId, { limit: 100 });

  const lines: string[] = [
    `Please summarize the following resolved thread from the Cortex knowledge base.`,
    ``,
    `# Thread: ${thread.title}`,
    `Status: ${thread.status} | Type: ${thread.type} | Created by: ${thread.creator_handle}`,
    `Created: ${thread.created_at.toISOString().split('T')[0]}`,
    thread.tags.length > 0 ? `Tags: ${thread.tags.join(', ')}` : '',
    ``,
  ];

  if (thread.body) {
    lines.push(`## Description`, ``, thread.body, ``);
  }

  lines.push(`---`, ``);

  for (let i = 0; i < comments.length; i++) {
    const c = comments[i];
    const timestamp = c.created_at.toISOString().replace('T', ' ').slice(0, 16);
    lines.push(
      `## Comment ${i + 1} (${c.creator_handle}, ${timestamp})`,
      ``,
      c.body,
      ``,
    );
  }

  return lines.join('\n');
}

/**
 * Critic/Linker context: artifact content + related artifacts for cross-reference.
 */
async function assembleArtifactContext(
  artifactId: string,
  workspaceId: string,
): Promise<string> {
  const artifact = await artifactRepository.findById(artifactId);
  if (!artifact) throw new Error(`Artifact not found: ${artifactId}`);

  // Get related artifacts from the same topic for cross-referencing
  const related = await artifactRepository.findAll(workspaceId, {
    limit: 10,
    topicId: artifact.topic_id,
    status: 'accepted',
  });

  const otherArtifacts = related.filter((a) => a.id !== artifactId).slice(0, 5);

  const lines: string[] = [
    `# Artifact Under Review`,
    ``,
    `ID: ${artifact.id}`,
    `Title: ${artifact.title}`,
    `Type: ${artifact.type} | Status: ${artifact.status} | Topic: ${artifact.topic_name}`,
    `Created by: ${artifact.creator_handle} | Date: ${artifact.created_at.toISOString().split('T')[0]}`,
    artifact.tags.length > 0 ? `Tags: ${artifact.tags.join(', ')}` : '',
    ``,
  ];

  if (artifact.summary) {
    lines.push(`## Summary`, ``, artifact.summary, ``);
  }

  lines.push(`## Content`, ``, artifact.body, ``);

  if (otherArtifacts.length > 0) {
    lines.push(
      `---`,
      ``,
      `## Context: Related Artifacts in Same Topic`,
      ``,
    );

    for (let i = 0; i < otherArtifacts.length; i++) {
      const a = otherArtifacts[i];
      lines.push(
        `### ${i + 1}. ${a.title}`,
        `ID: ${a.id} | Type: ${a.type} | Status: ${a.status}`,
        a.summary ? `Summary: ${a.summary}` : '',
        ``,
      );
    }
  }

  return lines.join('\n');
}

/**
 * Daily Digest context: workspace-level dashboard data for the Scribe.
 */
async function assembleDashboardContext(workspaceId: string): Promise<string> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [summary, needsAttention, completions, health, activity] = await Promise.all([
    dashboardRepository.getSummary(workspaceId, since),
    dashboardRepository.getNeedsAttention(workspaceId, since),
    dashboardRepository.getRecentCompletions(workspaceId, since),
    dashboardRepository.getKnowledgeBaseHealth(workspaceId),
    activityRepository.getRecent(workspaceId, { limit: 30 }),
  ]);

  const lines: string[] = [
    `Produce a daily briefing for the Cortex knowledge base.`,
    `Lead with what matters most. Group by topic. Highlight contradictions, surprises,`,
    `and items needing human attention. Be specific — use names, numbers, and conclusions.`,
    ``,
    `# Activity Since Last Digest (last 24 hours)`,
    `- New artifacts: ${summary.new_artifacts}`,
    `- Resolved threads: ${summary.resolved_threads}`,
    `- New threads: ${summary.new_threads}`,
    `- New observations: ${summary.new_observations}`,
    `- Completed tasks: ${summary.completed_tasks}`,
    ``,
  ];

  if (needsAttention.length > 0) {
    lines.push(`# Items Needing Attention`, ``);
    for (const item of needsAttention) {
      lines.push(`- [${item.type}] "${item.title}" — ${item.reason} (${item.topic_name})`);
    }
    lines.push(``);
  }

  if (completions.length > 0) {
    lines.push(`# Recent Completions`, ``);
    for (const item of completions) {
      const summaryText = item.summary ? ` — ${item.summary.substring(0, 200)}` : '';
      lines.push(`- [${item.type}] "${item.title}"${summaryText} (${item.topic_name})`);
    }
    lines.push(``);
  }

  lines.push(
    `# Knowledge Base Health`,
    `- ${health.total_artifacts} artifacts (${health.accepted_count} accepted, ${health.deprecated_count} deprecated, ${health.draft_count} draft)`,
    `- ${health.open_threads} open threads, ${health.stale_threads} stale (open > 7 days)`,
    ``,
  );

  if (activity.items.length > 0) {
    lines.push(`# Recent Activity (chronological)`, ``);
    for (const item of activity.items) {
      const date = item.created_at.toISOString().replace('T', ' ').slice(0, 16);
      const title = item.title || item.thread_title || '';
      const bodyPreview = item.body ? ` — ${item.body.substring(0, 100)}` : '';
      lines.push(
        `- [${date}] ${item.activity_type}/${item.type} by ${item.creator_handle}: "${title}"${bodyPreview} (${item.topic_name})`,
      );
    }
    lines.push(``);
  }

  return lines.join('\n');
}

/**
 * Topic Briefing context: comprehensive topic overview for session handoff.
 * Fetches topic metadata, threads (with summaries), accepted artifacts,
 * open tasks, and negative results to produce a briefing prompt.
 */
export async function assembleTopicBriefingContext(
  topicId: string,
  workspaceId: string,
  taskDescription?: string,
): Promise<string> {
  const topic = await topicRepository.findById(topicId);
  if (!topic) throw new Error(`Topic not found: ${topicId}`);

  // Fetch everything in parallel for speed (<10s requirement)
  const [threads, artifacts, openTasks] = await Promise.all([
    threadRepository.findAll(workspaceId, { limit: 30, topicId }),
    artifactRepository.findAll(workspaceId, { limit: 15, topicId, status: 'accepted' }),
    findOpenTasksByTopic(workspaceId, topicId),
  ]);

  // Separate threads by status
  const openThreads = threads.filter(t => t.status === 'open');
  const resolvedThreads = threads.filter(t => t.status === 'resolved');

  // Separate decision artifacts from reference artifacts (exclude dead-end/blocked — they get their own section)
  const isDeadEnd = (a: any) => a.tags?.some((t: string) => ['dead-end', 'blocked'].includes(t));
  const decisions = artifacts.filter(a => a.type === 'decision' && !isDeadEnd(a));
  const otherArtifacts = artifacts.filter(a => a.type !== 'decision' && !isDeadEnd(a));

  const lines: string[] = [
    `Generate a session handoff briefing for the topic "${topic.name}" in the Cortex knowledge base.`,
    ``,
    `The briefing should help someone starting a new work session quickly understand:`,
    `1. **Current State** — What is this topic about? What is the overall trajectory?`,
    `2. **Recent Decisions** — Key decisions that constrain future work, with rationale.`,
    `3. **Active Work** — Open threads and what they're investigating or discussing.`,
    `4. **Open Tasks** — Concrete work items that need attention, prioritized.`,
    `5. **Active Constraints** — Design decisions, technical limitations, or policies in effect.`,
    `6. **What NOT to Retry** — Failed approaches, rejected alternatives, dead ends (from thread summaries and critic reviews). This is critical for preventing wasted effort.`,
    `7. **Open Questions** — Unresolved issues that need human input or further investigation.`,
    ``,
    `Write 2000-3000 tokens. Be specific — use names, IDs, and conclusions, not vague summaries.`,
    `Use Markdown. No preamble or sign-off.`,
    ``,
  ];

  if (taskDescription) {
    lines.push(
      `## Incoming Task Context`,
      ``,
      `The person reading this briefing intends to work on:`,
      `> ${taskDescription}`,
      ``,
      `Prioritize information relevant to this task. Flag any decisions, constraints, or failed approaches that directly affect it.`,
      ``,
    );
  }

  // Topic metadata
  lines.push(
    `---`,
    ``,
    `# Topic: ${topic.name}`,
    topic.description ? `Description: ${topic.description}` : '',
    `Stats: ${topic.thread_count} threads, ${topic.artifact_count} artifacts, ${topic.open_task_count} open tasks`,
    ``,
  );

  // First principles — guiding beliefs the briefing should reference
  if (topic.first_principles) {
    lines.push(
      `## First Principles (guiding beliefs and success criteria)`,
      ``,
      topic.first_principles,
      ``,
      `When generating the briefing, reference these first principles where relevant.`,
      ``,
    );
  }

  // Decisions (highest priority for briefing — they contain rationale)
  if (decisions.length > 0) {
    lines.push(`## Key Decisions`, ``);
    for (const d of decisions) {
      lines.push(
        `### ${d.title}`,
        `ID: ${d.id} | Created: ${d.created_at.toISOString().split('T')[0]} | By: ${d.creator_handle}`,
        d.summary ? `Summary: ${d.summary}` : '',
        d.body.length > 1500 ? d.body.substring(0, 1500) + '\n[...truncated]' : d.body,
        ``,
      );
    }
  }

  // Dead-end artifacts — critical for "What NOT to Retry"
  const deadEnds = artifacts.filter(a => a.tags?.some((t: string) => ['dead-end', 'blocked'].includes(t)));
  if (deadEnds.length > 0) {
    lines.push(`## Dead Ends & Blocked Approaches`, ``);
    for (const a of deadEnds) {
      const outcomeTags = a.tags?.filter((t: string) => ['dead-end', 'blocked'].includes(t)).join(', ') || '';
      lines.push(
        `### ${a.title} [${outcomeTags}]`,
        `ID: ${a.id} | Created: ${a.created_at.toISOString().split('T')[0]}`,
        a.summary ? `Summary: ${a.summary}` : '',
        a.body.length > 800 ? a.body.substring(0, 800) + '\n[...truncated]' : a.body,
        ``,
      );
    }
  }

  // Open threads
  if (openThreads.length > 0) {
    lines.push(`## Active Threads (Open)`, ``);
    for (const t of openThreads) {
      const summaryText = t.summary ? ` — ${t.summary}` : '';
      lines.push(
        `- [${t.type}] **${t.title}** (id: ${t.id})${summaryText}`,
        `  By: ${t.creator_handle} | ${t.comment_count} comments | Created: ${t.created_at.toISOString().split('T')[0]}`,
      );
    }
    lines.push(``);
  }

  // Resolved threads (contain summaries = negative knowledge)
  if (resolvedThreads.length > 0) {
    lines.push(`## Resolved Threads (for context and negative knowledge)`, ``);
    for (const t of resolvedThreads.slice(0, 15)) {
      const summaryText = t.summary ? `\n  Summary: ${t.summary}` : '';
      lines.push(
        `- [${t.type}] ${t.title} (id: ${t.id})${summaryText}`,
      );
    }
    lines.push(``);
  }

  // Other artifacts (documents, procedures, glossaries)
  if (otherArtifacts.length > 0) {
    lines.push(`## Reference Artifacts`, ``);
    for (const a of otherArtifacts) {
      lines.push(
        `- **${a.title}** [${a.type}] (id: ${a.id})`,
        a.summary ? `  Summary: ${a.summary}` : '',
      );
    }
    lines.push(``);
  }

  // Open tasks
  if (openTasks.length > 0) {
    lines.push(`## Open Tasks`, ``);
    for (const task of openTasks) {
      const due = task.due_date ? ` | Due: ${task.due_date}` : '';
      const assignee = task.assignee_handle ? ` | Assigned: ${task.assignee_handle}` : '';
      lines.push(
        `- [${task.priority}] **${task.title}** (id: ${task.id})${due}${assignee}`,
        task.body ? `  ${task.body.substring(0, 200)}` : '',
      );
    }
    lines.push(``);
  }

  return lines.filter(l => l !== undefined).join('\n');
}

/**
 * Ask Cortex Q&A: RAG-based context using search results.
 */
export async function assembleAskCortexContext(
  query: string,
  workspaceId: string,
  topicId?: string,
): Promise<string> {
  const results = await searchService.search(workspaceId, {
    query,
    limit: 10,
    topicId,
  });

  const contextItems: string[] = [];

  for (const result of results) {
    if (result.type === 'thread') {
      const thread = await threadRepository.findById(result.id);
      if (thread) {
        const summary = thread.summary || result.snippet || '';
        contextItems.push(
          `[Thread] "${thread.title}" (id: ${thread.id})`,
          `Status: ${thread.status} | Type: ${thread.type} | Topic: ${result.topic_handle}`,
          summary ? `Summary: ${summary}` : '',
          thread.body ? `Body: ${thread.body.substring(0, 1500)}` : '',
          '',
        );
      }
    } else if (result.type === 'artifact') {
      const artifact = await artifactRepository.findById(result.id);
      if (artifact) {
        contextItems.push(
          `[Artifact] "${artifact.title}" (id: ${artifact.id})`,
          `Type: ${artifact.type} | Status: ${artifact.status} | Topic: ${result.topic_handle}`,
          artifact.summary ? `Summary: ${artifact.summary}` : '',
          `Content: ${artifact.body.substring(0, 2000)}`,
          '',
        );
      }
    } else if (result.type === 'comment') {
      contextItems.push(
        `[Comment] (id: ${result.id}, thread: ${result.thread_id})`,
        `Snippet: ${result.snippet || result.title}`,
        '',
      );
    }
  }

  const lines: string[] = [
    `Answer the following question using ONLY the provided context from the Cortex knowledge base.`,
    `Cite specific artifacts and threads by title and ID. If the answer isn't in the context, say so clearly.`,
    `Use Markdown. Be specific and substantive.`,
    ``,
    `## Question`,
    ``,
    query,
    ``,
    `## Retrieved Context (${results.length} results)`,
    ``,
    ...contextItems,
  ];

  return lines.filter(l => l !== undefined).join('\n');
}

/**
 * Auto-Tagging: artifact content + existing tag taxonomy.
 */
export async function assembleAutoTagContext(
  artifactId: string,
  workspaceId: string,
): Promise<string> {
  const artifact = await artifactRepository.findById(artifactId);
  if (!artifact) throw new Error(`Artifact not found: ${artifactId}`);

  // Fetch existing tag taxonomy
  const { rows: tagRows } = await db.query<{ tag: string }>(
    `SELECT DISTINCT unnest(tags) AS tag FROM threads WHERE workspace_id = $1
     UNION
     SELECT DISTINCT unnest(tags) AS tag FROM artifacts WHERE workspace_id = $1
     ORDER BY tag`,
    [workspaceId],
  );
  const taxonomy = tagRows.map(r => r.tag);

  const lines: string[] = [
    `Given this artifact and the existing tag taxonomy, suggest 1-5 tags.`,
    `Return ONLY a JSON array of tag strings, e.g. ["tag1", "tag2"].`,
    `Prefer existing tags from the taxonomy when appropriate. Create new tags only when nothing fits.`,
    `Tags should be lowercase, hyphenated, and descriptive.`,
    ``,
    `## Artifact`,
    `Title: ${artifact.title}`,
    `Type: ${artifact.type}`,
    `Topic: ${artifact.topic_name}`,
    `Content:`,
    artifact.body.substring(0, 3000),
    ``,
    `## Existing Tag Taxonomy (${taxonomy.length} tags)`,
    taxonomy.length > 0 ? taxonomy.join(', ') : '(no existing tags)',
  ];

  return lines.join('\n');
}

/**
 * Thread Resolution Prompt: nudge for stale open threads.
 */
export async function assembleResolutionPromptContext(
  thread: { id: string; title: string; type: string; body: string | null; created_at: Date; comment_count: number },
): Promise<string> {
  const ageInDays = Math.floor((Date.now() - thread.created_at.getTime()) / (1000 * 60 * 60 * 24));

  const lines: string[] = [
    `This thread has been open for ${ageInDays} days with no recent activity.`,
    `Based on the title and body, write a 1-2 sentence nudge asking whether it should be resolved or if there's outstanding work.`,
    `Be helpful and concise, not nagging. Use Markdown.`,
    ``,
    `## Thread`,
    `Title: ${thread.title}`,
    `Type: ${thread.type}`,
    `Created: ${thread.created_at.toISOString().split('T')[0]} (${ageInDays} days ago)`,
    `Comments: ${thread.comment_count}`,
    thread.body ? `Body: ${thread.body.substring(0, 1000)}` : '',
  ];

  return lines.filter(l => l !== undefined).join('\n');
}

/**
 * Observation Triage: categorize observations in a thread.
 */
export async function assembleObservationTriageContext(
  threadId: string,
): Promise<string> {
  const thread = await threadRepository.findById(threadId);
  if (!thread) throw new Error(`Thread not found: ${threadId}`);

  const comments = await commentRepository.findByThread(threadId, { limit: 100 });
  const observations = comments.filter(c => c.type === 'observation');

  const lines: string[] = [
    `Categorize these observations into the following categories:`,
    `- **Key Results** — Important findings or outcomes`,
    `- **Decisions Made** — Choices that were committed to`,
    `- **Negative Results / Dead Ends** — Things that were tried and didn't work`,
    `- **Open Questions** — Unresolved items needing attention`,
    `- **Meta-Discussion** — Process or coordination notes`,
    ``,
    `For each category, list the observations with a 1-sentence summary. If a category has no items, omit it.`,
    `Use Markdown. Be concise.`,
    ``,
    `## Thread: ${thread.title}`,
    `Type: ${thread.type} | Status: ${thread.status}`,
    ``,
    `## Observations (${observations.length})`,
    ``,
  ];

  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    const date = obs.created_at.toISOString().replace('T', ' ').slice(0, 16);
    lines.push(
      `### Observation ${i + 1} (${obs.creator_handle}, ${date})`,
      obs.body.substring(0, 500),
      ``,
    );
  }

  return lines.join('\n');
}

/**
 * Contradiction Detection: cross-reference accepted artifacts for conflicts.
 */
export async function assembleContradictionContext(
  topicId: string,
  workspaceId: string,
): Promise<string> {
  const topic = await topicRepository.findById(topicId);
  if (!topic) throw new Error(`Topic not found: ${topicId}`);

  const artifacts = await artifactRepository.findAll(workspaceId, {
    limit: 20,
    topicId,
    status: 'accepted',
  });

  const lines: string[] = [
    `Analyze these artifacts for contradictions — places where one artifact claims X and another claims not-X,`,
    `or where implicit assumptions conflict.`,
    ``,
    `For each contradiction found:`,
    `1. Cite both artifacts by title and ID`,
    `2. Quote the conflicting passages`,
    `3. Rate severity: **critical** (blocks work), **substantive** (causes confusion), or **minor** (terminology/style)`,
    ``,
    `If no contradictions exist, say so clearly. Use Markdown.`,
    ``,
    `## Topic: ${topic.name}`,
    ``,
    `## Artifacts (${artifacts.length})`,
    ``,
  ];

  for (const a of artifacts) {
    lines.push(
      `### ${a.title}`,
      `ID: ${a.id} | Type: ${a.type} | Created: ${a.created_at.toISOString().split('T')[0]}`,
      a.summary ? `Summary: ${a.summary}` : '',
      a.body.substring(0, 800),
      ``,
    );
  }

  return lines.filter(l => l !== undefined).join('\n');
}

/**
 * Topic Synthesis: narrative overview of a topic's knowledge arc.
 */
export async function assembleTopicSynthesisContext(
  topicId: string,
  workspaceId: string,
): Promise<string> {
  const topic = await topicRepository.findById(topicId);
  if (!topic) throw new Error(`Topic not found: ${topicId}`);

  const [threads, artifacts] = await Promise.all([
    threadRepository.findAll(workspaceId, { limit: 30, topicId }),
    artifactRepository.findAll(workspaceId, { limit: 20, topicId, status: 'accepted' }),
  ]);

  const resolvedThreads = threads.filter(t => t.status === 'resolved');

  const lines: string[] = [
    `Write a 1-2 page narrative synthesis of this topic's knowledge arc.`,
    `How did understanding evolve? What were the key turning points?`,
    `What is the current state of knowledge?`,
    ``,
    `This synthesis should let a newcomer understand the topic's history and current conclusions`,
    `without reading individual threads. Use Markdown. Be substantive and specific.`,
    ``,
    `## Topic: ${topic.name}`,
    topic.description ? `Description: ${topic.description}` : '',
    `Stats: ${topic.thread_count} threads, ${topic.artifact_count} artifacts`,
    ``,
  ];

  if (resolvedThreads.length > 0) {
    lines.push(`## Resolved Threads (${resolvedThreads.length})`, ``);
    for (const t of resolvedThreads) {
      lines.push(
        `- **${t.title}** [${t.type}] (id: ${t.id})`,
        `  Created: ${t.created_at.toISOString().split('T')[0]} | By: ${t.creator_handle}`,
        t.summary ? `  Summary: ${t.summary}` : '',
        ``,
      );
    }
  }

  if (artifacts.length > 0) {
    lines.push(`## Accepted Artifacts (${artifacts.length})`, ``);
    for (const a of artifacts) {
      lines.push(
        `- **${a.title}** [${a.type}] (id: ${a.id})`,
        `  Created: ${a.created_at.toISOString().split('T')[0]}`,
        a.summary ? `  Summary: ${a.summary}` : '',
        ``,
      );
    }
  }

  return lines.filter(l => l !== undefined).join('\n');
}

/**
 * Staleness Detection: review artifacts for decay signals.
 */
export async function assembleStalenessContext(
  topicId: string,
  workspaceId: string,
): Promise<string> {
  const topic = await topicRepository.findById(topicId);
  if (!topic) throw new Error(`Topic not found: ${topicId}`);

  const artifacts = await artifactRepository.findAll(workspaceId, {
    limit: 30,
    topicId,
    status: 'accepted',
  });

  // Fetch knowledge links for context (table has no workspace_id — filter by artifact IDs only)
  const artifactIds = artifacts.map(a => a.id);
  const { rows: links } = await db.query<{
    source_id: string;
    target_id: string;
    link_type: string;
  }>(
    `SELECT source_id, target_id, link_type FROM knowledge_links
     WHERE source_id = ANY($1) OR target_id = ANY($1)`,
    [artifactIds],
  );

  const lines: string[] = [
    `Review these artifacts for staleness. Flag artifacts that:`,
    `(a) are unchanged 60+ days and make time-sensitive claims`,
    `(b) are superseded by newer artifacts but not deprecated`,
    `(c) reference conditions that may no longer hold`,
    ``,
    `For each stale artifact, cite by title and ID, explain why it appears stale, and suggest an action.`,
    `If no artifacts appear stale, say so. Use Markdown.`,
    ``,
    `## Topic: ${topic.name}`,
    `Today's date: ${new Date().toISOString().split('T')[0]}`,
    ``,
    `## Artifacts (${artifacts.length})`,
    ``,
  ];

  for (const a of artifacts) {
    const ageInDays = Math.floor((Date.now() - a.created_at.getTime()) / (1000 * 60 * 60 * 24));
    const relatedLinks = links.filter(l => l.source_id === a.id || l.target_id === a.id);
    const linkInfo = relatedLinks.length > 0
      ? `Links: ${relatedLinks.map(l => `${l.link_type}(${l.source_id === a.id ? l.target_id : l.source_id})`).join(', ')}`
      : '';

    lines.push(
      `### ${a.title}`,
      `ID: ${a.id} | Type: ${a.type} | Created: ${a.created_at.toISOString().split('T')[0]} (${ageInDays} days ago)`,
      a.summary ? `Summary: ${a.summary}` : '',
      linkInfo,
      ``,
    );
  }

  return lines.filter(l => l !== undefined).join('\n');
}

async function findOpenTasksByTopic(
  workspaceId: string,
  topicId: string,
): Promise<Array<{
  id: string;
  title: string;
  body: string | null;
  priority: string;
  due_date: string | null;
  assignee_handle: string | null;
}>> {
  const { rows } = await db.query<{
    id: string;
    title: string;
    body: string | null;
    priority: string;
    due_date: string | null;
    assignee_handle: string | null;
  }>(
    `SELECT t.id, t.title, t.body, t.priority, t.due_date, a.handle as assignee_handle
     FROM tasks t
     LEFT JOIN principals a ON t.assignee_id = a.id
     WHERE t.workspace_id = $1 AND t.topic_id = $2
       AND t.status IN ('open', 'in_progress')
     ORDER BY
       CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
       t.created_at DESC
     LIMIT 20`,
    [workspaceId, topicId],
  );
  return rows;
}

/**
 * Plan Generation context: forward-looking project plan prompt.
 * Fetches topic metadata (with first_principles), threads, accepted artifacts,
 * and open tasks to produce a structured plan generation prompt.
 */
/**
 * Fetch the latest progress scorecard for a topic and return compact
 * closeness-indicator lines suitable for injecting into planner/researcher context.
 * Returns empty array if no scorecard exists.
 */
export async function getScorecardProgressLines(
  workspaceId: string,
  topicId: string,
): Promise<string[]> {
  const scorecardJob = await aiJobRepository.findLatestByFeatureAndTarget(
    workspaceId, 'progress-scorecard', topicId,
  );
  const scorecard = (scorecardJob?.output as any)?.scorecard;
  if (!scorecard?.criteria || !Array.isArray(scorecard.criteria)) return [];

  const lines: string[] = [
    `## Progress Scorecard (current status per success criterion)`,
    ``,
    `Use these indicators to prioritize. Focus effort on BLOCKED and NOT_STARTED criteria.`,
    `Do not spend resources on ACHIEVED criteria unless they risk regressing.`,
    ``,
  ];
  for (const c of scorecard.criteria) {
    lines.push(`- **${c.name}**: ${c.closeness}`);
  }
  if (scorecard.overall?.closeness) {
    lines.push(`- **Overall**: ${scorecard.overall.closeness}`);
  }
  lines.push(``);
  return lines;
}

export async function assembleTopicPlanContext(
  topicId: string,
  workspaceId: string,
  latestResearch?: { content: string; created_at: string } | null,
  researchCritique?: string | null,
): Promise<string> {
  const topic = await topicRepository.findById(topicId);
  if (!topic) throw new Error(`Topic not found: ${topicId}`);

  // Fetch everything in parallel
  const [threads, artifacts, openTasks] = await Promise.all([
    threadRepository.findAll(workspaceId, { limit: 30, topicId }),
    artifactRepository.findAll(workspaceId, { limit: 15, topicId, status: 'accepted' }),
    findOpenTasksByTopic(workspaceId, topicId),
  ]);

  const openThreads = threads.filter(t => t.status === 'open');
  const resolvedThreads = threads.filter(t => t.status === 'resolved');
  const decisions = artifacts.filter(a => a.type === 'decision');
  const deadEnds = artifacts.filter(a => a.tags?.some((t: string) => ['dead-end', 'blocked'].includes(t)));

  const lines: string[] = [
    `Generate a project plan for the topic "${topic.name}".`,
    ``,
    `Your system prompt defines your output structure and principles. Use them.`,
    `The context below provides everything you need. Reference specific items by name/ID in your plan.`,
    ``,
    `---`,
    ``,
    `# Topic: ${topic.name}`,
    topic.description ? `Description: ${topic.description}` : '',
    ``,
  ];

  // First principles — the primary input for plan direction
  if (topic.first_principles) {
    lines.push(
      `## First Principles (guiding beliefs and success criteria)`,
      ``,
      topic.first_principles,
      ``,
      `The plan MUST serve these principles. Every phase should trace back to at least one principle or success criterion.`,
      ``,
    );
  }

  // Latest research report — the primary input for plan decisions
  if (latestResearch?.content) {
    lines.push(
      `## Latest Research Report`,
      ``,
      `The Researcher agent produced the following report on ${latestResearch.created_at}. Your plan MUST reference specific findings from this report by number/tag. Every phase should trace to research evidence.`,
      ``,
      latestResearch.content,
      ``,
    );
  } else {
    lines.push(
      `## Research Report`,
      ``,
      `No research report is available for this topic. Note this limitation in your plan and identify what research would strengthen it.`,
      ``,
    );
  }

  // Research critique — Critic's review of the research report
  if (researchCritique) {
    lines.push(
      `## Critic Review of Research`,
      ``,
      `The Critic agent reviewed the above research and flagged these issues. ` +
      `Address material concerns in your plan — either incorporate the feedback ` +
      `or explain why you disagree.`,
      ``,
      researchCritique,
      ``,
    );
  }

  // Progress scorecard — compact closeness indicators for prioritization
  const scorecardLines = await getScorecardProgressLines(workspaceId, topicId);
  if (scorecardLines.length > 0) {
    lines.push(...scorecardLines);
  }

  // Existing decisions — constraints the plan must respect
  if (decisions.length > 0) {
    lines.push(`## Existing Decisions (plan must respect these)`, ``);
    for (const d of decisions) {
      lines.push(
        `### ${d.title}`,
        d.summary ? `Summary: ${d.summary}` : '',
        d.body.length > 1000 ? d.body.substring(0, 1000) + '\n[...truncated]' : d.body,
        ``,
      );
    }
  }

  // Dead ends — plan must avoid these
  if (deadEnds.length > 0) {
    lines.push(`## Dead Ends (do NOT re-propose these approaches)`, ``);
    for (const a of deadEnds) {
      lines.push(
        `- **${a.title}**: ${a.summary || a.body.substring(0, 300)}`,
      );
    }
    lines.push(``);
  }

  // Open threads — work in progress to incorporate
  if (openThreads.length > 0) {
    lines.push(`## Active Threads (in-progress work to incorporate)`, ``);
    for (const t of openThreads) {
      const summaryText = t.summary ? ` — ${t.summary}` : '';
      lines.push(`- [${t.type}] **${t.title}**${summaryText}`);
    }
    lines.push(``);
  }

  // Resolved threads — completed work to build on
  if (resolvedThreads.length > 0) {
    lines.push(`## Resolved Threads (completed work — don't duplicate)`, ``);
    for (const t of resolvedThreads.slice(0, 10)) {
      const summaryText = t.summary ? ` — ${t.summary}` : '';
      lines.push(`- ${t.title}${summaryText}`);
    }
    lines.push(``);
  }

  // Open tasks — existing tracked work
  if (openTasks.length > 0) {
    lines.push(`## Existing Open Tasks (incorporate into plan phases)`, ``);
    for (const task of openTasks) {
      const due = task.due_date ? ` (due: ${task.due_date})` : '';
      lines.push(`- [${task.priority}] **${task.title}**${due}`);
    }
    lines.push(``);
  }

  return lines.filter(l => l !== undefined).join('\n');
}

/**
 * Lightweight context for the First Principles Wizard.
 * Gathers topic metadata, thread summaries, artifact titles, tasks, and research highlights.
 */
export async function assembleFirstPrinciplesContext(
  topicId: string,
  workspaceId: string,
): Promise<string> {
  const topic = await topicRepository.findById(topicId);
  if (!topic) throw new Error(`Topic not found: ${topicId}`);

  const [threads, artifacts, openTasks] = await Promise.all([
    threadRepository.findAll(workspaceId, { limit: 20, topicId }),
    artifactRepository.findAll(workspaceId, { limit: 15, topicId, status: 'accepted' }),
    findOpenTasksByTopic(workspaceId, topicId),
  ]);

  const lines: string[] = [
    `# Topic: ${topic.name}`,
    topic.description ? `Description: ${topic.description}` : '',
    '',
  ];

  if (topic.first_principles) {
    lines.push(`## Current First Principles`, '', topic.first_principles, '');
  }

  const resolvedThreads = threads.filter((t: any) => t.status === 'resolved');
  if (resolvedThreads.length > 0) {
    lines.push(`## Resolved Threads (key learnings)`, '');
    for (const t of resolvedThreads.slice(0, 10)) {
      const summary = (t as any).summary ? ` — ${(t as any).summary.slice(0, 200)}` : '';
      lines.push(`- ${t.title}${summary}`);
    }
    lines.push('');
  }

  const openThreads = threads.filter((t: any) => t.status === 'open');
  if (openThreads.length > 0) {
    lines.push(`## Open Threads (active work)`, '');
    for (const t of openThreads.slice(0, 8)) {
      lines.push(`- ${t.title}`);
    }
    lines.push('');
  }

  const isDeadEnd = (a: any) => a.tags?.some((t: string) => ['dead-end', 'blocked'].includes(t));
  const liveArtifacts = artifacts.filter((a: any) => !isDeadEnd(a));
  const deadEnds = artifacts.filter((a: any) => isDeadEnd(a));

  if (liveArtifacts.length > 0) {
    lines.push(`## Key Artifacts`, '');
    for (const a of liveArtifacts.slice(0, 8)) {
      const summary = (a as any).summary ? ` — ${(a as any).summary.slice(0, 150)}` : '';
      lines.push(`- [${a.type}] ${a.title}${summary}`);
    }
    lines.push('');
  }

  if (deadEnds.length > 0) {
    lines.push(`## Dead Ends (things that failed)`, '');
    for (const a of deadEnds) {
      lines.push(`- ${a.title}: ${(a as any).summary?.slice(0, 150) || 'no summary'}`);
    }
    lines.push('');
  }

  if (openTasks.length > 0) {
    lines.push(`## Open Tasks`, '');
    for (const task of openTasks.slice(0, 8)) {
      lines.push(`- [${task.priority}] ${task.title}`);
    }
    lines.push('');
  }

  const latestResearch = await aiJobRepository.findLatestResearchByTarget(workspaceId, topicId);
  const researchContent = (latestResearch?.output as any)?.content as string | undefined;
  if (researchContent) {
    const stratMatch = researchContent.match(/##\s*(?:\d+\)\s*)?Strategic Assessment([\s\S]*?)(?=\n##\s|$)/i);
    if (stratMatch) {
      lines.push(`## Research: Strategic Assessment`, '', stratMatch[1].trim().slice(0, 800), '');
    }
  }

  return lines.filter(l => l !== undefined).join('\n');
}

/**
 * Assemble context for a Progress Scorecard evaluation.
 * Gathers first_principles, research, plan, critique, threads, tasks, dead ends,
 * and previous scorecard for delta tracking.
 */
export async function assembleProgressScorecardContext(
  topicId: string,
  workspaceId: string,
): Promise<string> {
  const topic = await topicRepository.findById(topicId);
  if (!topic) throw new Error(`Topic not found: ${topicId}`);

  const [threads, artifacts, openTasks] = await Promise.all([
    threadRepository.findAll(workspaceId, { limit: 20, topicId }),
    artifactRepository.findAll(workspaceId, { limit: 30, topicId, status: 'accepted' }),
    findOpenTasksByTopic(workspaceId, topicId),
  ]);

  const lines: string[] = [
    `# Topic: ${topic.name}`,
    topic.description ? `Description: ${topic.description}` : '',
    '',
  ];

  // First principles (required for meaningful scorecard)
  if (topic.first_principles) {
    lines.push(`## First Principles & Success Criteria`, '', topic.first_principles, '');
  } else {
    lines.push(`## First Principles & Success Criteria`, '', '(No first principles defined)', '');
  }

  // Latest research strategic assessment + key findings
  const latestResearch = await aiJobRepository.findLatestResearchByTarget(workspaceId, topicId);
  const researchContent = (latestResearch?.output as any)?.content as string | undefined;
  if (researchContent) {
    const stratMatch = researchContent.match(/##\s*(?:\d+\)\s*)?Strategic Assessment([\s\S]*?)(?=\n##\s|$)/i);
    if (stratMatch) {
      lines.push(`## Research: Strategic Assessment`, '', stratMatch[1].trim().slice(0, 3000), '');
    }
    const quantMatch = researchContent.match(/##\s*(?:\d+\)\s*)?Quantitative Sanity Check([\s\S]*?)(?=\n##\s|$)/i);
    if (quantMatch) {
      lines.push(`## Research: Quantitative Sanity Check`, '', quantMatch[1].trim().slice(0, 1500), '');
    }
    // Include key findings / conclusions sections if present
    const findingsMatch = researchContent.match(/##\s*(?:\d+\)\s*)?(?:Key Findings|Conclusions|Results)([\s\S]*?)(?=\n##\s|$)/i);
    if (findingsMatch) {
      lines.push(`## Research: Key Findings`, '', findingsMatch[1].trim().slice(0, 2000), '');
    }
  }

  // Latest plan
  const latestPlan = await aiJobRepository.findLatestByFeatureAndTarget(workspaceId, 'project-plan', topicId);
  const planContent = (latestPlan?.output as any)?.content as string | undefined;
  if (planContent) {
    lines.push(`## Latest Plan (summary)`, '', planContent.slice(0, 2500), '');
  }

  // Latest plan critique
  const latestCritique = await aiJobRepository.findLatestByFeatureAndTarget(workspaceId, 'plan-critique', topicId);
  const critiqueContent = (latestCritique?.output as any)?.content as string | undefined;
  if (critiqueContent) {
    lines.push(`## Plan Critique (highlights)`, '', critiqueContent.slice(0, 800), '');
  }

  // Resolved threads = completed work
  const resolvedThreads = threads.filter((t: any) => t.status === 'resolved');
  if (resolvedThreads.length > 0) {
    lines.push(`## Completed Work (resolved threads)`, '');
    for (const t of resolvedThreads.slice(0, 10)) {
      const summary = (t as any).summary ? ` — ${(t as any).summary.slice(0, 200)}` : '';
      lines.push(`- ${t.title}${summary}`);
    }
    lines.push('');
  }

  // Open tasks
  if (openTasks.length > 0) {
    lines.push(`## Open Tasks`, '');
    for (const task of openTasks.slice(0, 8)) {
      lines.push(`- [${task.priority}] ${task.title}`);
    }
    lines.push('');
  }

  // Accepted artifacts — include actual content so the evaluator can cite real data
  const nonDeadEnd = artifacts.filter((a: any) => !a.tags?.some((t: string) => ['dead-end', 'blocked'].includes(t)));
  const HIGH_VALUE_TAGS = ['validated', 'procedure', 'decision', 'core-computation', 'conclusion', 'cross-project'];
  if (nonDeadEnd.length > 0) {
    // Split into high-value (include substantial body) and standard (include shorter body)
    const highValue = nonDeadEnd.filter((a: any) =>
      a.tags?.some((t: string) => HIGH_VALUE_TAGS.includes(t)) ||
      (a as any).artifact_type === 'procedure'
    );
    const standard = nonDeadEnd.filter((a: any) =>
      !a.tags?.some((t: string) => HIGH_VALUE_TAGS.includes(t)) &&
      (a as any).artifact_type !== 'procedure'
    );

    if (highValue.length > 0) {
      lines.push(`## Key Artifacts — Validated Findings & Procedures (FULL CONTENT)`, '');
      lines.push(`Use the actual data below (tables, numbers, rules, parameters) when writing practical_wins. Do NOT just reference these — extract and inline the specific values.`, '');
      for (const a of highValue.slice(0, 8)) {
        const tags = (a as any).tags?.length ? ` [${(a as any).tags.join(', ')}]` : '';
        const body = (a as any).body ? (a as any).body.slice(0, 3000) : '';
        lines.push(`### ${a.title} (${(a as any).artifact_type || 'document'})${tags}`, '');
        if (body) {
          lines.push(body, '');
        } else {
          const summary = (a as any).summary || 'no content';
          lines.push(summary, '');
        }
      }
    }

    if (standard.length > 0) {
      lines.push(`## Other Accepted Artifacts`, '');
      for (const a of standard.slice(0, 15)) {
        const tags = (a as any).tags?.length ? ` [${(a as any).tags.join(', ')}]` : '';
        const body = (a as any).body ? (a as any).body.slice(0, 800) : '';
        const summary = (a as any).summary ? (a as any).summary.slice(0, 300) : '';
        lines.push(`### ${a.title} (${(a as any).artifact_type || 'document'})${tags}`, '');
        lines.push(body || summary || 'no content', '');
      }
    }
  }

  // Dead ends
  const deadEnds = artifacts.filter((a: any) => a.tags?.some((t: string) => ['dead-end', 'blocked'].includes(t)));
  if (deadEnds.length > 0) {
    lines.push(`## Dead Ends (things that failed)`, '');
    for (const a of deadEnds) {
      lines.push(`- ${a.title}: ${(a as any).summary?.slice(0, 200) || 'no summary'}`);
    }
    lines.push('');
  }

  // Previous scorecard (for delta tracking)
  const prevScorecard = await aiJobRepository.findLatestByFeatureAndTarget(workspaceId, 'progress-scorecard', topicId);
  const prevContent = (prevScorecard?.output as any)?.scorecard;
  if (prevContent) {
    lines.push(`## Previous Scorecard`, '', JSON.stringify(prevContent, null, 2), '');
  }

  return lines.filter(l => l !== undefined).join('\n');
}

/**
 * Assemble context for conclusion generation.
 * Gathers all relevant evidence: first principles, scorecard, research,
 * plan, artifacts, dead ends, and resolved threads.
 */
export async function assembleConclusionContext(
  topicId: string,
  workspaceId: string,
): Promise<string> {
  const topic = await topicRepository.findById(topicId);
  if (!topic) throw new Error(`Topic not found: ${topicId}`);

  const [threads, artifacts, openTasks] = await Promise.all([
    threadRepository.findAll(workspaceId, { limit: 30, topicId }),
    artifactRepository.findAll(workspaceId, { limit: 30, topicId, status: 'accepted' }),
    findOpenTasksByTopic(workspaceId, topicId),
  ]);

  const lines: string[] = [
    `# Topic: ${topic.name}`,
    topic.description ? `Description: ${topic.description}` : '',
    '',
  ];

  // First principles & success criteria
  if (topic.first_principles) {
    lines.push(`## First Principles & Success Criteria`, '', topic.first_principles, '');
  }

  // Latest scorecard (full)
  const scorecardJob = await aiJobRepository.findLatestByFeatureAndTarget(workspaceId, 'progress-scorecard', topicId);
  const scorecard = (scorecardJob?.output as any)?.scorecard;
  if (scorecard) {
    lines.push(`## Current Progress Scorecard`, '', JSON.stringify(scorecard, null, 2), '');
  }

  // Latest research (generous limit for conclusion)
  const latestResearch = await aiJobRepository.findLatestResearchByTarget(workspaceId, topicId);
  const researchContent = (latestResearch?.output as any)?.content as string | undefined;
  if (researchContent) {
    lines.push(`## Latest Research Report`, '', researchContent.slice(0, 12000), '');
  }

  // Latest plan
  const latestPlan = await aiJobRepository.findLatestByFeatureAndTarget(workspaceId, 'project-plan', topicId);
  const planContent = (latestPlan?.output as any)?.content as string | undefined;
  if (planContent) {
    lines.push(`## Latest Project Plan`, '', planContent.slice(0, 8000), '');
  }

  // Accepted artifacts
  const nonDeadEnd = artifacts.filter((a: any) => !a.tags?.some((t: string) => ['dead-end', 'blocked'].includes(t)));
  if (nonDeadEnd.length > 0) {
    lines.push(`## Accepted Artifacts`, '');
    for (const a of nonDeadEnd.slice(0, 20)) {
      const tags = (a as any).tags?.length ? ` [${(a as any).tags.join(', ')}]` : '';
      const summary = (a as any).summary ? ` — ${(a as any).summary.slice(0, 300)}` : '';
      lines.push(`- **${a.title}** (${(a as any).artifact_type || 'document'})${tags}${summary}`);
    }
    lines.push('');
  }

  // Dead ends
  const deadEnds = artifacts.filter((a: any) => a.tags?.some((t: string) => ['dead-end', 'blocked'].includes(t)));
  if (deadEnds.length > 0) {
    lines.push(`## Dead Ends (approaches tried and rejected)`, '');
    for (const a of deadEnds) {
      lines.push(`- ${a.title}: ${(a as any).summary?.slice(0, 200) || 'no summary'}`);
    }
    lines.push('');
  }

  // Resolved threads (completed work)
  const resolvedThreads = threads.filter((t: any) => t.status === 'resolved');
  if (resolvedThreads.length > 0) {
    lines.push(`## Completed Work (resolved threads)`, '');
    for (const t of resolvedThreads.slice(0, 10)) {
      const summary = (t as any).summary ? ` — ${(t as any).summary.slice(0, 200)}` : '';
      lines.push(`- ${t.title}${summary}`);
    }
    lines.push('');
  }

  // Open tasks
  if (openTasks.length > 0) {
    lines.push(`## Remaining Open Tasks`, '');
    for (const task of openTasks.slice(0, 10)) {
      lines.push(`- [${task.priority}] ${task.title}`);
    }
    lines.push('');
  }

  return lines.filter(l => l !== undefined).join('\n');
}
