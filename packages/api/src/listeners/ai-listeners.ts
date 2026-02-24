import { eventBus } from '../utils/event-bus.js';
import { aiService } from '../services/ai.service.js';
import { aiConfigRepository } from '../repositories/ai-config.repository.js';
import { threadRepository } from '../repositories/thread.repository.js';
import { artifactRepository } from '../repositories/artifact.repository.js';
import { knowledgeLinkRepository } from '../repositories/knowledge-link.repository.js';
import { activityEventService } from '../services/activity-event.service.js';

/**
 * Extract the TL;DR section from Scribe structured output.
 * Looks for text between "## TL;DR" and the next "##" header.
 */
function extractTldr(content: string): string | null {
  const tldrMatch = content.match(/##\s*TL;?DR\s*\n+([\s\S]*?)(?=\n##\s|\n$|$)/i);
  if (!tldrMatch?.[1]) return null;

  const tldr = tldrMatch[1].trim();
  if (!tldr) return null;

  // Truncate to 1000 chars (VARCHAR(1000) limit on thread.summary)
  return tldr.length > 1000 ? tldr.substring(0, 997) + '...' : tldr;
}

/**
 * Register all AI event listeners.
 * Called once at server startup.
 */
export function registerAiListeners(): void {
  // Auto-summarize threads when resolved
  eventBus.on('thread.resolved', async (data) => {
    try {
      const config = await aiConfigRepository.getByWorkspace(data.workspaceId);
      if (!config?.enabled || !config?.auto_summarize) return;

      console.log(`Auto-summarizing thread ${data.threadId}`);

      const result = await aiService.triggerJob(
        'scribe' as 'scribe',
        data.threadId,
        data.workspaceId,
      );

      // Extract TL;DR and write to thread.summary field
      const tldr = extractTldr(result.content);
      if (tldr) {
        await threadRepository.update(data.threadId, { summary: tldr });
        console.log(`Thread ${data.threadId} summary updated (${tldr.length} chars)`);
      }
    } catch (err) {
      console.error('Auto-summarize failed for thread', data.threadId, err);
    }
  });

  // Auto-review artifacts when created (Critic)
  eventBus.on('artifact.created', async (data) => {
    try {
      // Cascade prevention: never review agent-created artifacts
      if (data.creatorKind === 'agent') return;

      const config = await aiConfigRepository.getByWorkspace(data.workspaceId);
      if (!config?.enabled || !config?.auto_review) return;

      console.log(`Auto-reviewing artifact ${data.artifactId}`);
      await aiService.triggerJob(
        'critic' as 'critic',
        data.artifactId,
        data.workspaceId,
      );
    } catch (err) {
      console.error('Auto-review failed for artifact', data.artifactId, err);
    }
  });

  // Auto-link artifacts when created (Linker)
  eventBus.on('artifact.created', async (data) => {
    try {
      // Cascade prevention: never link agent-created artifacts
      if (data.creatorKind === 'agent') return;

      const config = await aiConfigRepository.getByWorkspace(data.workspaceId);
      if (!config?.enabled || !config?.auto_link) return;

      console.log(`Auto-linking artifact ${data.artifactId}`);
      const result = await aiService.triggerJob(
        'linker' as 'linker',
        data.artifactId,
        data.workspaceId,
      );

      // Auto-persist link suggestions to knowledge_links table
      await persistLinkerOutput(result.content, data.workspaceId);
    } catch (err) {
      console.error('Auto-link failed for artifact', data.artifactId, err);
    }
  });

  // Auto-tag artifacts when created (Linker)
  eventBus.on('artifact.created', async (data) => {
    try {
      // Cascade prevention: never tag agent-created artifacts
      if (data.creatorKind === 'agent') return;

      const config = await aiConfigRepository.getByWorkspace(data.workspaceId);
      if (!config?.enabled || !config?.auto_tag) return;

      console.log(`Auto-tagging artifact ${data.artifactId}`);
      const result = await aiService.autoTagArtifact(data.artifactId, data.workspaceId);

      // Parse the JSON tags array from the content
      const jsonMatch = result.content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.log('Auto-tag output contained no JSON array — skipping');
        return;
      }

      let suggestedTags: string[];
      try {
        suggestedTags = JSON.parse(jsonMatch[0]);
      } catch {
        console.error('Failed to parse auto-tag JSON output');
        return;
      }

      if (!Array.isArray(suggestedTags) || suggestedTags.length === 0) return;

      // Merge with existing tags
      const artifact = await artifactRepository.findById(data.artifactId);
      if (!artifact) return;
      const existingTags = artifact.tags || [];
      const mergedTags = [...new Set([...existingTags, ...suggestedTags.map(t => String(t).toLowerCase())])];

      await artifactRepository.update(data.artifactId, { tags: mergedTags });
      console.log(`Auto-tagged artifact ${data.artifactId}: ${suggestedTags.join(', ')}`);

      // Record auto_tag.applied event for evaluation tracking
      await activityEventService.recordEvents(
        data.workspaceId, null, 'system',
        [{ event_type: 'auto_tag.applied', payload: { artifact_id: data.artifactId, tags: suggestedTags } }]
      ).catch(err => console.error('Failed to record auto_tag event:', err));
    } catch (err) {
      console.error('Auto-tag failed for artifact', data.artifactId, err);
    }
  });
}

/**
 * Parse Linker JSON output and persist valid links to the knowledge_links table.
 */
async function persistLinkerOutput(
  content: string,
  workspaceId: string,
): Promise<void> {
  // Extract JSON array from content (Linker may occasionally wrap in code fences)
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.log('Linker output contained no JSON array — skipping link persistence');
    return;
  }

  let links: Array<{ source_id: string; target_id: string; link_type: string; reason: string }>;
  try {
    links = JSON.parse(jsonMatch[0]);
  } catch {
    console.error('Failed to parse Linker JSON output');
    return;
  }

  if (!Array.isArray(links) || links.length === 0) return;

  const principalId = await aiService.getAnalystPrincipalId(workspaceId);
  if (!principalId) {
    console.warn('cortex-analyst principal not found — skipping link persistence');
    return;
  }

  const validLinkTypes = ['supersedes', 'supports', 'contradicts', 'depends_on', 'related_to'];

  for (const link of links) {
    try {
      if (!link.source_id || !link.target_id || !validLinkTypes.includes(link.link_type)) {
        console.warn('Skipping invalid link suggestion:', link);
        continue;
      }
      if (link.source_id === link.target_id) continue;

      await knowledgeLinkRepository.create(
        link.source_id,
        link.target_id,
        link.link_type,
        principalId,
      );
      console.log(`Created knowledge link: ${link.source_id} --${link.link_type}--> ${link.target_id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('unique') || message.includes('duplicate')) {
        console.log(`Link already exists: ${link.source_id} --${link.link_type}--> ${link.target_id}`);
      } else {
        console.error('Failed to create knowledge link:', err);
      }
    }
  }
}
