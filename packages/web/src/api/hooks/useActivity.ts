import { useQuery } from '@tanstack/react-query';
import client from '../client';

export interface ActivityItem {
  id: string;
  activity_type: 'comment' | 'thread' | 'artifact' | 'task';
  type: string;
  title: string | null;
  body: string | null;
  created_at: string;
  thread_id: string | null;
  thread_title: string | null;
  topic_id: string;
  topic_name: string;
  creator_id: string;
  creator_handle: string;
  creator_display_name: string;
  creator_kind: string;
}

interface ActivityResponse {
  data: ActivityItem[];
  meta: {
    request_id: string;
    has_more: boolean;
    offset: number;
    limit: number;
  };
}

export interface ActivityQueryOptions {
  limit?: number;
  type?: string;
  topicId?: string;
  offset?: number;
}

export function useRecentActivity(options: ActivityQueryOptions | number = 10) {
  // Backward compatible: accept number or options
  const opts: ActivityQueryOptions = typeof options === 'number' ? { limit: options } : options;
  const { limit = 10, type, topicId, offset = 0 } = opts;

  return useQuery({
    queryKey: ['activity', { limit, type, topicId, offset }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      if (type) params.set('type', type);
      if (topicId) params.set('topic_id', topicId);
      if (offset) params.set('offset', offset.toString());

      const response = await client.get<ActivityResponse>(`/activity?${params}`);
      return response.data;
    },
    refetchInterval: 30000,
  });
}
