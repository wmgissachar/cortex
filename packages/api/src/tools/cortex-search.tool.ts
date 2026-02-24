/**
 * Cortex search tools for the Researcher persona.
 *
 * These implement the Tool interface from @cortex/ai and provide
 * workspace-scoped access to the Cortex knowledge base.
 * Each tool is a factory function taking workspaceId so database
 * queries are properly scoped.
 */

import type { Tool } from '@cortex/ai';
import { searchService } from '../services/search.service.js';
import { artifactRepository } from '../repositories/artifact.repository.js';
import { threadRepository } from '../repositories/thread.repository.js';
import { commentRepository } from '../repositories/comment.repository.js';

// ── cortex_search ──────────────────────────────────────────────────

export function createCortexSearchTool(workspaceId: string): Tool {
  return {
    definition: {
      name: 'cortex_search',
      description:
        'Full-text search across the Cortex knowledge base. Returns ranked results ' +
        'from threads, artifacts, and comments. Use different query terms to find ' +
        'relevant knowledge — try synonyms and related concepts.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (full-text search, supports natural language)',
          },
          type: {
            type: 'string',
            enum: ['all', 'threads', 'artifacts', 'comments'],
            description: 'Filter by content type (default: all)',
          },
          topic_id: {
            type: 'string',
            description: 'Filter results to a specific topic UUID',
          },
          limit: {
            type: 'number',
            description: 'Maximum results to return (default: 10, max: 25)',
          },
        },
        required: ['query'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<string> {
      const query = String(args.query || '');
      const type = (args.type as 'all' | 'threads' | 'artifacts' | 'comments') || 'all';
      const topicId = args.topic_id as string | undefined;
      const limit = Math.min(Number(args.limit) || 10, 25);

      const results = await searchService.search(workspaceId, {
        query,
        type,
        topicId,
        limit,
      });

      if (results.length === 0) {
        return `No results found for query: "${query}" (type: ${type}${topicId ? `, topic: ${topicId}` : ''})`;
      }

      const lines: string[] = [
        `## Search Results for "${query}"`,
        `Found ${results.length} result(s)${topicId ? ` in topic ${topicId}` : ''}:`,
        '',
      ];

      for (const r of results) {
        const topicLabel = r.topic_handle ? ` [${r.topic_handle}]` : '';
        lines.push(`### ${r.type.toUpperCase()}: ${r.title || '(untitled)'}`);
        lines.push(`- **ID:** \`${r.id}\``);
        lines.push(`- **Status:** ${r.status || 'n/a'}${topicLabel}`);
        lines.push(`- **Rank:** ${r.rank.toFixed(3)}`);
        if (r.snippet) {
          lines.push(`- **Snippet:** ${r.snippet}`);
        }
        if (r.thread_id) {
          lines.push(`- **Thread:** \`${r.thread_id}\``);
        }
        lines.push('');
      }

      return lines.join('\n');
    },
  };
}

// ── cortex_get_artifact ────────────────────────────────────────────

export function createCortexGetArtifactTool(_workspaceId: string): Tool {
  return {
    definition: {
      name: 'cortex_get_artifact',
      description:
        'Retrieve the full content of a Cortex artifact by ID. Use this after ' +
        'finding an artifact via search to read its complete body, tags, and metadata.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Artifact UUID',
          },
        },
        required: ['id'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<string> {
      const id = String(args.id || '');
      const artifact = await artifactRepository.findById(id);

      if (!artifact) {
        return `Artifact not found: ${id}`;
      }

      const lines: string[] = [
        `## Artifact: ${artifact.title}`,
        '',
        `- **ID:** \`${artifact.id}\``,
        `- **Type:** ${artifact.type}`,
        `- **Status:** ${artifact.status}`,
        `- **Topic:** ${(artifact as any).topic_handle || artifact.topic_id}`,
        `- **Tags:** ${artifact.tags?.join(', ') || 'none'}`,
        `- **Created:** ${new Date(artifact.created_at).toISOString()}`,
        `- **Updated:** ${new Date(artifact.updated_at).toISOString()}`,
      ];

      if (artifact.summary) {
        lines.push(`- **Summary:** ${artifact.summary}`);
      }

      if (artifact.references && artifact.references.length > 0) {
        lines.push(`- **References:** ${artifact.references.join(', ')}`);
      }

      lines.push('');
      lines.push('### Content');
      lines.push('');
      // Limit body to prevent token explosion (15K chars ~ 4K tokens)
      const body = artifact.body || '';
      lines.push(body.length > 15000 ? body.substring(0, 15000) + '\n\n[... truncated ...]' : body);

      return lines.join('\n');
    },
  };
}

// ── cortex_get_thread ──────────────────────────────────────────────

export function createCortexGetThreadTool(_workspaceId: string): Tool {
  return {
    definition: {
      name: 'cortex_get_thread',
      description:
        'Retrieve a Cortex thread by ID with its recent comments. Use this to read ' +
        'the full context of a discussion, including observations and human corrections.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Thread UUID',
          },
          include_comments: {
            type: 'boolean',
            description: 'Include recent comments (default: true)',
          },
        },
        required: ['id'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<string> {
      const id = String(args.id || '');
      const includeComments = args.include_comments !== false;

      const thread = await threadRepository.findById(id);
      if (!thread) {
        return `Thread not found: ${id}`;
      }

      const lines: string[] = [
        `## Thread: ${thread.title}`,
        '',
        `- **ID:** \`${thread.id}\``,
        `- **Type:** ${thread.type}`,
        `- **Status:** ${thread.status}`,
        `- **Topic:** ${(thread as any).topic_handle || thread.topic_id}`,
        `- **Tags:** ${thread.tags?.join(', ') || 'none'}`,
        `- **Comments:** ${thread.comment_count}`,
        `- **Created:** ${new Date(thread.created_at).toISOString()}`,
      ];

      if (thread.summary) {
        lines.push(`- **Summary:** ${thread.summary}`);
      }

      if (thread.body) {
        lines.push('');
        lines.push('### Body');
        lines.push('');
        const body = thread.body;
        lines.push(body.length > 10000 ? body.substring(0, 10000) + '\n\n[... truncated ...]' : body);
      }

      if (includeComments) {
        const comments = await commentRepository.findByThread(id, { limit: 20 });

        if (comments.length > 0) {
          lines.push('');
          lines.push(`### Comments (${comments.length} most recent)`);
          lines.push('');

          for (const c of comments) {
            const authorKind = (c as any).creator_kind || 'unknown';
            const authorName = (c as any).creator_display_name || 'Unknown';
            const isHuman = authorKind === 'human';
            const humanMarker = isHuman ? ' **[HUMAN]**' : '';
            const commentType = c.type ? ` (${c.type})` : '';
            const subType = (c as any).sub_type ? ` [${(c as any).sub_type}]` : '';

            lines.push(`**${authorName}**${humanMarker}${commentType}${subType} — ${new Date(c.created_at).toISOString()}`);

            // Limit per-comment body
            const body = c.body || '';
            lines.push(body.length > 3000 ? body.substring(0, 3000) + '\n[... truncated ...]' : body);
            lines.push('');
          }
        }
      }

      return lines.join('\n');
    },
  };
}
