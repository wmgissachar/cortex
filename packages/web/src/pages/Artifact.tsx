import { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { useParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useArtifact, useAcceptArtifact, useRejectArtifact, useDeprecateArtifact, useArtifactLinks, useComments, useCreateComment, useAuditLogs, usePageView, useTrackEvent } from '../api/hooks';
import { useTriggerAiJob } from '../api/hooks/useAiTeam';
import { useAuthStore } from '../store/auth.store';
import { Card, CardBody } from '../components/common/Card';
import { Badge, getStatusVariant, getTypeVariant, StatusDot } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { LoadingState } from '../components/common/Spinner';
import { EmptyState, EmptyIcon } from '../components/common/EmptyState';
import { Markdown } from '../components/common/Markdown';
import { relativeTime } from '../utils/time';
import { format } from 'date-fns';
import type { AuditLogEntry } from '../api/hooks/useAuditLogs';

function AuditTimeline({ entries }: { entries: AuditLogEntry[] }) {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="relative pl-6">
      {/* Vertical timeline line */}
      <div className="absolute left-2 top-2 bottom-2 w-px bg-gray-200" />

      {entries.map((entry) => {
        const actionLabel = entry.action.replace(/\./g, ' ').replace(/^(artifact|thread|task) /, '');
        const changes = entry.changes as Record<string, { before?: unknown; after?: unknown }> | null;
        const hasStatusChange = changes?.before !== undefined && changes?.after !== undefined;

        return (
          <div key={entry.id} className="relative pb-4 last:pb-0">
            {/* Timeline dot */}
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

export function Artifact() {
  const { id } = useParams<{ id: string }>();
  usePageView('artifact', { artifact_id: id });
  const trackEvent = useTrackEvent();
  const { isAdmin, isContributor } = useAuthStore();
  const [commentBody, setCommentBody] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const queryClient = useQueryClient();
  const { data: artifact, isLoading } = useArtifact(id!);
  const acceptArtifact = useAcceptArtifact();
  const rejectArtifact = useRejectArtifact();
  const deprecateArtifact = useDeprecateArtifact();
  const triggerReview = useTriggerAiJob();
  const { data: linksData } = useArtifactLinks(id!);
  const { data: auditLogs } = useAuditLogs('artifact', id!);
  const { data: comments, isLoading: commentsLoading } = useComments(artifact?.thread_id || '', 100);
  const createComment = useCreateComment();

  // Track ai_output.viewed when AI critic review is present
  const aiOutputTracked = useRef(false);
  useEffect(() => {
    if (aiOutputTracked.current || !comments) return;
    const criticReviewComment = comments.find(c => c.tags?.includes('ai-critic'));
    if (criticReviewComment) {
      aiOutputTracked.current = true;
      trackEvent('ai_output.viewed', { feature: 'skeptical-review', target_type: 'artifact', target_id: id });
    }
  }, [comments, id, trackEvent]);

  if (isLoading) {
    return <LoadingState message="Loading artifact..." />;
  }

  if (!artifact) {
    return (
      <EmptyState
        title="Artifact not found"
        description="The artifact you're looking for doesn't exist."
        icon={<EmptyIcon />}
      />
    );
  }

  const canReview = isAdmin() && artifact.status === 'proposed';

  const handleAccept = () => {
    acceptArtifact.mutate(id!, {
      onSuccess: () => trackEvent('artifact.status_changed', { artifact_id: id, from_status: 'proposed', to_status: 'accepted' }),
    });
  };

  const handleReject = () => {
    rejectArtifact.mutate(id!, {
      onSuccess: () => trackEvent('artifact.status_changed', { artifact_id: id, from_status: 'proposed', to_status: 'rejected' }),
    });
  };

  const handleDeprecate = () => {
    if (window.confirm('Are you sure you want to deprecate this artifact? This marks it as outdated for all consumers.')) {
      deprecateArtifact.mutate(id!, {
        onSuccess: () => trackEvent('artifact.status_changed', { artifact_id: id, from_status: artifact.status, to_status: 'deprecated' }),
      });
    }
  };

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim() || !artifact?.thread_id) return;

    createComment.mutate(
      { threadId: artifact.thread_id, body: commentBody, type: 'reply' },
      { onSuccess: () => setCommentBody('') }
    );
  };

  // Group knowledge links by type
  const linksByType: Record<string, typeof linksData extends { links: (infer T)[] } ? T[] : never[]> = {};
  if (linksData?.links) {
    for (const link of linksData.links) {
      const displayType = link.source_id === id
        ? link.link_type
        : (link.link_type === 'supersedes' ? 'superseded by' : link.link_type);
      if (!linksByType[displayType]) linksByType[displayType] = [];
      linksByType[displayType].push(link);
    }
  }

  const linkCount = linksData?.links?.length || 0;

  // Derive AI review status from discussion comments
  const criticReview = comments?.find(c => c.tags?.includes('ai-critic'));
  const hasReview = !!criticReview;
  // Try multiple score formats: "**Overall: X.X/5**", "quality score: X/10", "Overall: X.X/5"
  const scoreMatch = criticReview?.body.match(/\*\*Overall:\s*([\d.]+)\/5\*\*/)
    || criticReview?.body.match(/Overall:\s*([\d.]+)\/5/)
    || criticReview?.body.match(/quality score:\s*([\d.]+)\/10/i);
  let qualityScore: string | undefined;
  if (scoreMatch) {
    const raw = parseFloat(scoreMatch[1]);
    // Normalize /10 scores to /5
    qualityScore = scoreMatch[0].includes('/10') ? (raw / 2).toFixed(1) : raw.toFixed(1);
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm">
        <Link to="/topics" className="text-cortex-600 hover:text-cortex-700">
          Topics
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        <Link
          to={`/topics/${artifact.topic_id}`}
          className="text-cortex-600 hover:text-cortex-700"
        >
          {artifact.topic.name}
        </Link>
        <span className="mx-2 text-gray-400">/</span>
        <span className="text-gray-500">Artifact</span>
      </nav>

      {/* Artifact card */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <StatusDot status={artifact.status} />
                <Badge variant={getTypeVariant(artifact.type)}>
                  {artifact.type}
                </Badge>
                <Badge variant={getStatusVariant(artifact.status)}>
                  {artifact.status}
                </Badge>
                <span className="text-sm text-gray-500">v{artifact.version}</span>
              </div>

              <h1 className="text-2xl font-bold text-gray-900">
                {artifact.title}
              </h1>

              <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
                <span>by {artifact.creator.display_name}</span>
                <span>·</span>
                <span>{relativeTime(artifact.created_at)}</span>
                {artifact.accepted_at && (
                  <>
                    <span>·</span>
                    <span>
                      Accepted {relativeTime(artifact.accepted_at)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Review actions */}
            {canReview && (
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  onClick={handleReject}
                  loading={rejectArtifact.isPending}
                >
                  Reject
                </Button>
                <Button
                  onClick={handleAccept}
                  loading={acceptArtifact.isPending}
                >
                  Accept
                </Button>
              </div>
            )}
            {isAdmin() && artifact.status === 'accepted' && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleDeprecate}
                loading={deprecateArtifact.isPending}
              >
                Deprecate
              </Button>
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  triggerReview.mutate(
                    { persona: 'critic', target_id: id! },
                    { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comments'] }) }
                  );
                }}
                loading={triggerReview.isPending}
              >
                {triggerReview.isPending ? 'Reviewing...' : 'Request AI Review'}
              </Button>
              {triggerReview.isSuccess && (
                <span className="text-xs text-green-600">Review posted</span>
              )}
              {triggerReview.isError && (
                <span className="text-xs text-red-600">
                  {(triggerReview.error as Error)?.message || 'Review failed'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Context summary bar */}
        {(linkCount > 0 || (auditLogs && auditLogs.length > 0) || hasReview || !commentsLoading) && (
          <div className="px-6 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-4 text-xs text-gray-500">
            {hasReview && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-green-600 font-medium">AI Reviewed</span>
                {qualityScore && (
                  <Badge variant={
                    parseFloat(qualityScore) >= 4 ? 'green'
                      : parseFloat(qualityScore) >= 3 ? 'yellow'
                        : 'red'
                  }>
                    Quality: {qualityScore}/5
                  </Badge>
                )}
              </span>
            )}
            {!hasReview && !commentsLoading && (
              <span className="text-gray-400">Not yet reviewed</span>
            )}
            {linkCount > 0 && (
              <span>Connected to {linkCount} artifact{linkCount !== 1 ? 's' : ''}</span>
            )}
            {auditLogs && auditLogs.length > 0 && (
              <span>Last updated {relativeTime(auditLogs[0].created_at)}</span>
            )}
          </div>
        )}

        {/* Supersession/deprecation banners */}
        {linksData?.superseded_by && (
          <div className="px-6 py-3 bg-amber-50 border-b border-amber-200">
            <p className="text-amber-800 text-sm">
              This artifact has been superseded by{' '}
              <Link to={`/artifacts/${linksData.superseded_by.id}`} className="font-medium underline">
                {linksData.superseded_by.title}
              </Link>
            </p>
          </div>
        )}
        {artifact.status === 'deprecated' && !linksData?.superseded_by && (
          <div className="px-6 py-3 bg-red-50 border-b border-red-200">
            <p className="text-red-800 text-sm">
              This artifact has been deprecated.
            </p>
          </div>
        )}

        {/* Summary */}
        {artifact.summary && (
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
            <h2 className="text-sm font-medium text-gray-500 mb-1">Summary</h2>
            <p className="text-gray-700">{artifact.summary}</p>
          </div>
        )}

        {/* Body */}
        <div className="p-6">
          <Markdown>{artifact.body}</Markdown>
        </div>

        {/* Tags */}
        {artifact.tags && artifact.tags.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100">
            <h2 className="text-sm font-medium text-gray-500 mb-2">Tags</h2>
            <div className="flex flex-wrap gap-2">
              {artifact.tags.map((tag) => (
                <Badge key={tag} variant="gray">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* References */}
        {artifact.references && artifact.references.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100">
            <h2 className="text-sm font-medium text-gray-500 mb-2">References</h2>
            <ul className="space-y-2">
              {artifact.references.map((ref, i) => (
                <li key={i} className="text-sm">
                  {ref.type === 'url' && ref.url ? (
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cortex-600 hover:text-cortex-700"
                    >
                      {ref.title || ref.url}
                    </a>
                  ) : ref.type === 'thread' && ref.id ? (
                    <Link
                      to={`/threads/${ref.id}`}
                      className="text-cortex-600 hover:text-cortex-700"
                    >
                      Thread: {ref.title || ref.id}
                    </Link>
                  ) : (
                    <span className="text-gray-700">{ref.title || 'Reference'}</span>
                  )}
                  {ref.snippet && (
                    <span className="text-gray-500 ml-2">— "{ref.snippet}"</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Knowledge Links — grouped by type */}
        {Object.keys(linksByType).length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100">
            <h2 className="text-sm font-medium text-gray-500 mb-3">Knowledge Links</h2>
            <div className="space-y-3">
              {Object.entries(linksByType).map(([type, links]) => (
                <div key={type}>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    {type.replace('_', ' ')}
                  </h3>
                  <ul className="space-y-1">
                    {links.map((link) => {
                      const targetId = link.source_id === id ? link.target_id : link.source_id;
                      const targetTitle = link.source_id === id ? link.target_title : link.source_title;
                      const targetStatus = link.source_id === id ? link.target_status : link.source_status;
                      return (
                        <li key={link.id} className="flex items-center gap-2 text-sm">
                          <StatusDot status={targetStatus} />
                          <Link
                            to={`/artifacts/${targetId}`}
                            className="text-cortex-600 hover:text-cortex-700"
                            onClick={() => trackEvent('knowledge_link.navigated', { source_id: id, target_id: targetId, link_type: link.link_type })}
                          >
                            {targetTitle}
                          </Link>
                          <Badge variant={getStatusVariant(targetStatus)} className="text-[10px]">
                            {targetStatus}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audit History */}
        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            History ({auditLogs?.length || 0})
          </button>
          {showHistory && auditLogs && (
            <div className="mt-3">
              {auditLogs.length === 0 ? (
                <p className="text-sm text-gray-400">No audit history recorded.</p>
              ) : (
                <AuditTimeline entries={auditLogs} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Discussion */}
      {artifact.thread_id && (
        <div className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Discussion ({comments?.length || 0})
          </h2>

          {commentsLoading ? (
            <LoadingState message="Loading comments..." />
          ) : !comments || comments.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-gray-500 text-center py-4">
                  No comments yet. Start a discussion about this artifact.
                </p>
              </CardBody>
            </Card>
          ) : (
            comments.map((comment) => (
              <Card key={comment.id} className={clsx(
                comment.significance === 2 && 'ring-1 ring-red-200 bg-red-50/30',
                comment.significance === 1 && 'ring-1 ring-amber-200 bg-amber-50/30',
              )}>
                <CardBody>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-gray-600 font-medium text-sm">
                        {comment.creator.display_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">
                          {comment.creator.display_name}
                        </span>
                        {comment.type !== 'reply' && (
                          <Badge variant={getTypeVariant(comment.type)}>
                            {comment.type}
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
            ))
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
      )}
    </div>
  );
}
