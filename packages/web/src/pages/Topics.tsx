import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useTopics, useCreateTopic, useRecentActivity } from '../api/hooks';
import { useGenerateTopicFields } from '../api/hooks/useAiTeam';
import { useAuthStore } from '../store/auth.store';
import type { ActivityItem } from '../api/hooks/useActivity';
import { Markdown } from '../components/common/Markdown';
import { Card, CardBody } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { LoadingState } from '../components/common/Spinner';
import { EmptyState, EmptyIcon } from '../components/common/EmptyState';
import { Badge, StatusDot } from '../components/common/Badge';
import { relativeTime } from '../utils/time';

const ACTIVITY_BORDER_COLORS: Record<string, string> = {
  comment: 'border-l-gray-300',
  thread: 'border-l-blue-400',
  artifact: 'border-l-emerald-400',
  task: 'border-l-amber-400',
};

const ACTIVITY_LABELS: Record<string, { label: string; variant: 'gray' | 'blue' | 'green' | 'yellow' }> = {
  comment: { label: 'comment', variant: 'gray' },
  thread: { label: 'new thread', variant: 'blue' },
  artifact: { label: 'artifact', variant: 'green' },
  task: { label: 'new task', variant: 'yellow' },
};

function activityLink(item: ActivityItem): string {
  if (item.thread_id) return `/threads/${item.thread_id}`;
  if (item.activity_type === 'artifact') return `/artifacts/${item.id}`;
  return `/topics/${item.topic_id}`;
}

function activityTitle(item: ActivityItem): string {
  if (item.activity_type === 'comment') return item.thread_title || '';
  return item.title || item.thread_title || '';
}

function toHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // non-alphanumeric → hyphen
    .replace(/^[^a-z]+/, '')        // strip leading non-letters (digits, hyphens)
    .replace(/-+$/g, '')            // strip trailing hyphens
    .slice(0, 64)
    .replace(/-+$/g, '') || '';     // strip trailing hyphens again after slice
}

type CreateMode = 'ai' | 'manual';

interface TopicFormState {
  name: string;
  handle: string;
  description: string;
  icon: string;
  first_principles: string;
}

const EMPTY_FORM: TopicFormState = { name: '', handle: '', description: '', icon: '', first_principles: '' };

