import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useDashboard, useMarkReviewed, usePageView } from '../api/hooks';
import { useTrackEvent } from '../api/hooks/useTrackEvent';
import { useLatestDigest, useGenerateDigest } from '../api/hooks/useAiTeam';
import { Card, CardBody } from '../components/common/Card';
import { Badge, getStatusVariant, getTypeVariant } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { LoadingState } from '../components/common/Spinner';
import { Markdown } from '../components/common/Markdown';
import { relativeTime } from '../utils/time';
import { clsx } from 'clsx';
import type { AttentionItem, CompletionItem } from '../api/hooks/useDashboard';

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={clsx('bg-white rounded-lg border p-4', value > 0 ? `border-${color}-200` : 'border-gray-200')}>
      <div className={clsx('text-2xl font-bold', value > 0 ? `text-${color}-600` : 'text-gray-400')}>
        {value}
      </div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function AttentionCard({ item }: { item: AttentionItem }) {
  const linkTo = item.type === 'artifact'
    ? `/artifacts/${item.id}`
    : item.type === 'thread'
      ? `/threads/${item.id}`
      : `/tasks`;

  const reasonColors: Record<string, string> = {
    'new decision': 'amber',
    'approaching due date': 'red',
    'open question': 'blue',
  };
  const color = reasonColors[item.reason] || 'gray';

  return (
    <Link to={linkTo}>
      <div className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
        <div className={clsx(
          'w-2 h-2 rounded-full flex-shrink-0',
          color === 'red' ? 'bg-red-500' : color === 'amber' ? 'bg-amber-500' : 'bg-blue-500'
        )} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={getTypeVariant(item.type)}>{item.type}</Badge>
            <span className="text-sm font-medium text-gray-900 truncate">{item.title}</span>
          </div>
          {item.topic_name && (
            <span className="text-xs text-gray-400">{item.topic_name}</span>
          )}
        </div>
        <Badge variant={getStatusVariant(item.reason)}>{item.reason}</Badge>
      </div>
    </Link>
  );
}

function CompletionCard({ item }: { item: CompletionItem }) {
  const linkTo = item.type === 'thread' ? `/threads/${item.id}` : `/tasks`;

  return (
    <Link to={linkTo}>
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 rounded-lg transition-colors">
        <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-3 h-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="gray">{item.type}</Badge>
            <span className="text-sm text-gray-700 truncate">{item.title}</span>
          </div>
          {item.summary && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-1">{item.summary}</p>
          )}
          <div className="text-xs text-gray-400 mt-1">
            {item.topic_name && <span>{item.topic_name} · </span>}
            {relativeTime(item.completed_at)}
          </div>
        </div>
      </div>
    </Link>
  );
}

function HealthBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-24">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div
          className={clsx('h-2 rounded-full', `bg-${color}-500`)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm text-gray-500 w-12 text-right">{value}</span>
    </div>
  );
}

