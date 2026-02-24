import { AppError } from '@cortex/shared';
import { threadRepository } from '../repositories/thread.repository.js';
import { commentRepository } from '../repositories/comment.repository.js';
import { artifactRepository } from '../repositories/artifact.repository.js';
import { knowledgeLinkRepository } from '../repositories/knowledge-link.repository.js';
import db from '../db/index.js';

// Keywords that suggest decision-worthy content
const DECISION_KEYWORDS = /\b(decided|chose|selected|picked|opted|went with|choosing|decision)\b/i;
// Keywords that suggest result-worthy content
const RESULT_KEYWORDS = /\b(CAGR|Sharpe|benchmark|accuracy|precision|recall|p-value|r-squared|result|finding|performance|metric)\b/i;
// Keywords that suggest negative results
const NEGATIVE_KEYWORDS = /\b(failed|didn't work|rejected|abandoned|dead.?end|worse|degraded|underperform)\b/i;

export interface SessionAuditResult {
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
  suggestions: Array<{
    priority: 'must' | 'should' | 'consider';
    message: string;
    action_hint?: string;
  }>;
  score: {
    completed: number;
    total: number;
  };
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

function suggestSubType(body: string): string | null {
  if (DECISION_KEYWORDS.test(body)) return 'decision';
  if (RESULT_KEYWORDS.test(body)) return 'result';
  if (NEGATIVE_KEYWORDS.test(body)) return 'negative-result';
  return null;
}

export async function auditSession(
  threadId: string,
  topicId: string,
  workspaceId: string,
): Promise<SessionAuditResult> {
  // 1. Fetch thread
  const thread = await threadRepository.findById(threadId);
  if (!thread) {
    throw AppError.notFound('Thread');
  }

  // 2. Fetch all comments on this thread
  const comments = await commentRepository.findByThread(threadId, { limit: 200 });

  // 3. Partition comments
  const observations = comments.filter((c: { type: string }) => c.type === 'observation');
  const checkpoints = comments.filter((c: { tags: string[] }) => c.tags?.includes('checkpoint'));

  // Analyze observation sub_types (stored in tags)
  const SUB_TYPES = ['result', 'negative-result', 'decision', 'question', 'methodology'];
  const typedObs: typeof observations = [];
  const untypedObs: typeof observations = [];
  const subTypeCounts: Record<string, number> = {};

  for (const obs of observations) {
    const foundSubType = obs.tags?.find((t: string) => SUB_TYPES.includes(t));
    if (foundSubType) {
      typedObs.push(obs);
      subTypeCounts[foundSubType] = (subTypeCounts[foundSubType] || 0) + 1;
    } else {
      untypedObs.push(obs);
    }
  }

  // 4. Fetch artifacts in this topic created after thread creation
  const allArtifacts = await artifactRepository.findAll(workspaceId, {
    limit: 50,
    topicId,
  });
  const sessionArtifacts = allArtifacts.filter(
    (a) => new Date(a.created_at) >= new Date(thread.created_at),
  );
  const artifactsByType: Record<string, number> = {};
  for (const a of sessionArtifacts) {
    artifactsByType[a.type] = (artifactsByType[a.type] || 0) + 1;
  }

  // 5. Fetch tasks in this topic created after thread creation
  const { rows: sessionTasks } = await db.query<{
    id: string;
    title: string;
    status: string;
    priority: string;
  }>(
    `SELECT id, title, status, priority FROM tasks
     WHERE workspace_id = $1 AND topic_id = $2 AND created_at >= $3
     ORDER BY created_at DESC`,
    [workspaceId, topicId, thread.created_at],
  );
  const tasksByPriority: Record<string, number> = {};
  for (const t of sessionTasks) {
    tasksByPriority[t.priority] = (tasksByPriority[t.priority] || 0) + 1;
  }

  // 6. Count knowledge links for session artifacts
  let linkCount = 0;
  for (const a of sessionArtifacts) {
    const links = await knowledgeLinkRepository.findByArtifact(a.id);
    linkCount += links.length;
  }

  // 7. Build suggestions
  const suggestions: SessionAuditResult['suggestions'] = [];

  // -- Must: Thread summary
  const hasSummary = !!thread.summary && thread.summary.trim().length > 20;
  if (!hasSummary) {
    suggestions.push({
      priority: 'must',
      message: 'Thread summary missing or too short. Add a 1-2 sentence summary describing what was accomplished and what\'s next.',
      action_hint: `cortex_update_thread({ id: "${threadId}", summary: "..." })`,
    });
  }

  // -- Must: At least one typed observation
  if (observations.length > 0 && typedObs.length === 0) {
    const hint = untypedObs.slice(0, 3).map((o) => {
      const suggested = suggestSubType(o.body);
      const preview = truncate(o.body.replace(/^#+\s*/m, ''), 80);
      return `  - \`${o.id}\`: "${preview}" → suggested sub_type: '${suggested || 'result'}'`;
    }).join('\n');
    suggestions.push({
      priority: 'must',
      message: `No observations have a sub_type set. Add sub_type to at least one observation:\n${hint}`,
    });
  }

  // -- Should: Artifacts for substantial sessions
  if (observations.length >= 3 && sessionArtifacts.length === 0) {
    const promotable = observations.slice(0, 5).map((o) => {
      const suggested = suggestSubType(o.body);
      const preview = truncate(o.body.replace(/^#+\s*/m, ''), 100);
      const artType = suggested === 'decision' ? 'decision' : 'document';
      return `  - Observation \`${o.id}\`: "${preview}" → promote to \`${artType}\` artifact`;
    }).join('\n');
    suggestions.push({
      priority: 'should',
      message: `No artifacts created despite ${observations.length} observations. Promote key findings to artifacts:\n${promotable}`,
      action_hint: 'cortex_draft_artifact({ type: "decision"|"document", topic_id: "...", title: "...", body: "..." })',
    });
  }

  // -- Should: Decision observations without decision artifacts
  const decisionObs = observations.filter((o) => {
    const hasDecisionTag = o.tags?.includes('decision');
    const hasDecisionContent = DECISION_KEYWORDS.test(o.body);
    return hasDecisionTag || hasDecisionContent;
  });
  if (decisionObs.length > 0 && !artifactsByType['decision']) {
    const examples = decisionObs.slice(0, 2).map((o) => {
      const preview = truncate(o.body.replace(/^#+\s*/m, ''), 80);
      return `  - \`${o.id}\`: "${preview}"`;
    }).join('\n');
    suggestions.push({
      priority: 'should',
      message: `Decision-related observations found but no decision artifacts created:\n${examples}`,
      action_hint: 'cortex_draft_artifact({ type: "decision", ... })',
    });
  }

  // -- Consider: Untyped observations
  if (untypedObs.length > 0 && typedObs.length > 0) {
    // Only suggest if some are typed (i.e. agent knows about sub_types but skipped some)
    const items = untypedObs.slice(0, 3).map((o) => {
      const suggested = suggestSubType(o.body);
      const preview = truncate(o.body.replace(/^#+\s*/m, ''), 80);
      return `  - \`${o.id}\`: "${preview}" → suggested: '${suggested || 'methodology'}'`;
    }).join('\n');
    suggestions.push({
      priority: 'consider',
      message: `${untypedObs.length} observation(s) lack sub_type. Consider adding:\n${items}`,
    });
  }

  // -- Consider: Negative results
  const hasNegativeResult = observations.some((o) => o.tags?.includes('negative-result'));
  const hasNegativeContent = observations.some((o) => NEGATIVE_KEYWORDS.test(o.body));
  if (!hasNegativeResult && hasNegativeContent) {
    suggestions.push({
      priority: 'consider',
      message: 'Observations mention failures or rejected approaches but none are tagged negative-result. Tag dead ends to prevent future agents from re-exploring them.',
    });
  } else if (!hasNegativeResult && observations.length >= 3) {
    suggestions.push({
      priority: 'consider',
      message: 'No negative-result observations. Were there any dead ends or failed approaches worth documenting?',
    });
  }

  // -- Consider: Follow-up tasks
  if (sessionTasks.length === 0 && observations.length >= 2) {
    suggestions.push({
      priority: 'consider',
      message: 'No follow-up tasks created. Is all work complete, or should remaining work be captured as tasks?',
      action_hint: 'cortex_create_task({ title: "...", topic_id: "...", body: "..." })',
    });
  }

  // -- Consider: Knowledge links
  if (sessionArtifacts.length > 0 && linkCount === 0) {
    suggestions.push({
      priority: 'consider',
      message: 'New artifacts have no knowledge links. Consider linking to existing artifacts with cortex_create_knowledge_link.',
    });
  }

  // 8. Calculate score
  let completed = 0;
  const total = 7;

  // 1. Thread has descriptive title (>10 chars)
  if (thread.title.length > 10) completed++;
  // 2. Thread has summary
  if (hasSummary) completed++;
  // 3. At least 1 observation
  if (observations.length > 0) completed++;
  // 4. At least 1 typed observation (or no observations at all)
  if (typedObs.length > 0 || observations.length === 0) completed++;
  // 5. Artifacts created (or session too short to need them)
  if (sessionArtifacts.length > 0 || observations.length < 3) completed++;
  // 6. Tasks created (or explicit minimal session)
  if (sessionTasks.length > 0 || observations.length < 2) completed++;
  // 7. Checkpoints recorded (or short session)
  if (checkpoints.length > 0 || observations.length < 4) completed++;

  return {
    thread: {
      id: thread.id,
      title: thread.title,
      status: thread.status,
      has_summary: hasSummary,
      has_body: !!thread.body,
      created_at: thread.created_at.toISOString(),
    },
    observations: {
      total: observations.length,
      with_sub_type: typedObs.length,
      by_sub_type: subTypeCounts,
      untyped: untypedObs.slice(0, 10).map((o) => ({
        id: o.id,
        body_preview: truncate(o.body.replace(/^#+\s*/m, ''), 150),
      })),
    },
    checkpoints: { total: checkpoints.length },
    artifacts: {
      total: sessionArtifacts.length,
      by_type: artifactsByType,
    },
    tasks: {
      total: sessionTasks.length,
      by_priority: tasksByPriority,
    },
    knowledge_links: { total: linkCount },
    suggestions,
    score: { completed, total },
  };
}
