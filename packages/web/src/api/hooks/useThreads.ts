/**
 * Threads Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../client';
import type { ThreadWithCreator, CreateThreadInput, UpdateThreadInput } from '@cortex/shared';

interface ThreadsResponse {
  data: ThreadWithCreator[];
  meta: {
    request_id: string;
    has_more: boolean;
    next_cursor?: string;
  };
}

interface ThreadResponse {
  data: ThreadWithCreator;
  meta: { request_id: string };
}

interface ThreadsQueryOptions {
  topicId?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

export function useThreads(options: ThreadsQueryOptions = {}) {
  const { topicId, status, limit = 20, cursor } = options;

  return useQuery({
    queryKey: ['threads', { topicId, status, limit, cursor }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (topicId) params.set('topic_id', topicId);
      if (status) params.set('status', status);
      if (limit) params.set('limit', limit.toString());
      if (cursor) params.set('cursor', cursor);

      const response = await client.get<ThreadsResponse>(`/threads?${params}`);
      return response.data;
    },
  });
}

export function useThread(id: string) {
  return useQuery({
    queryKey: ['threads', id],
    queryFn: async () => {
      const response = await client.get<ThreadResponse>(`/threads/${id}`);
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateThreadInput) => {
      const response = await client.post<ThreadResponse>('/threads', input);
      return response.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      queryClient.invalidateQueries({ queryKey: ['topics', data.topic_id] });
    },
  });
}

export function useUpdateThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateThreadInput & { id: string }) => {
      const response = await client.patch<ThreadResponse>(`/threads/${id}`, input);
      return response.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      queryClient.setQueryData(['threads', data.id], data);
    },
  });
}

export function useDeleteThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await client.delete(`/threads/${id}`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
  });
}
