/**
 * Search Hooks
 */

import { useQuery } from '@tanstack/react-query';
import client from '../client';

interface SearchResult {
  id: string;
  type: 'thread' | 'artifact' | 'comment';
  title: string;
  snippet: string | null;
  status: string | null;
  rank: number;
  created_at: string;
  topic_id?: string;
  topic_handle?: string;
  thread_id?: string;
}

interface SearchResponse {
  data: SearchResult[];
  meta: {
    request_id: string;
    query: string;
    count: number;
  };
}

interface SuggestionsResponse {
  data: string[];
  meta: { request_id: string };
}

interface SearchOptions {
  type?: 'all' | 'threads' | 'artifacts' | 'comments';
  topicId?: string;
  status?: string;
  tags?: string[];
  creatorKind?: string;
  limit?: number;
}

export function useSearch(query: string, options: SearchOptions = {}) {
  const { type, topicId, status, tags, creatorKind, limit = 20 } = options;

  return useQuery({
    queryKey: ['search', query, options],
    queryFn: async () => {
      if (!query || query.length < 2) {
        return [];
      }

      const params = new URLSearchParams({ q: query });
      if (type) params.set('type', type);
      if (topicId) params.set('topic_id', topicId);
      if (status) params.set('status', status);
      if (tags && tags.length > 0) params.set('tags', tags.join(','));
      if (creatorKind) params.set('creator_kind', creatorKind);
      if (limit) params.set('limit', limit.toString());

      const response = await client.get<SearchResponse>(`/search?${params}`);
      return response.data.data;
    },
    enabled: query.length >= 2,
    staleTime: 30000, // 30 seconds
  });
}

export function useSuggestions(query: string) {
  return useQuery({
    queryKey: ['suggestions', query],
    queryFn: async () => {
      if (!query || query.length < 2) {
        return [];
      }

      const response = await client.get<SuggestionsResponse>(
        `/search/suggestions?q=${encodeURIComponent(query)}`
      );
      return response.data.data;
    },
    enabled: query.length >= 2,
    staleTime: 60000, // 1 minute
  });
}

export type { SearchResult };
