/**
 * Artifacts Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../client';
import type {
  ArtifactWithCreator,
  CreateArtifactInput,
  UpdateArtifactInput,
} from '@cortex/shared';

interface ArtifactsResponse {
  data: ArtifactWithCreator[];
  meta: {
    request_id: string;
    has_more: boolean;
    next_cursor?: string;
  };
}

interface ArtifactResponse {
  data: ArtifactWithCreator;
  meta: { request_id: string };
}

interface ArtifactsQueryOptions {
  topicId?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

export function useArtifacts(options: ArtifactsQueryOptions = {}) {
  const { topicId, status, limit = 20, cursor } = options;

  return useQuery({
    queryKey: ['artifacts', { topicId, status, limit, cursor }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (topicId) params.set('topic_id', topicId);
      if (status) params.set('status', status);
      if (limit) params.set('limit', limit.toString());
      if (cursor) params.set('cursor', cursor);

      const response = await client.get<ArtifactsResponse>(`/artifacts?${params}`);
      return response.data;
    },
  });
}

export function useArtifact(id: string) {
  return useQuery({
    queryKey: ['artifacts', id],
    queryFn: async () => {
      const response = await client.get<ArtifactResponse>(`/artifacts/${id}`);
      return response.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateArtifactInput) => {
      const response = await client.post<ArtifactResponse>('/artifacts', input);
      return response.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      queryClient.invalidateQueries({ queryKey: ['topics', data.topic_id] });
    },
  });
}

export function useUpdateArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateArtifactInput & { id: string }) => {
      const response = await client.patch<ArtifactResponse>(`/artifacts/${id}`, input);
      return response.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      queryClient.setQueryData(['artifacts', data.id], data);
    },
  });
}

export function useProposeArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await client.post<ArtifactResponse>(`/artifacts/${id}/propose`);
      return response.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      queryClient.setQueryData(['artifacts', data.id], data);
    },
  });
}

export function useAcceptArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await client.post<ArtifactResponse>(`/artifacts/${id}/accept`);
      return response.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      queryClient.setQueryData(['artifacts', data.id], data);
    },
  });
}

export function useRejectArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await client.post<ArtifactResponse>(`/artifacts/${id}/reject`);
      return response.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      queryClient.setQueryData(['artifacts', data.id], data);
    },
  });
}

export function useDeprecateArtifact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await client.post<ArtifactResponse>(`/artifacts/${id}/deprecate`);
      return response.data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      queryClient.setQueryData(['artifacts', data.id], data);
    },
  });
}

interface ArtifactLinksResponse {
  data: {
    links: Array<{
      id: string;
      source_id: string;
      target_id: string;
      link_type: string;
      source_title: string;
      source_status: string;
      target_title: string;
      target_status: string;
      creator_handle: string;
      created_at: string;
    }>;
    superseded_by: {
      id: string;
      title: string;
      status: string;
      link_id: string;
    } | null;
  };
  meta: { request_id: string };
}

export function useArtifactLinks(artifactId: string) {
  return useQuery({
    queryKey: ['artifact-links', artifactId],
    queryFn: async () => {
      const response = await client.get<ArtifactLinksResponse>(`/artifacts/${artifactId}/links`);
      return response.data.data;
    },
    enabled: !!artifactId,
  });
}
