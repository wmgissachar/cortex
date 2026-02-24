import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../client';

export interface DashboardSummary {
  new_artifacts: number;
  resolved_threads: number;
  new_threads: number;
  completed_tasks: number;
  new_observations: number;
}

export interface AttentionItem {
  type: 'artifact' | 'task' | 'thread';
  id: string;
  title: string;
  reason: string;
  topic_name: string;
  created_at: string;
}

export interface CompletionItem {
  type: 'thread' | 'task';
  id: string;
  title: string;
  summary: string | null;
  topic_name: string;
  completed_at: string;
}

export interface KnowledgeBaseHealth {
  total_artifacts: number;
  accepted_count: number;
  deprecated_count: number;
  draft_count: number;
  open_threads: number;
  stale_threads: number;
}

export interface DashboardData {
  since: string;
  summary: DashboardSummary;
  needs_attention: AttentionItem[];
  recent_completions: CompletionItem[];
  knowledge_base_health: KnowledgeBaseHealth;
}

interface DashboardResponse {
  data: DashboardData;
  meta: { request_id: string };
}

export function useDashboard(since?: string) {
  return useQuery({
    queryKey: ['dashboard', since],
    queryFn: async () => {
      const params = since ? `?since=${since}` : '';
      const response = await client.get<DashboardResponse>(`/dashboard${params}`);
      return response.data.data;
    },
    refetchInterval: 60000,
  });
}

export function useMarkReviewed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await client.post('/dashboard/mark-reviewed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
