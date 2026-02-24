/**
 * Web search tools for the Researcher persona.
 *
 * Uses the Tavily API (https://tavily.com) for AI-optimized web search
 * and page content extraction. Requires TAVILY_API_KEY env var.
 */

import type { Tool } from '@cortex/ai';

const TAVILY_BASE = 'https://api.tavily.com';

function getTavilyKey(): string {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error('TAVILY_API_KEY environment variable not set');
  return key;
}

// ── web_search ────────────────────────────────────────────────────

export function createWebSearchTool(): Tool {
  return {
    definition: {
      name: 'web_search',
      description:
        'Search the internet for information. Returns ranked web results with titles, ' +
        'URLs, and content snippets. Use this to find external research, papers, blog posts, ' +
        'techniques, and innovations beyond what exists in the Cortex knowledge base. ' +
        'Try specific technical queries for best results.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (be specific and technical for best results)',
          },
          topic: {
            type: 'string',
            enum: ['general', 'news', 'finance'],
            description: 'Search topic category (default: general). Use "finance" for trading/markets.',
          },
          max_results: {
            type: 'number',
            description: 'Number of results to return (default: 5, max: 10)',
          },
          time_range: {
            type: 'string',
            enum: ['day', 'week', 'month', 'year'],
            description: 'Filter results by recency (optional)',
          },
          include_domains: {
            type: 'array',
            items: { type: 'string' },
            description: 'Only include results from these domains (e.g., ["arxiv.org", "ssrn.com"])',
          },
          exclude_domains: {
            type: 'array',
            items: { type: 'string' },
            description: 'Exclude results from these domains',
          },
        },
        required: ['query'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<string> {
      const apiKey = getTavilyKey();
      const query = String(args.query || '');
      const topic = (args.topic as string) || 'general';
      const maxResults = Math.min(Number(args.max_results) || 5, 10);
      const timeRange = args.time_range as string | undefined;
      const includeDomains = args.include_domains as string[] | undefined;
      const excludeDomains = args.exclude_domains as string[] | undefined;

      const body: Record<string, unknown> = {
        query,
        topic,
        max_results: maxResults,
        search_depth: 'advanced',
        include_answer: 'basic',
      };

      if (timeRange) body.time_range = timeRange;
      if (includeDomains?.length) body.include_domains = includeDomains;
      if (excludeDomains?.length) body.exclude_domains = excludeDomains;

      try {
        const response = await fetch(`${TAVILY_BASE}/search`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errText = await response.text();
          return `Web search error (${response.status}): ${errText.slice(0, 500)}`;
        }

        const data = await response.json() as {
          query: string;
          answer?: string;
          results: Array<{
            title: string;
            url: string;
            content: string;
            score: number;
          }>;
          response_time: number;
        };

        if (!data.results || data.results.length === 0) {
          return `No web results found for: "${query}"`;
        }

        const lines: string[] = [
          `## Web Search Results for "${query}"`,
          `Found ${data.results.length} result(s) (${data.response_time.toFixed(1)}s):`,
          '',
        ];

        if (data.answer) {
          lines.push(`**Quick Answer:** ${data.answer}`);
          lines.push('');
        }

        for (const r of data.results) {
          lines.push(`### ${r.title}`);
          lines.push(`- **URL:** ${r.url}`);
          lines.push(`- **Relevance:** ${(r.score * 100).toFixed(0)}%`);
          // Limit content snippet to prevent token explosion
          const content = r.content || '';
          lines.push(`- **Content:** ${content.length > 2000 ? content.substring(0, 2000) + '...' : content}`);
          lines.push('');
        }

        return lines.join('\n');
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Web search failed: ${msg}`;
      }
    },
  };
}

// ── web_read ──────────────────────────────────────────────────────

export function createWebReadTool(): Tool {
  return {
    definition: {
      name: 'web_read',
      description:
        'Read the full content of a web page by URL. Use this after finding a promising ' +
        'result via web_search to read the complete article, paper, or documentation. ' +
        'Returns the page content as clean markdown text.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to read',
          },
          query: {
            type: 'string',
            description: 'Optional relevance query — if provided, content chunks are ranked by relevance to this query',
          },
        },
        required: ['url'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<string> {
      const apiKey = getTavilyKey();
      const url = String(args.url || '');
      const query = args.query as string | undefined;

      if (!url || !url.startsWith('http')) {
        return `Invalid URL: "${url}". Must start with http:// or https://`;
      }

      const body: Record<string, unknown> = {
        urls: [url],
        format: 'markdown',
        extract_depth: 'advanced',
      };

      if (query) {
        body.query = query;
        body.chunks_per_source = 5;
      }

      try {
        const response = await fetch(`${TAVILY_BASE}/extract`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errText = await response.text();
          return `Web read error (${response.status}): ${errText.slice(0, 500)}`;
        }

        const data = await response.json() as {
          results: Array<{
            url: string;
            raw_content: string;
          }>;
          failed_results: Array<{
            url: string;
            error: string;
          }>;
        };

        if (data.failed_results?.length > 0) {
          return `Failed to read ${url}: ${data.failed_results[0].error}`;
        }

        if (!data.results || data.results.length === 0) {
          return `No content extracted from: ${url}`;
        }

        const content = data.results[0].raw_content || '';
        const lines: string[] = [
          `## Content from: ${url}`,
          '',
        ];

        // Limit to 20K chars to prevent token explosion (~5K tokens)
        lines.push(content.length > 20000 ? content.substring(0, 20000) + '\n\n[... truncated at 20K chars ...]' : content);

        return lines.join('\n');
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return `Web read failed: ${msg}`;
      }
    },
  };
}
