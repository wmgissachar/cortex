/**
 * Tasks Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../client';
import type { TaskWithRelations, CreateTaskInput, UpdateTaskInput } from '@cortex/shared';

interface TasksResponse {
  data: TaskWithRelations[];
  meta: {
    request_id: string;
    has_more: boolean;
    next_cursor?: string;
  };
}

interface TaskResponse {
  data: TaskWithRelations;
  meta: { request_id: string };
}

interface TasksQueryOptions {
  status?: string;
  assigneeId?: string;
  limit?: number;
  cursor?: string;
}

export function useTasks(options: TasksQueryOptions = {}) {
  const { status, assigneeId, limit = 20, cursor } = options;

  return useQuery({
    queryKey: ['tasks', { status, assigneeId, limit, cursor }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (assigneeId) params.set('assignee_id', assigneeId);
      if (limit) params.set('limit', limit.toString());
      if (cursor) params.set('cursor', cursor);

      const response = await client.get<TasksResponse>(`/tasks?${params}`);
      return response.data;
    },
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: async () => {
      const response = await client.get<TaskResponse>(`/tasks/${id}`);
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const response = await client.post<TaskResponse>('/tasks', input);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateTaskInput & { id: string }) => {
      const response = await client.patch<TaskResponse>(`/tasks/${id}`, input);
      return response.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.setQueryData(['tasks', data.id], data);
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await client.delete(`/tasks/${id}`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
