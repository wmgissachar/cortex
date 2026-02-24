/**
 * Comments Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../client';
import type { CommentWithCreator, CreateCommentInput, UpdateCommentInput } from '@cortex/shared';

interface CommentsResponse {
  data: CommentWithCreator[];
  meta: {
    request_id: string;
    has_more: boolean;
    next_cursor?: string;
  };
}

interface CommentResponse {
  data: CommentWithCreator;
  meta: { request_id: string };
}

export function useComments(threadId: string, limit: number = 100) {
  return useQuery({
    queryKey: ['comments', threadId, { limit }],
    queryFn: async () => {
      const response = await client.get<CommentsResponse>(
        `/threads/${threadId}/comments?limit=${limit}`
      );
      return response.data.data;
    },
    enabled: !!threadId,
  });
}

export function useCreateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      threadId,
      ...input
    }: Omit<CreateCommentInput, 'thread_id'> & { threadId: string }) => {
      const response = await client.post<CommentResponse>(
        `/threads/${threadId}/comments`,
        input
      );
      return response.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['comments', data.thread_id] });
      queryClient.invalidateQueries({ queryKey: ['threads', data.thread_id] });
    },
  });
}

export function useUpdateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateCommentInput & { id: string }) => {
      const response = await client.patch<CommentResponse>(`/comments/${id}`, input);
      return response.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['comments', data.thread_id] });
    },
  });
}

export function useDeleteComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, threadId }: { id: string; threadId: string }) => {
      await client.delete(`/comments/${id}`);
      return { id, threadId };
    },
    onSuccess: ({ threadId }) => {
      queryClient.invalidateQueries({ queryKey: ['comments', threadId] });
    },
  });
}