function DigestCard() {
  const [expanded, setExpanded] = useState(false);
  const trackEvent = useTrackEvent();
  const digestViewed = useRef(false);
  const { data: digest, isLoading, isError } = useLatestDigest();
  const generate = useGenerateDigest();

  // Track digest.viewed when expanded
  useEffect(() => {
    if (expanded && digest && !digestViewed.current) {
      digestViewed.current = true;
      trackEvent('digest.viewed', {});
    }
  }, [expanded, digest, trackEvent]);

  if (isLoading) return null;

  // No digest yet — show prompt to generate
  if (isError || !digest) {
    return (
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Daily Digest</h2>
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                No digest generated yet. Generate one to get an AI-written briefing of recent activity.
              </p>
              <Button
                size="sm"
                onClick={() => generate.mutate()}
                loading={generate.isPending}
              >
                {generate.isPending ? 'Generating...' : 'Generate now'}
              </Button>
            </div>
            {generate.isSuccess && generate.data && (
              <div className="mt-4 pt-4 border-t max-h-96 overflow-y-auto">
                <Markdown>{generate.data.content}</Markdown>
              </div>
            )}
            {generate.isError && (
              <p className="mt-2 text-sm text-red-600">
                {(generate.error as Error)?.message || 'Failed to generate digest'}
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    );
  }

  // Have a digest — show it
  const content = (digest.output as { content?: string } | null)?.content;

  return (
    <div className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-lg font-semibold text-gray-700 hover:text-gray-900 mb-3"
      >
        <svg
          className={clsx('w-4 h-4 transition-transform', expanded && 'rotate-90')}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Daily Digest
        <span className="text-sm font-normal text-gray-400 ml-2">
          {relativeTime(digest.created_at)}
        </span>
      </button>
      {expanded && (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                {digest.tokens_used && (
                  <span>{digest.tokens_used.toLocaleString()} tokens</span>
                )}
                {digest.cost_usd != null && (
                  <span>· ${typeof digest.cost_usd === 'number' ? digest.cost_usd.toFixed(3) : digest.cost_usd}</span>
                )}
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => generate.mutate()}
                loading={generate.isPending}
              >
                {generate.isPending ? 'Regenerating...' : 'Regenerate'}
              </Button>
            </div>
            {content ? (
              <div
                className="max-h-[600px] overflow-y-auto prose prose-sm"
                onClick={(e) => {
                  const link = (e.target as HTMLElement).closest('a');
                  if (link) {
                    const href = link.getAttribute('href') || '';
                    // Extract target type/id from internal links like /threads/xxx or /artifacts/xxx
                    const match = href.match(/\/(threads|artifacts)\/([a-f0-9-]+)/);
                    trackEvent('digest.link_clicked', {
                      target_type: match?.[1] || 'external',
                      target_id: match?.[2] || href,
                    });
                  }
                }}
              >
                <Markdown>{content}</Markdown>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No content available for this digest.</p>
            )}
            {generate.isSuccess && generate.data && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-green-600 mb-2 font-medium">New digest generated:</p>
                <div className="max-h-96 overflow-y-auto prose prose-sm">
                  <Markdown>{generate.data.content}</Markdown>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export function Dashboard() {
  usePageView('dashboard');
  const [showCompletions, setShowCompletions] = useState(false);
  const { data: dashboard, isLoading } = useDashboard();
  const markReviewed = useMarkReviewed();

  if (isLoading) {
    return <LoadingState message="Loading dashboard..." />;
  }

  if (!dashboard) {
    return <div className="text-gray-500 text-center py-8">Failed to load dashboard.</div>;
  }

  const { summary, needs_attention, recent_completions, knowledge_base_health: health } = dashboard;
  const totalActivity = summary.new_artifacts + summary.resolved_threads + summary.new_threads +
    summary.completed_tasks + summary.new_observations;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Since {relativeTime(dashboard.since)}
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => markReviewed.mutate()}
          loading={markReviewed.isPending}
        >
          Mark as Reviewed
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="New artifacts" value={summary.new_artifacts} color="green" />
        <StatCard label="Threads resolved" value={summary.resolved_threads} color="blue" />
        <StatCard label="Tasks completed" value={summary.completed_tasks} color="amber" />
        <StatCard label="New observations" value={summary.new_observations} color="purple" />
      </div>

      {/* Daily Digest */}
      <DigestCard />

      {/* Needs Attention */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Needs Your Attention</h2>
        {needs_attention.length === 0 ? (
          <Card>
            <CardBody>
              <div className="flex items-center gap-3 text-green-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium">Nothing needs your attention right now.</span>
              </div>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-2">
            {needs_attention.map((item) => (
              <AttentionCard key={`${item.type}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </div>

      {/* Recent Completions — collapsible */}
      {recent_completions.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowCompletions(!showCompletions)}
            className="flex items-center gap-2 text-lg font-semibold text-gray-700 hover:text-gray-900 mb-3"
          >
            <svg
              className={clsx('w-4 h-4 transition-transform', showCompletions && 'rotate-90')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Recent Completions ({recent_completions.length})
          </button>
          {showCompletions && (
            <Card>
              <CardBody className="p-2">
                <div className="divide-y divide-gray-100">
                  {recent_completions.map((item) => (
                    <CompletionCard key={`${item.type}-${item.id}`} item={item} />
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* Knowledge Base Health */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Knowledge Base Health</h2>
        <Card>
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Artifacts</h3>
                <div className="space-y-2">
                  <HealthBar label="Accepted" value={health.accepted_count} total={health.total_artifacts} color="green" />
                  <HealthBar label="Draft" value={health.draft_count} total={health.total_artifacts} color="amber" />
                  <HealthBar label="Deprecated" value={health.deprecated_count} total={health.total_artifacts} color="gray" />
                </div>
                <p className="text-xs text-gray-400 mt-2">{health.total_artifacts} total artifacts</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Threads</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Open threads</span>
                    <span className="text-sm font-medium text-gray-900">{health.open_threads}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Stale threads</span>
                    <span className={clsx(
                      'text-sm font-medium',
                      health.stale_threads > 0 ? 'text-amber-600' : 'text-gray-400'
                    )}>
                      {health.stale_threads}
                    </span>
                  </div>
                  {health.stale_threads > 0 && (
                    <p className="text-xs text-amber-500">
                      {health.stale_threads} thread{health.stale_threads > 1 ? 's' : ''} open {'>'} 7 days with no activity
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Quick nav when nothing happened */}
      {totalActivity === 0 && (
        <Card>
          <CardBody>
            <p className="text-gray-500 text-center py-4">
              No new activity since your last review.{' '}
              <Link to="/topics" className="text-cortex-600 hover:text-cortex-700 font-medium">
                Browse topics
              </Link>
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
