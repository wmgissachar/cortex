import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useThread, useTopic, useComments, useCreateComment, useUpdateThread, useAuditLogs, usePageView, useTrackEvent } from '../api/hooks';
import { useTriageObservations } from '../api/hooks/useAiTeam';
import { useAuthStore } from '../store/auth.store';
import { Card, CardBody } from '../components/common/Card';
import { Badge, getStatusVariant, getTypeVariant, StatusDot } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { LoadingState } from '../components/common/Spinner';
import { EmptyState, EmptyIcon } from '../components/common/EmptyState';
import { Markdown } from '../components/common/Markdown';
import { relativeTime } from '../utils/time';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import type { AuditLogEntry } from '../api/hooks/useAuditLogs';

const STATUS_BORDER_COLORS: Record<string, string> = {
  open: 'border-t-blue-500',
  resolved: 'border-t-green-500',
  archived: 'border-t-gray-400',
};

function AuditTimeline({ entries }: { entries: AuditLogEntry[] }) {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="relative pl-6">
      <div className="absolute left-2 top-2 bottom-2 w-px bg-gray-200" />
      {entries.map((entry) => {
        const actionLabel = entry.action.replace(/\./g, ' ').replace(/^(artifact|thread|task) /, '');
        const changes = entry.changes as Record<string, { before?: unknown; after?: unknown }> | null;
        const hasStatusChange = changes?.before !== undefined && changes?.after !== undefined;

        return (
          <div key={entry.id} className="relative pb-4 last:pb-0">
            <div className="absolute -left-4 top-1.5 w-2 h-2 rounded-full bg-gray-400 ring-2 ring-white" />
            <div className="text-sm">
              <span className="font-medium text-gray-700">{actionLabel}</span>
              <span className="text-gray-400"> — </span>
              <span className="text-gray-600">
                {entry.principal_display_name || entry.principal_handle || 'Unknown'}
              </span>
              <span className="text-gray-400"> — </span>
              <span className="text-gray-400">
                {format(new Date(entry.created_at), "MMM d, yyyy 'at' h:mm a")}
              </span>
            </div>
            {hasStatusChange && (
              <div className="mt-1 text-xs text-gray-500">
                <Badge variant={getStatusVariant(String(changes!.before))} className="mr-1">
                  {String(changes!.before)}
                </Badge>
                <span className="text-gray-400 mx-1">&rarr;</span>
                <Badge variant={getStatusVariant(String(changes!.after))}>
                  {String(changes!.after)}
                </Badge>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TriageButton({ threadId }: { threadId: string }) {
  const triage = useTriageObservations();
  return (
    <button
      onClick={() => triage.mutate({ thread_id: threadId })}
      disabled={triage.isPending}
      className="px-3 py-1.5 text-xs font-medium text-cortex-700 bg-cortex-50 rounded-lg hover:bg-cortex-100 disabled:opacity-50"
    >
      {triage.isPending ? 'Triaging...' : triage.isSuccess ? 'Triage posted' : 'Triage Observations'}
    </button>
  );
}

export function Thread() {
  const { id } = useParams<{ id: string }>();
  usePageView('thread', { thread_id: id });
  const trackEvent = useTrackEvent();
  const { isContributor } = useAuthStore();
  const [commentBody, setCommentBody] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const { data: thread, isLoading: threadLoading } = useThread(id!);
  const { data: topic } = useTopic(thread?.topic_id || '');
  const { data: comments, isLoading: commentsLoading } = useComments(id!);
  const { data: auditLogs } = useAuditLogs('thread', id!);
  const createComment = useCreateComment();
  const updateThread = useUpdateThread();

  // Track ai_output.viewed when AI-tagged comments are present
  const aiOutputTracked = useRef(false);
  useEffect(() => {
    if (aiOutputTracked.current || !comments) return;
    const aiFeatures = ['observation-triage', 'resolution-prompt', 'contradiction-detection', 'staleness-detection'];
    for (const comment of comments) {
      const match = comment.tags?.find((t: string) => aiFeatures.includes(t));
      if (match) {
        aiOutputTracked.current = true;
        trackEvent('ai_output.viewed', { feature: match, target_type: 'thread', target_id: id });
        break;
      }
    }
  }, [comments, id, trackEvent]);

  if (threadLoading) {
    return <LoadingState message="Loading thread..." />;
  }

  if (!thread) {
    return (
      <EmptyState
        title="Thread not found"
        description="The thread you're looking for doesn't exist."
        icon={<EmptyIcon />}
      />
    );
  }

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;

    createComment.mutate(
      { threadId: id!, body: commentBody, type: 'reply' },
      {
        onSuccess: () => setCommentBody(''),
      }
    );
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb — shows topic name */}
      <nav className="mb-4 text-sm">
        <Link to="/topics" className="text-cortex-600 hover:text-cortex-700">
          Topics
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        <Link
          to={`/topics/${thread.topic_id}`}
          className="text-cortex-600 hover:text-cortex-700"
        >
          {topic?.name || '...'}
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        <span className="text-gray-500">Thread</span>
      </nav>

      {/* Thread header — status-colored top border */}
      <div className={clsx(
        'bg-white rounded-lg border border-gray-200 p-6 mb-6 border-t-4',
        STATUS_BORDER_COLORS[thread.status] || 'border-t-gray-300'
      )}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-4">
            <StatusDot status={thread.status} />
            <Badge variant={getTypeVariant(thread.type)}>{thread.type}</Badge>
            <Badge variant={getStatusVariant(thread.status)}>{thread.status}</Badge>
          </div>
          {isContributor() && (
            <div className="flex gap-2">
              {thread.status === 'open' && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const hasNudge = !!(comments?.some(c => c.tags?.includes('resolution-prompt')));
                      updateThread.mutate({ id: id!, status: 'resolved' }, {
                        onSuccess: () => trackEvent('thread.status_changed', { thread_id: id, from_status: 'open', to_status: 'resolved', had_nudge: hasNudge }),
                      });
                    }}
                    loading={updateThread.isPending}
                  >
                    Resolve
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => updateThread.mutate({ id: id!, status: 'archived' }, {
                      onSuccess: () => trackEvent('thread.status_changed', { thread_id: id, from_status: 'open', to_status: 'archived', had_nudge: false }),
                    })}
                    loading={updateThread.isPending}
                  >
                    Archive
                  </Button>
                </>
              )}
              {thread.status === 'resolved' && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => updateThread.mutate({ id: id!, status: 'open' }, {
                      onSuccess: () => trackEvent('thread.status_changed', { thread_id: id, from_status: 'resolved', to_status: 'open', had_nudge: false }),
                    })}
                    loading={updateThread.isPending}
                  >
                    Reopen
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => updateThread.mutate({ id: id!, status: 'archived' }, {
                      onSuccess: () => trackEvent('thread.status_changed', { thread_id: id, from_status: 'resolved', to_status: 'archived', had_nudge: false }),
                    })}
                    loading={updateThread.isPending}
                  >
                    Archive
                  </Button>
                </>
              )}
              {thread.status === 'archived' && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => updateThread.mutate({ id: id!, status: 'open' }, {
                    onSuccess: () => trackEvent('thread.status_changed', { thread_id: id, from_status: 'archived', to_status: 'open', had_nudge: false }),
                  })}
                  loading={updateThread.isPending}
                >
                  Reopen
                </Button>
              )}
            </div>
          )}
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">{thread.title}</h1>

        {thread.summary && (
          <p className="text-gray-600 mb-3">{thread.summary}</p>
        )}

        <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
          <span>by {thread.creator.display_name}</span>
          <span>·</span>
          <span>{relativeTime(thread.created_at)}</span>
          <span>·</span>
          <span>{thread.comment_count} comments</span>
        </div>

        {thread.body && (
          <Markdown>{thread.body}</Markdown>
        )}

        {thread.tags && thread.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {thread.tags.map((tag) => (
              <Badge key={tag} variant="gray">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Audit History — collapsible */}
      {auditLogs && auditLogs.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            <svg
              className={clsx('w-4 h-4 transition-transform', showHistory && 'rotate-90')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            History ({auditLogs.length})
          </button>
          {showHistory && (
            <div className="mt-3">
              <AuditTimeline entries={auditLogs} />
            </div>
          )}
        </div>
      )}

      {/* Comments */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Comments ({comments?.length || 0})
          </h2>
          {(comments?.length || 0) >= 10 && <TriageButton threadId={id!} />}
        </div>

        {commentsLoading ? (
          <LoadingState message="Loading comments..." />
        ) : !comments || comments.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-gray-500 text-center py-4">
                No comments yet. Be the first to comment!
              </p>
            </CardBody>
          </Card>
        ) : (
          comments.map((comment) => {
            const isAgent = comment.creator.kind === 'agent';
            const subType = comment.tags?.find((t: string) =>
              ['negative-result', 'question', 'decision', 'methodology', 'result'].includes(t)
            );
            const subTypeBorder: Record<string, string> = {
              'negative-result': 'border-l-4 border-l-red-400',
              'question': 'border-l-4 border-l-amber-400',
              'decision': 'border-l-4 border-l-emerald-400',
              'result': 'border-l-4 border-l-blue-400',
              'methodology': 'border-l-4 border-l-purple-400',
            };
            const subTypeBadgeVariant: Record<string, string> = {
              'negative-result': 'red',
              'question': 'amber',
              'decision': 'green',
              'result': 'blue',
              'methodology': 'purple',
            };
            return (
              <Card key={comment.id} className={clsx(
                subType ? subTypeBorder[subType] : undefined,
                comment.significance === 2 && 'ring-1 ring-red-200 bg-red-50/30',
                comment.significance === 1 && 'ring-1 ring-amber-200 bg-amber-50/30',
              )}>
                <CardBody>
                  <div className="flex items-start gap-3">
                    {/* Avatar — agent vs human distinction */}
                    <div className={clsx(
                      'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                      isAgent
                        ? 'bg-cortex-100 text-cortex-700 ring-1 ring-cortex-300'
                        : 'bg-gray-100 text-gray-600'
                    )}>
                      <span className="font-medium text-sm">
                        {comment.creator.display_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">
                          {comment.creator.display_name}
                        </span>
                        {isAgent && (
                          <span className="bg-gray-200 text-gray-600 text-[10px] px-1 rounded font-mono leading-tight">
                            BOT
                          </span>
                        )}
                        {comment.type !== 'reply' && (
                          <Badge variant={getTypeVariant(comment.type)}>
                            {comment.type}
                          </Badge>
                        )}
                        {subType && (
                          <Badge variant={getStatusVariant(subTypeBadgeVariant[subType] || 'gray')}>
                            {subType}
                          </Badge>
                        )}
                        {comment.significance === 2 && (
                          <Badge variant="red">critical</Badge>
                        )}
                        {comment.significance === 1 && (
                          <Badge variant="amber">notable</Badge>
                        )}
                        <span className="text-sm text-gray-500">
                          {relativeTime(comment.created_at)}
                        </span>
                        {comment.edited && (
                          <span className="text-xs text-gray-400">(edited)</span>
                        )}
                      </div>
                      <Markdown>{comment.body}</Markdown>
                      {comment.tags && comment.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {comment.tags.map((tag) => (
                            <Badge key={tag} variant="gray">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })
        )}

        {/* Comment form */}
        {isContributor() && (
          <Card>
            <CardBody>
              <form onSubmit={handleSubmitComment}>
                <textarea
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Write a comment..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 focus:border-cortex-500 resize-none"
                />
                <div className="flex justify-end mt-3">
                  <Button
                    type="submit"
                    loading={createComment.isPending}
                    disabled={!commentBody.trim()}
                  >
                    Post Comment
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
