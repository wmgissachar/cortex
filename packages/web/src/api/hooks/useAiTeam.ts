/**
 * AI Team Hooks
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../client';
import type { AiTeamResponse, AiConfig, AiJob, AiUsageStats, UpdateAiConfigInput } from '@cortex/shared';

interface TeamResponse {
  data: AiTeamResponse;
  meta: { request_id: string };
}

interface ConfigResponse {
  data: AiConfig;
  meta: { request_id: string };
}

interface JobsResponse {
  data: AiJob[];
  meta: {
    request_id: string;
    has_more: boolean;
    next_cursor?: string;
  };
}

interface UsageResponse {
  data: AiUsageStats;
  meta: { request_id: string };
}

interface AiJobsOptions {
  persona?: string;
  status?: string;
  limit?: number;
}

export function useAiTeam() {
  return useQuery({
    queryKey: ['ai', 'team'],
    queryFn: async () => {
      const response = await client.get<TeamResponse>('/ai/team');
      return response.data.data;
    },
    refetchInterval: 30_000,
  });
}

export function useAiJobs(options: AiJobsOptions = {}) {
  const { persona, status, limit = 20 } = options;

  return useQuery({
    queryKey: ['ai', 'jobs', { persona, status, limit }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (persona) params.set('persona', persona);
      if (status) params.set('status', status);
      if (limit) params.set('limit', limit.toString());

      const response = await client.get<JobsResponse>(`/ai/jobs?${params}`);
      return response.data;
    },
  });
}

export function useAiUsage(days = 30) {
  return useQuery({
    queryKey: ['ai', 'usage', { days }],
    queryFn: async () => {
      const response = await client.get<UsageResponse>(`/ai/usage?days=${days}`);
      return response.data.data;
    },
    refetchInterval: 60_000,
  });
}

export function useAiConfig() {
  return useQuery({
    queryKey: ['ai', 'config'],
    queryFn: async () => {
      const response = await client.get<ConfigResponse>('/ai/config');
      return response.data.data;
    },
  });
}

export function useUpdateAiConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateAiConfigInput) => {
      const response = await client.patch<ConfigResponse>('/ai/config', input);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'team'] });
      queryClient.invalidateQueries({ queryKey: ['ai', 'config'] });
    },
  });
}

interface DigestResponse {
  data: AiJob;
  meta: { request_id: string };
}

interface DigestGenerateResponse {
  data: {
    job: AiJob;
    content: string;
    posted_to?: { thread_id: string; comment_id: string };
  };
  meta: { request_id: string };
}

export function useLatestDigest() {
  return useQuery({
    queryKey: ['ai', 'digest', 'latest'],
    queryFn: async () => {
      const response = await client.get<DigestResponse>('/ai/digest/latest');
      return response.data.data;
    },
    retry: false, // Don't retry 404s
  });
}

export function useGenerateDigest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await client.post<DigestGenerateResponse>('/ai/digest/generate');
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai'] });
    },
  });
}

interface TriggerResponse {
  data: {
    job: AiJob;
    content: string;
    posted_to?: { thread_id: string; comment_id: string };
  };
  meta: { request_id: string };
}

// Briefing hooks

export function useLatestBriefing(topicId: string | undefined) {
  return useQuery({
    queryKey: ['ai', 'briefing', 'latest', topicId],
    queryFn: async () => {
      const response = await client.get<DigestResponse>(
        `/ai/briefing/latest?topic_id=${topicId}`,
      );
      return response.data.data;
    },
    enabled: !!topicId,
    retry: false, // Don't retry 404s
  });
}

interface GenerateBriefingInput {
  topic_id: string;
  task_description?: string;
}

export function useGenerateBriefing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: GenerateBriefingInput) => {
      const response = await client.post<DigestGenerateResponse>(
        '/ai/briefing',
        input,
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['ai', 'briefing', 'latest', variables.topic_id],
      });
      queryClient.invalidateQueries({ queryKey: ['ai', 'jobs'] });
    },
  });
}

// Ask Cortex Q&A
export function useAskCortex() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { query: string; topic_id?: string }) => {
      const response = await client.post<TriggerResponse>('/ai/ask', input);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'jobs'] });
    },
  });
}

// Observation Triage
export function useTriageObservations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { thread_id: string }) => {
      const response = await client.post<TriggerResponse>('/ai/triage', input);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'jobs'] });
    },
  });
}

// Contradiction Detection
export function useDetectContradictions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { topic_id: string }) => {
      const response = await client.post<TriggerResponse>('/ai/contradictions', input);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'jobs'] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
  });
}

// Topic Synthesis
export function useGenerateTopicSynthesis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { topic_id: string }) => {
      const response = await client.post<TriggerResponse>('/ai/synthesis', input);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'jobs'] });
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    },
  });
}

// Staleness Detection
export function useDetectStaleness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { topic_id: string }) => {
      const response = await client.post<TriggerResponse>('/ai/staleness', input);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'jobs'] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
  });
}

// Plan Generation hooks

export function useLatestPlan(topicId: string | undefined) {
  return useQuery({
    queryKey: ['ai', 'plan', 'latest', topicId],
    queryFn: async () => {
      const response = await client.get<DigestResponse>(
        `/ai/plan/latest?topic_id=${topicId}`,
      );
      return response.data.data;
    },
    enabled: !!topicId,
    retry: false, // Don't retry 404s
  });
}

interface GeneratePlanResponse {
  data: {
    job: AiJob;
    content: string;
    thread_id: string;
  };
  meta: { request_id: string };
}

export function useGeneratePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { topic_id: string; effort?: 'standard' | 'deep' }) => {
      const response = await client.post<GeneratePlanResponse>(
        '/ai/plan',
        input,
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['ai', 'plan', 'latest', variables.topic_id],
      });
      queryClient.invalidateQueries({ queryKey: ['ai', 'jobs'] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
  });
}

// Generate Topic Fields (AI-assisted topic creation)
interface GenerateTopicFieldsResponse {
  data: {
    name: string;
    handle: string;
    icon: string;
    description: string;
    first_principles: string;
  };
  meta: { request_id: string };
}

export function useGenerateTopicFields() {
  return useMutation({
    mutationFn: async (input: { description: string }) => {
      const response = await client.post<GenerateTopicFieldsResponse>('/ai/generate-topic', input);
      return response.data.data;
    },
  });
}

// Research hooks

export function useLatestResearch(topicId: string | undefined) {
  return useQuery({
    queryKey: ['ai', 'research', 'latest', topicId],
    queryFn: async () => {
      const response = await client.get<DigestResponse>(
        `/ai/research/latest?topic_id=${topicId}`,
      );
      return response.data.data;
    },
    enabled: !!topicId,
    retry: false,
  });
}

interface ResearchResponse {
  data: {
    job: AiJob;
    content: string;
  };
  meta: { request_id: string };
}

export function useResearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      topic_id: string;
      query: string;
      mode?: 'gap-directed' | 'exploratory';
      auto_plan?: boolean;
      plan_effort?: 'standard' | 'deep';
    }) => {
      const response = await client.post<ResearchResponse>(
        '/ai/research',
        input,
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['ai', 'research', 'latest', variables.topic_id],
      });
      queryClient.invalidateQueries({ queryKey: ['ai', 'jobs'] });
    },
  });
}

export function useTriggerAiJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { persona: string; target_id: string }) => {
      const response = await client.post<TriggerResponse>('/ai/jobs', input);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai'] });
    },
  });
}

// First Principles Wizard hooks

interface WizardQuestion {
  id: string;
  context: string;
  question: string;
  options: Array<{ label: string; description: string; value: string }>;
}

interface WizardQuestionsResponse {
  data: {
    questions: WizardQuestion[];
  };
  meta: { request_id: string };
}

interface DiffLine {
  type: 'add' | 'remove' | 'context';
  text: string;
}

interface WizardSuggestResponse {
  data: {
    current: string;
    suggested: string;
    diff_lines: DiffLine[];
  };
  meta: { request_id: string };
}

export function useFirstPrinciplesQuestions() {
  return useMutation({
    mutationFn: async (input: { topic_id: string }) => {
      const response = await client.post<WizardQuestionsResponse>(
        '/ai/first-principles/questions',
        input,
      );
      return response.data.data;
    },
  });
}

export function useFirstPrinciplesSuggest() {
  return useMutation({
    mutationFn: async (input: { topic_id: string; answers: Record<string, string>; additional_context?: string }) => {
      const response = await client.post<WizardSuggestResponse>(
        '/ai/first-principles/suggest',
        input,
      );
      return response.data.data;
    },
  });
}

// Progress Scorecard hooks

export interface ScorecardCriterion {
  name: string;
  assessment: string;
  closeness: 'NOT_STARTED' | 'EARLY' | 'MAKING_PROGRESS' | 'NEARLY_THERE' | 'ACHIEVED' | 'BLOCKED';
}

export interface PracticalWin {
  criterion: string;
  win: string;
  how_to_use: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface ScorecardOutput {
  bottom_line: string | null;
  practical_wins: PracticalWin[];
  criteria: ScorecardCriterion[];
  overall: { assessment: string; closeness: string };
  delta_note: string | null;
}

interface ScorecardJobResponse {
  data: AiJob;
  meta: { request_id: string };
}

interface GenerateScorecardResponse {
  data: {
    job: AiJob;
    scorecard: ScorecardOutput;
  };
  meta: { request_id: string };
}

export function useLatestScorecard(topicId: string | undefined) {
  return useQuery({
    queryKey: ['ai', 'scorecard', 'latest', topicId],
    queryFn: async () => {
      const response = await client.get<ScorecardJobResponse>(
        `/ai/scorecard/latest?topic_id=${topicId}`,
      );
      return response.data.data;
    },
    enabled: !!topicId,
    retry: false,
  });
}

export function useGenerateScorecard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { topic_id: string }) => {
      const response = await client.post<GenerateScorecardResponse>(
        '/ai/scorecard',
        input,
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['ai', 'scorecard', 'latest', variables.topic_id],
      });
      queryClient.invalidateQueries({ queryKey: ['ai', 'jobs'] });
    },
  });
}

// Cancel running jobs for a topic

export function useCancelTopicJobs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { topic_id: string }) => {
      const response = await client.post<{ data: { cancelled: number }; meta: { request_id: string } }>(
        '/ai/cancel',
        input,
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai'] });
    },
  });
}

// Pipeline polling hook for auto-chain (research → plan → scorecard)

export type PipelineStage = 'idle' | 'discovering' | 'synthesizing' | 'planning' | 'scoring' | 'done' | 'error';

const RESEARCH_PHASE_POLL_INTERVAL = 4000;
const PLAN_POLL_INTERVAL = 5000;
const SCORECARD_POLL_INTERVAL = 3000;
const PLAN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export function usePipelinePolling(topicId: string | undefined) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<PipelineStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const cycleStartRef = useRef<string | null>(null);
  const planTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll for research phase (discovery → synthesis transition)
  const researchPhasePoll = useQuery({
    queryKey: ['ai', 'research', 'phase', topicId, 'pipeline-poll'],
    queryFn: async () => {
      const response = await client.get<{ data: { phase: string } }>(
        `/ai/research/phase?topic_id=${topicId}`,
      );
      return response.data.data;
    },
    enabled: (stage === 'discovering' || stage === 'synthesizing') && Boolean(topicId),
    refetchInterval: RESEARCH_PHASE_POLL_INTERVAL,
    retry: false,
  });

  // Transition: discovering → synthesizing when discovery completes
  useEffect(() => {
    if (stage !== 'discovering' || !researchPhasePoll.data) return;
    if (researchPhasePoll.data.phase === 'synthesis' || researchPhasePoll.data.phase === 'complete') {
      setStage('synthesizing');
    }
  }, [researchPhasePoll.data, stage]);

  // Poll for plan completion
  const planPoll = useQuery({
    queryKey: ['ai', 'plan', 'latest', topicId, 'pipeline-poll'],
    queryFn: async () => {
      const response = await client.get<{ data: AiJob }>(
        `/ai/plan/latest?topic_id=${topicId}`,
      );
      return response.data.data;
    },
    enabled: stage === 'planning' && Boolean(topicId),
    refetchInterval: PLAN_POLL_INTERVAL,
    retry: false,
  });

  // Poll for scorecard completion
  const scorecardPoll = useQuery({
    queryKey: ['ai', 'scorecard', 'latest', topicId, 'pipeline-poll'],
    queryFn: async () => {
      const response = await client.get<ScorecardJobResponse>(
        `/ai/scorecard/latest?topic_id=${topicId}`,
      );
      return response.data.data;
    },
    enabled: stage === 'scoring' && Boolean(topicId),
    refetchInterval: SCORECARD_POLL_INTERVAL,
    retry: false,
  });

  // Transition: planning → scoring when new plan appears
  useEffect(() => {
    if (stage !== 'planning' || !planPoll.data || !cycleStartRef.current) return;
    const planCreatedAt = new Date(planPoll.data.created_at).toISOString();
    if (planCreatedAt > cycleStartRef.current) {
      setStage('scoring');
      // Clear plan timeout
      if (planTimeoutRef.current) {
        clearTimeout(planTimeoutRef.current);
        planTimeoutRef.current = null;
      }
      queryClient.invalidateQueries({ queryKey: ['ai', 'plan', 'latest', topicId] });
    }
  }, [planPoll.data, stage, topicId, queryClient]);

  // Transition: scoring → done when new scorecard appears
  useEffect(() => {
    if (stage !== 'scoring' || !scorecardPoll.data || !cycleStartRef.current) return;
    const scCreatedAt = new Date(scorecardPoll.data.created_at).toISOString();
    if (scCreatedAt > cycleStartRef.current) {
      setStage('done');
      queryClient.invalidateQueries({ queryKey: ['ai', 'scorecard', 'latest', topicId] });
      queryClient.invalidateQueries({ queryKey: ['ai', 'plan', 'latest', topicId] });
      queryClient.invalidateQueries({ queryKey: ['ai', 'research', 'latest', topicId] });
    }
  }, [scorecardPoll.data, stage, topicId, queryClient]);

  // Plan timeout
  useEffect(() => {
    if (stage === 'planning') {
      planTimeoutRef.current = setTimeout(() => {
        setStage('error');
        setError('Plan generation timed out after 10 minutes. Try "Regenerate Plan" manually.');
      }, PLAN_TIMEOUT_MS);
    }
    return () => {
      if (planTimeoutRef.current) {
        clearTimeout(planTimeoutRef.current);
        planTimeoutRef.current = null;
      }
    };
  }, [stage]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (planTimeoutRef.current) clearTimeout(planTimeoutRef.current);
    };
  }, []);

  const startFullCycle = useCallback(() => {
    setStage('discovering');
    setError(null);
    cycleStartRef.current = new Date().toISOString();
  }, []);

  const onResearchComplete = useCallback(() => {
    setStage('planning');
    queryClient.invalidateQueries({ queryKey: ['ai', 'research', 'latest', topicId] });
  }, [topicId, queryClient]);

  const onResearchError = useCallback((err: string) => {
    setStage('error');
    setError(err);
  }, []);

  const reset = useCallback(() => {
    setStage('idle');
    setError(null);
    cycleStartRef.current = null;
    if (planTimeoutRef.current) {
      clearTimeout(planTimeoutRef.current);
      planTimeoutRef.current = null;
    }
  }, []);

  return { stage, error, startFullCycle, onResearchComplete, onResearchError, reset };
}

// Conclusion hooks

export function useLatestConclusion(topicId: string | undefined) {
  return useQuery({
    queryKey: ['ai', 'conclusion', 'latest', topicId],
    queryFn: async () => {
      const response = await client.get<ScorecardJobResponse>(
        `/ai/conclusion/latest?topic_id=${topicId}`,
      );
      return response.data.data;
    },
    enabled: !!topicId,
    retry: false,
  });
}

interface GenerateConclusionResponse {
  data: {
    job: AiJob;
    conclusion: string;
  };
  meta: { request_id: string };
}

export function useGenerateConclusion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { topic_id: string }) => {
      const response = await client.post<GenerateConclusionResponse>(
        '/ai/conclusion',
        input,
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['ai', 'conclusion', 'latest', variables.topic_id],
      });
      queryClient.invalidateQueries({ queryKey: ['ai', 'jobs'] });
      queryClient.invalidateQueries({ queryKey: ['topics'] });
    },
  });
}
