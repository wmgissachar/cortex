import type { OutputRouter } from '@cortex/ai';
import { commentRepository } from '../repositories/comment.repository.js';
import { artifactRepository } from '../repositories/artifact.repository.js';
import { aiService } from './ai.service.js';
import db from '../db/index.js';

/**
 * Routes AI agent output to the appropriate destination:
 * - Scribe: posts summary as observation on the target thread
 * - Critic: posts review as observation on the artifact's discussion thread
 * - Linker: posts link suggestions as observation on the artifact's discussion thread
 */
export const aiOutputService: OutputRouter = {
  async route(params) {
    const { persona, targetId, content, workspaceId } = params;

    const principalId = await aiService.getAnalystPrincipalId(workspaceId);
    if (!principalId) {
      console.warn('cortex-analyst principal not found — skipping output routing');
      return;
    }

    switch (persona) {
      case 'scribe':
        await postToThread(targetId, principalId, content, ['ai-scribe', 'thread-summary']);
        break;

      case 'critic':
        await postToArtifactThread(targetId, principalId, content, ['ai-critic', 'artifact-review']);
        break;

      case 'linker':
        await postToArtifactThread(targetId, principalId, content, ['ai-linker', 'knowledge-linking']);
        break;
    }
  },
};

async function postToThread(
  threadId: string,
  principalId: string,
  body: string,
  tags: string[],
): Promise<{ thread_id: string; comment_id: string } | null> {
  const comment = await commentRepository.create(threadId, principalId, {
    thread_id: threadId,
    type: 'observation',
    body,
    tags,
  });

  // Increment comment count
  await db.query(
    `UPDATE threads SET comment_count = comment_count + 1 WHERE id = $1`,
    [threadId],
  );

  return { thread_id: threadId, comment_id: comment.id };
}

async function postToArtifactThread(
  artifactId: string,
  principalId: string,
  body: string,
  tags: string[],
): Promise<{ thread_id: string; comment_id: string } | null> {
  const artifact = await artifactRepository.findById(artifactId);
  if (!artifact?.thread_id) {
    console.warn(`Artifact ${artifactId} has no discussion thread — skipping output posting`);
    return null;
  }

  return postToThread(artifact.thread_id, principalId, body, tags);
}

// Cached digest thread ID per workspace
const digestThreadCache: Record<string, string> = {};

