/**
 * Cortex API Client
 *
 * Handles communication with the Cortex API using API key authentication.
 * Format: Authorization: ApiKey <key>
 */

import type {
  Topic,
  Thread,
  ThreadWithCreator,
  Comment,
  CommentWithCreator,
  Artifact,
  ArtifactWithCreator,
  Task,
  TaskWithRelations,
  CreateCommentInput,
  CreateArtifactInput,
  CreateThreadInput,
  CreateTaskInput,
  UpdateArtifactInput,
} from '@cortex/shared';

// API Response wrapper type
interface ApiResponse<T> {
  data: T;
  meta: {
    request_id: string;
    has_more?: boolean;
    next_cursor?: string;
  };
}

// Search result type
export interface SearchResult {
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

// Thread with comments for get_thread
export interface ThreadWithComments extends ThreadWithCreator {
  comments: CommentWithCreator[];
  topic: {
    id: string;
    handle: string;
    name: string;
  };
}

// Context response type
export interface ContextResponse {
  workspace: {
    id: string;
    name: string;
  };
  topics: Array<{
    id: string;
    handle: string;
    name: string;
    description: string | null;
    thread_count: number;
    artifact_count: number;
  }>;
  recent_artifacts: Array<{
    id: string;
    title: string;
    type: string;
    summary: string | null;
    topic_handle: string;
  }>;
  open_tasks: Array<{
    id: string;
    title: string;
    body: string | null;
    status: string;
    priority: string;
    due_date: string | null;
    assignee: string | null;
  }>;
  recent_threads: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    summary: string | null;
    topic_id: string;
    comment_count: number;
    created_at: string;
  }>;
  draft_artifacts: Array<{
    id: string;
    title: string;
    type: string;
    summary: string | null;
    topic_handle: string;
  }>;
}

class CortexClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    const apiKey = process.env.CORTEX_API_KEY;
    if (!apiKey) {
      throw new Error('CORTEX_API_KEY environment variable is required');
    }

    this.apiKey = apiKey;
    this.baseUrl = process.env.CORTEX_API_URL || 'http://localhost:3000/v1';
  }

  /**
   * Make an authenticated request to the API
   */
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `ApiKey ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json() as { error?: { message?: string }; message?: string };
        errorMessage = errorData.error?.message || errorData.message || errorMessage;
      } catch {
        // Ignore JSON parse errors, use status code
      }
      throw new Error(errorMessage);
    }

    const data = await response.json() as ApiResponse<T>;
    return data.data;
  }

  /**
   * Get list of topics
   */
  async getTopics(limit: number = 50): Promise<Topic[]> {
    return this.request<Topic[]>(`/topics?limit=${limit}`);
  }

  /**
   * Get a specific topic by ID
   */
  async getTopic(id: string): Promise<Topic> {
    return this.request<Topic>(`/topics/${id}`);
  }

  /**
   * Create a new topic
   */
  async createTopic(input: { handle: string; name: string; description?: string; icon?: string; first_principles?: string }): Promise<Topic> {
    return this.request<Topic>('/topics', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * Get list of artifacts
   */
  async getArtifacts(options: {
    status?: string;
    topicId?: string;
    limit?: number;
  } = {}): Promise<ArtifactWithCreator[]> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.topicId) params.set('topic_id', options.topicId);
    if (options.limit) params.set('limit', options.limit.toString());

    const query = params.toString();
    return this.request<ArtifactWithCreator[]>(`/artifacts${query ? `?${query}` : ''}`);
  }

  /**
   * Get a specific artifact by ID
   */
  async getArtifact(id: string): Promise<ArtifactWithCreator> {
    return this.request<ArtifactWithCreator>(`/artifacts/${id}`);
  }

  /**
   * Create a new artifact
   */
  async createArtifact(input: CreateArtifactInput): Promise<ArtifactWithCreator> {
    return this.request<ArtifactWithCreator>('/artifacts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * Get list of threads
   */
  async getThreads(options: {
    topicId?: string;
    status?: string;
    limit?: number;
  } = {}): Promise<ThreadWithCreator[]> {
    const params = new URLSearchParams();
    if (options.topicId) params.set('topic_id', options.topicId);
    if (options.status) params.set('status', options.status);
    if (options.limit) params.set('limit', options.limit.toString());

    const query = params.toString();
    return this.request<ThreadWithCreator[]>(`/threads${query ? `?${query}` : ''}`);
  }

  /**
   * Create a new thread
   */
  async createThread(input: CreateThreadInput): Promise<ThreadWithCreator> {
    return this.request<ThreadWithCreator>('/threads', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * Get a thread with all its comments
   */
  async getThread(id: string): Promise<ThreadWithComments> {
    const thread = await this.request<ThreadWithCreator>(`/threads/${id}`);
    const comments = await this.request<CommentWithCreator[]>(`/threads/${id}/comments?limit=100`);

    // Get topic info
    const topic = await this.request<Topic>(`/topics/${thread.topic_id}`);

    return {
      ...thread,
      comments,
      topic: {
        id: topic.id,
        handle: topic.handle,
        name: topic.name,
      },
    };
  }

  /**
   * Create a comment on a thread
   */
  async createComment(
    threadId: string,
    body: string,
    options: { type?: string; tags?: string[]; significance?: number } = {}
  ): Promise<CommentWithCreator> {
    return this.request<CommentWithCreator>(`/threads/${threadId}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        body,
        type: options.type || 'observation',
        tags: options.tags,
        significance: options.significance,
      }),
    });
  }

  /**
   * Search across the knowledge base
   */
  async search(
    query: string,
    options: {
      type?: string;
      topicId?: string;
      status?: string;
      tags?: string[];
      creatorKind?: string;
      limit?: number;
    } = {}
  ): Promise<SearchResult[]> {
    const params = new URLSearchParams({ q: query });
    if (options.type) params.set('type', options.type);
    if (options.topicId) params.set('topic_id', options.topicId);
    if (options.status) params.set('status', options.status);
    if (options.tags && options.tags.length > 0) params.set('tags', options.tags.join(','));
    if (options.creatorKind) params.set('creator_kind', options.creatorKind);
    if (options.limit) params.set('limit', options.limit.toString());

    return this.request<SearchResult[]>(`/search?${params}`);
  }

  /**
   * Get list of tasks
   */
  async getTasks(options: {
    status?: string;
    assigneeId?: string;
    limit?: number;
  } = {}): Promise<TaskWithRelations[]> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.assigneeId) params.set('assignee_id', options.assigneeId);
    if (options.limit) params.set('limit', options.limit.toString());

    const query = params.toString();
    return this.request<TaskWithRelations[]>(`/tasks${query ? `?${query}` : ''}`);
  }

  /**
   * Get a specific task by ID
   */
  async getTask(id: string): Promise<TaskWithRelations> {
    return this.request<TaskWithRelations>(`/tasks/${id}`);
  }

  /**
   * Create a new task
   */
  async createTask(input: CreateTaskInput): Promise<TaskWithRelations> {
    return this.request<TaskWithRelations>('/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * Update a task
   */
  async updateTask(
    id: string,
    updates: {
      status?: string;
      title?: string;
      body?: string;
      priority?: string;
      due_date?: string;
      tags?: string[];
    }
  ): Promise<TaskWithRelations> {
    return this.request<TaskWithRelations>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  /**
   * Update a thread
   */
  async updateThread(
    id: string,
    updates: {
      status?: string;
      title?: string;
      type?: string;
      body?: string;
      summary?: string;
      tags?: string[];
      pinned?: boolean;
    }
  ): Promise<ThreadWithCreator> {
    return this.request<ThreadWithCreator>(`/threads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  /**
   * Create a knowledge link between two artifacts
   */
  async createKnowledgeLink(input: {
    source_id: string;
    target_id: string;
    link_type: string;
  }): Promise<{ id: string }> {
    return this.request<{ id: string }>('/knowledge-links', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * Get knowledge links for an artifact
   */
  async getArtifactLinks(artifactId: string): Promise<{
    links: Array<{
      id: string;
      source_id: string;
      target_id: string;
      link_type: string;
      source_title: string;
      target_title: string;
    }>;
    superseded_by: { id: string; title: string } | null;
  }> {
    return this.request(`/artifacts/${artifactId}/links`);
  }

  /**
   * Update a draft artifact
   */
  async updateArtifact(
    id: string,
    input: UpdateArtifactInput
  ): Promise<ArtifactWithCreator> {
    return this.request<ArtifactWithCreator>(`/artifacts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  /**
   * Generate a topic briefing via the AI service
   */
  async generateBriefing(
    topicId: string,
    taskDescription?: string,
  ): Promise<string> {
    const result = await this.request<{
      job: { id: string; status: string; tokens_used: number | null; cost_usd: string | null };
      content: string;
    }>('/ai/briefing', {
      method: 'POST',
      body: JSON.stringify({
        topic_id: topicId,
        task_description: taskDescription,
      }),
    });
    return result.content;
  }

  /**
   * Ask Cortex a natural language question
   */
  async askCortex(query: string, topicId?: string): Promise<string> {
    const body: Record<string, string> = { query };
    if (topicId) body.topic_id = topicId;

    const result = await this.request<{
      job: { id: string; status: string; tokens_used: number | null; cost_usd: string | null };
      content: string;
    }>('/ai/ask', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return result.content;
  }

  /**
   * Get events summary for evaluation
   */
  async getEventsSummary(days: number = 30): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/events/summary?days=${days}`);
  }

  /**
   * Get session audit for a thread
   */
  async getSessionAudit(threadId: string, topicId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      `/threads/${threadId}/session-audit?topic_id=${topicId}`
    );
  }

  /**
   * Get context overview (topics, recent artifacts, open tasks)
   */
  async getContext(): Promise<ContextResponse> {
    // Fetch all context data in parallel
    const [topics, artifacts, draftArtifacts, tasks, threads] = await Promise.all([
      this.getTopics(20),
      this.getArtifacts({ status: 'accepted', limit: 10 }),
      this.getArtifacts({ status: 'draft', limit: 5 }),
      this.getTasks({ status: 'open', limit: 10 }),
      this.getThreads({ limit: 10 }),
    ]);

    // Extract workspace info from first topic (all belong to same workspace)
    const workspaceId = topics[0]?.workspace_id || 'unknown';

    return {
      workspace: {
        id: workspaceId,
        name: 'Cortex',
      },
      topics: topics.map(t => ({
        id: t.id,
        handle: t.handle,
        name: t.name,
        description: t.description,
        thread_count: t.thread_count,
        artifact_count: t.artifact_count,
      })),
      recent_threads: threads.map(t => ({
        id: t.id,
        title: t.title,
        type: t.type,
        status: t.status,
        summary: t.summary,
        topic_id: t.topic_id,
        comment_count: t.comment_count,
        created_at: new Date(t.created_at).toISOString(),
      })),
      recent_artifacts: artifacts.map(a => ({
        id: a.id,
        title: a.title,
        type: a.type,
        summary: a.summary,
        topic_handle: a.topic.handle,
      })),
      draft_artifacts: draftArtifacts.map(a => ({
        id: a.id,
        title: a.title,
        type: a.type,
        summary: a.summary,
        topic_handle: a.topic.handle,
      })),
      open_tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        body: t.body,
        status: t.status,
        priority: t.priority,
        due_date: t.due_date,
        assignee: t.assignee?.display_name || null,
      })),
    };
  }
}

// Export singleton instance
export const client = new CortexClient();