export function Topics() {
  const { data: topics, isLoading, error } = useTopics();
  const createTopic = useCreateTopic();
  const generateFields = useGenerateTopicFields();
  const { isContributor } = useAuthStore();
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>('ai');
  const [aiPrompt, setAiPrompt] = useState('');
  const [topicForm, setTopicForm] = useState<TopicFormState>(EMPTY_FORM);
  const [showPreview, setShowPreview] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<string>('all');
  const [activityOffset, setActivityOffset] = useState(0);
  const { data: activityData } = useRecentActivity({
    limit: 25,
    type: activityFilter === 'all' ? undefined : activityFilter,
    offset: activityOffset,
  });
  const activity = activityData?.data || [];
  const hasMore = activityData?.meta?.has_more || false;

  const handleGenerate = () => {
    if (!aiPrompt.trim() || aiPrompt.trim().length < 3) return;
    generateFields.mutate({ description: aiPrompt.trim() }, {
      onSuccess: (data) => {
        setTopicForm({
          name: data.name,
          handle: data.handle,
          description: data.description,
          icon: data.icon,
          first_principles: data.first_principles,
        });
        setShowPreview(true);
      },
    });
  };

  const handleCreateTopic = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    const name = topicForm.name.trim();
    if (!name) { setCreateError('Name is required.'); return; }
    const handle = topicForm.handle.trim() || toHandle(name);
    if (handle.length < 3) { setCreateError('Handle must be at least 3 characters.'); return; }
    createTopic.mutate({
      handle,
      name,
      description: topicForm.description.trim() || undefined,
      icon: topicForm.icon.trim() || undefined,
      first_principles: topicForm.first_principles.trim() || undefined,
    }, {
      onSuccess: () => {
        setShowNewTopic(false);
        setTopicForm(EMPTY_FORM);
        setShowPreview(false);
        setAiPrompt('');
        setCreateError(null);
      },
      onError: (err: any) => {
        const details = err?.response?.data?.error?.details?.issues;
        if (details?.length) {
          setCreateError(details.map((i: any) => `${i.path}: ${i.message}`).join('; '));
        } else {
          setCreateError(err?.response?.data?.error?.message || err?.message || 'Failed to create topic.');
        }
      },
    });
  };

  if (isLoading) {
    return <LoadingState message="Loading topics..." />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load topics</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Topics</h1>
        {isContributor() && (
          <Button size="sm" onClick={() => setShowNewTopic(!showNewTopic)}>
            {showNewTopic ? 'Cancel' : 'New Topic'}
          </Button>
        )}
      </div>

      {showNewTopic && (
        <Card className="mb-6">
          <CardBody>
            {/* Mode toggle */}
            <div className="flex items-center gap-4 mb-4">
              <h3 className="text-sm font-medium text-gray-700">Create Topic</h3>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => { setCreateMode('ai'); setShowPreview(false); }}
                  className={clsx(
                    'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                    createMode === 'ai' ? 'bg-white text-cortex-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  AI Describe
                </button>
                <button
                  type="button"
                  onClick={() => { setCreateMode('manual'); setShowPreview(false); }}
                  className={clsx(
                    'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                    createMode === 'manual' ? 'bg-white text-cortex-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  Manual
                </button>
              </div>
            </div>

            {/* AI Describe mode */}
            {createMode === 'ai' && !showPreview && (
              <div className="space-y-3">
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Describe the topic you want to create... e.g., 'A project tracking our Bitcoin ATH frequency analysis and backtesting results'"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm resize-none"
                />
                {generateFields.isError && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                    {(generateFields.error as Error)?.message || 'Failed to generate topic fields'}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setShowNewTopic(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleGenerate}
                    loading={generateFields.isPending}
                    disabled={aiPrompt.trim().length < 3}
                  >
                    {generateFields.isPending ? 'Generating...' : 'Generate'}
                  </Button>
                </div>
              </div>
            )}

            {/* Preview mode (after AI generation) or Manual mode */}
            {(showPreview || createMode === 'manual') && (
              <form onSubmit={handleCreateTopic}>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={topicForm.icon}
                      onChange={(e) => setTopicForm(prev => ({ ...prev, icon: e.target.value }))}
                      placeholder="Icon"
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm text-center"
                      maxLength={4}
                    />
                    <input
                      type="text"
                      value={topicForm.name}
                      onChange={(e) => setTopicForm(prev => ({ ...prev, name: e.target.value, handle: toHandle(e.target.value) }))}
                      placeholder="Topic name *"
                      required
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={topicForm.handle}
                      onChange={(e) => setTopicForm(prev => ({ ...prev, handle: e.target.value }))}
                      placeholder="handle (auto-generated)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm font-mono"
                    />
                    {topicForm.handle && topicForm.handle.length < 3 && (
                      <p className="text-xs text-red-400 mt-1">Handle must be at least 3 characters</p>
                    )}
                  </div>
                  <div>
                    <textarea
                      value={topicForm.description}
                      onChange={(e) => setTopicForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Description — what is this topic about?"
                      rows={3}
                      className={clsx(
                        'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm resize-y',
                        topicForm.description.length > 20000 ? 'border-red-300' : 'border-gray-300'
                      )}
                    />
                    <p className={clsx(
                      'text-xs mt-1 text-right',
                      topicForm.description.length > 20000 ? 'text-red-500' : 'text-gray-400'
                    )}>
                      {topicForm.description.length.toLocaleString()} / 20,000
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">First Principles</label>
                    <textarea
                      value={topicForm.first_principles}
                      onChange={(e) => setTopicForm(prev => ({ ...prev, first_principles: e.target.value }))}
                      placeholder="Guiding principles and success criteria (supports markdown)"
                      rows={6}
                      className={clsx(
                        'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 text-sm resize-y font-mono',
                        topicForm.first_principles.length > 50000 ? 'border-red-300' : 'border-gray-300'
                      )}
                    />
                    <p className={clsx(
                      'text-xs mt-1 text-right',
                      topicForm.first_principles.length > 50000 ? 'text-red-500' : 'text-gray-400'
                    )}>
                      {topicForm.first_principles.length.toLocaleString()} / 50,000
                    </p>
                    {topicForm.first_principles && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-500 cursor-pointer">Preview</summary>
                        <div className="mt-1 p-3 bg-indigo-50/50 border border-indigo-200 rounded-lg prose prose-sm prose-indigo max-w-none">
                          <Markdown>{topicForm.first_principles}</Markdown>
                        </div>
                      </details>
                    )}
                  </div>
                  {createError && (
                    <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{createError}</p>
                  )}
                  <div className="flex justify-end gap-2">
                    {showPreview && (
                      <Button type="button" variant="secondary" size="sm" onClick={() => { setShowPreview(false); }}>
                        Back
                      </Button>
                    )}
                    <Button type="button" variant="secondary" size="sm" onClick={() => { setShowNewTopic(false); setTopicForm(EMPTY_FORM); setShowPreview(false); setAiPrompt(''); }}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      loading={createTopic.isPending}
                      disabled={!topicForm.name.trim() || (topicForm.handle || toHandle(topicForm.name)).length < 3 || topicForm.description.length > 20000 || topicForm.first_principles.length > 50000}
                    >
                      Create Topic
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </CardBody>
        </Card>
      )}

      {!topics || topics.length === 0 ? (
        <EmptyState
          title="No topics yet"
          description="Topics organize threads and artifacts by subject area."
          icon={<EmptyIcon />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((topic) => (
            <Link key={topic.id} to={`/topics/${topic.id}`}>
              <Card hover className="h-full">
                <CardBody>
                  <div className="flex items-start gap-3">
                    {topic.icon ? (
                      <span className="text-2xl">{topic.icon}</span>
                    ) : (
                      <div className="w-10 h-10 bg-cortex-100 rounded-lg flex items-center justify-center">
                        <span className="text-cortex-700 font-bold">
                          {topic.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {topic.name}
                      </h3>
                      <p className="text-sm text-gray-500 truncate">
                        {topic.handle}
                      </p>
                    </div>
                  </div>

                  {topic.description && (
                    <p className="mt-3 text-sm text-gray-600 line-clamp-2">
                      {topic.description}
                    </p>
                  )}

                  {/* Structured stats */}
                  <div className="mt-4 space-y-1.5">
                    {topic.open_thread_count > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <StatusDot status="open" />
                        <span className="text-gray-700 font-medium">
                          {topic.open_thread_count} open thread{topic.open_thread_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                    {topic.recent_decision_count > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <StatusDot status="accepted" />
                        <span className="text-gray-700">
                          {topic.recent_decision_count} decision{topic.recent_decision_count !== 1 ? 's' : ''} this week
                        </span>
                      </div>
                    )}
                    {topic.open_task_count > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <StatusDot status="in_progress" />
                        <span className="text-amber-800 font-medium">
                          {topic.open_task_count} open task{topic.open_task_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                    {topic.open_thread_count === 0 && topic.recent_decision_count === 0 && topic.open_task_count === 0 && (
                      <div className="text-xs text-gray-400">
                        {topic.thread_count} threads · {topic.artifact_count} artifacts
                      </div>
                    )}
                  </div>

                  {topic.last_activity_at && (
                    <div className="mt-2 text-xs text-gray-400">
                      Active {relativeTime(topic.last_activity_at)}
                    </div>
                  )}
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Recent Activity Feed */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
        <div className="flex gap-2 mb-4">
          {['all', 'thread', 'artifact', 'comment', 'task'].map((f) => (
            <button
              key={f}
              onClick={() => { setActivityFilter(f); setActivityOffset(0); }}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                activityFilter === f
                  ? 'bg-cortex-100 text-cortex-700'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
            </button>
          ))}
        </div>
        {activity.length > 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {activity.map((item) => {
              const meta = ACTIVITY_LABELS[item.activity_type] || ACTIVITY_LABELS.comment;
              const isCheckpoint = item.body?.startsWith('## Checkpoint');
              const isArtifactOrDecision = item.activity_type === 'artifact' || item.type === 'decision';
              const borderColor = ACTIVITY_BORDER_COLORS[item.activity_type] || 'border-l-gray-300';

              return (
                <Link
                  key={`${item.activity_type}-${item.id}`}
                  to={activityLink(item)}
                  className={clsx(
                    'block px-4 py-3 hover:bg-gray-50 transition-colors border-l-4',
                    borderColor,
                    isArtifactOrDecision && 'bg-emerald-50/40',
                    isCheckpoint && 'opacity-50'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                    <Badge variant="gray">{item.topic_name}</Badge>
                    <span className="text-xs font-medium text-gray-700">
                      {item.creator_display_name}
                    </span>
                    {item.creator_kind === 'agent' && (
                      <span className="bg-gray-200 text-gray-600 text-[10px] px-1 rounded font-mono leading-tight">
                        BOT
                      </span>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">
                      {relativeTime(item.created_at)}
                    </span>
                  </div>
                  <p className={clsx(
                    'text-sm truncate mb-1',
                    isArtifactOrDecision ? 'text-gray-800 font-medium' : 'text-gray-500'
                  )}>
                    {activityTitle(item)}
                  </p>
                  {item.body && (
                    <p className={clsx(
                      'text-gray-700 line-clamp-2',
                      isCheckpoint ? 'text-xs' : 'text-sm'
                    )}>
                      {item.body.replace(/[#*`\[\]]/g, '').slice(0, 200)}
                    </p>
                  )}
                </Link>
              );
            })}
            {hasMore && (
              <button
                onClick={() => setActivityOffset(prev => prev + 25)}
                className="w-full py-2 text-sm text-cortex-600 hover:text-cortex-700 font-medium"
              >
                Load more
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No activity to show.</p>
        )}
      </div>
    </div>
  );
}
