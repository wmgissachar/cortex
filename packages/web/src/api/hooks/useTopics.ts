/**
 * Topics Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../client';
import type { Topic, CreateTopicInput, UpdateTopicInput } from '@cortex/shared';

interface TopicsResponse {
  data: Topic[];
  meta: {
    request_id: string;
    has_more: boolean;
    next_cursor?: string;
  };
}

interface TopicResponse {
  data: Topic;
  meta: { request_id: string };
}

export function useTopics(limit: number = 50, includeArchived: boolean = false) {
  return useQuery({
    queryKey: ['topics', { limit, includeArchived }],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (includeArchived) params.set('include_archived', 'true');
      const response = await client.get<TopicsResponse>(`/topics?${params}`);
      return response.data.data;
    },
  });
}

export function useTopic(id: string) {
  return useQuery({
    queryKey: ['topics', id],
    queryFn: async () => {
      const response = await client.get<TopicResponse>(`/topics/${id}`);
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateTopic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTopicInput) => {
      const response = await client.post<TopicResponse>('/topics', input);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics'] });
    },
  });
}

export function useUpdateTopic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateTopicInput & { id: string }) => {
      const response = await client.patch<TopicResponse>(`/topics/${id}`, input);
      return response.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['topics'] });
      queryClient.setQueryData(['topics', data.id], data);
    },
  });
}