async function getOrCreateDigestThread(
  workspaceId: string,
  principalId: string,
): Promise<string> {
  if (digestThreadCache[workspaceId]) return digestThreadCache[workspaceId];

  // Look for existing digest thread
  const { rows: existing } = await db.query<{ id: string }>(
    `SELECT id FROM threads WHERE workspace_id = $1 AND tags @> ARRAY['daily-digest']::text[] LIMIT 1`,
    [workspaceId],
  );

  if (existing.length > 0) {
    digestThreadCache[workspaceId] = existing[0].id;
    return existing[0].id;
  }

  // Create a new digest thread in the first topic
  const { rows: topics } = await db.query<{ id: string }>(
    `SELECT id FROM topics WHERE workspace_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [workspaceId],
  );

  if (topics.length === 0) throw new Error('No topics found for workspace');

  const { rows: created } = await db.query<{ id: string }>(
    `INSERT INTO threads (workspace_id, topic_id, title, type, status, body, tags, pinned, created_by)
     VALUES ($1, $2, 'Daily Digest', 'discussion', 'open', 'Automated daily briefings from the Scribe agent.', ARRAY['daily-digest']::text[], true, $3)
     RETURNING id`,
    [workspaceId, topics[0].id, principalId],
  );

  digestThreadCache[workspaceId] = created[0].id;
  return created[0].id;
}

// Cached feature thread IDs: key = `${workspaceId}:${topicId}:${featureTag}`
const featureThreadCache: Record<string, string> = {};

async function getOrCreateFeatureThread(
  workspaceId: string,
  topicId: string,
  featureTag: string,
  title: string,
  principalId: string,
): Promise<string> {
  const cacheKey = `${workspaceId}:${topicId}:${featureTag}`;
  if (featureThreadCache[cacheKey]) return featureThreadCache[cacheKey];

  // Look for existing feature thread in this topic
  const { rows: existing } = await db.query<{ id: string }>(
    `SELECT id FROM threads WHERE workspace_id = $1 AND topic_id = $2 AND tags @> ARRAY[$3]::text[] LIMIT 1`,
    [workspaceId, topicId, featureTag],
  );

  if (existing.length > 0) {
    featureThreadCache[cacheKey] = existing[0].id;
    return existing[0].id;
  }

  // Create a new feature thread
  const { rows: created } = await db.query<{ id: string }>(
    `INSERT INTO threads (workspace_id, topic_id, title, type, status, body, tags, pinned, created_by)
     VALUES ($1, $2, $3, 'discussion', 'open', $4, ARRAY[$5]::text[], true, $6)
     RETURNING id`,
    [workspaceId, topicId, title, `Automated ${title.toLowerCase()} reports from the AI team.`, featureTag, principalId],
  );

  featureThreadCache[cacheKey] = created[0].id;
  return created[0].id;
}

/**
 * Route output and return the posted location (if any).
 */
export async function routeAndGetLocation(
  params: Parameters<OutputRouter['route']>[0],
): Promise<{ thread_id: string; comment_id: string } | undefined> {
  const { persona, feature, targetId, content, workspaceId } = params;

  const principalId = await aiService.getAnalystPrincipalId(workspaceId);
  if (!principalId) return undefined;

  // Ephemeral features — returned directly, not posted to any thread
  if (feature === 'briefing' || feature === 'ask-cortex' || feature === 'auto-tagging' || feature === 'topic-synthesis') {
    return undefined;
  }

  // Daily digest gets its own dedicated thread
  if (feature === 'daily-digest') {
    const digestThreadId = await getOrCreateDigestThread(workspaceId, principalId);
    return (await postToThread(digestThreadId, principalId, content, ['ai-scribe', 'daily-digest'])) ?? undefined;
  }

  // Thread Resolution Prompt — posted as observation on the target thread
  if (feature === 'thread-resolution-prompt') {
    return (await postToThread(targetId, principalId, content, ['ai-scribe', 'resolution-prompt'])) ?? undefined;
  }

  // Observation Triage — posted as observation on the target thread
  if (feature === 'observation-triage') {
    return (await postToThread(targetId, principalId, content, ['ai-scribe', 'observation-triage'])) ?? undefined;
  }

  // Contradiction Detection — posted to a dedicated feature thread
  if (feature === 'contradiction-detection') {
    const threadId = await getOrCreateFeatureThread(workspaceId, targetId, 'contradiction-detection', 'Contradiction Detection', principalId);
    return (await postToThread(threadId, principalId, content, ['ai-critic', 'contradiction-detection'])) ?? undefined;
  }

  // Staleness Detection — posted to a dedicated feature thread
  if (feature === 'staleness-detection') {
    const threadId = await getOrCreateFeatureThread(workspaceId, targetId, 'staleness-detection', 'Staleness Report', principalId);
    return (await postToThread(threadId, principalId, content, ['ai-scribe', 'staleness-detection'])) ?? undefined;
  }

  switch (persona) {
    case 'scribe':
      return (await postToThread(targetId, principalId, content, ['ai-scribe', 'thread-summary'])) ?? undefined;

    case 'critic':
      return (await postToArtifactThread(targetId, principalId, content, ['ai-critic', 'artifact-review'])) ?? undefined;

    case 'linker':
      return (await postToArtifactThread(targetId, principalId, content, ['ai-linker', 'knowledge-linking'])) ?? undefined;

    default:
      return undefined;
  }
}
