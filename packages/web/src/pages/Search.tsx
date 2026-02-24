import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSearch, usePageView, useTrackEvent } from '../api/hooks';
import { useAskCortex } from '../api/hooks/useAiTeam';
import { Card, CardBody } from '../components/common/Card';
import { Badge, getStatusVariant, getTypeVariant } from '../components/common/Badge';
import { LoadingState } from '../components/common/Spinner';
import { EmptyState, EmptyIcon } from '../components/common/EmptyState';
import { Markdown } from '../components/common/Markdown';
import { relativeTime } from '../utils/time';
import { clsx } from 'clsx';
import type { SearchResult } from '../api/hooks/useSearch';

type ContentType = 'all' | 'threads' | 'artifacts' | 'comments';

const typeOptions: { value: ContentType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'threads', label: 'Threads' },
  { value: 'artifacts', label: 'Artifacts' },
  { value: 'comments', label: 'Comments' },
];

const statusOptions = [
  { value: '', label: 'Any status' },
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'deprecated', label: 'Deprecated' },
  { value: 'draft', label: 'Draft' },
];

function ResultCard({ result, onResultClick }: { result: SearchResult; onResultClick?: (result: SearchResult, position: number) => void }) {
  const linkTo = result.type === 'thread'
    ? `/threads/${result.id}`
    : result.type === 'artifact'
      ? `/artifacts/${result.id}`
      : result.thread_id
        ? `/threads/${result.thread_id}`
        : '#';

  return (
    <Link to={linkTo} onClick={() => onResultClick?.(result, result.rank)}>
      <Card hover>
        <CardBody>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={getTypeVariant(result.type)}>{result.type}</Badge>
                {result.status && (
                  <Badge variant={getStatusVariant(result.status)}>{result.status}</Badge>
                )}
                {result.topic_handle && (
                  <span className="text-xs text-gray-400">{result.topic_handle}</span>
                )}
              </div>
              <h3 className="font-medium text-gray-900 line-clamp-1">{result.title}</h3>
              {result.snippet && (
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{result.snippet}</p>
              )}
              <p className="text-xs text-gray-400 mt-2">{relativeTime(result.created_at)}</p>
            </div>
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}

export function Search() {
  usePageView('search');
  const trackEvent = useTrackEvent();
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState(searchParams.get('q') || '');

  const query = searchParams.get('q') || '';
  const type = (searchParams.get('type') as ContentType) || 'all';
  const status = searchParams.get('status') || '';

  const askCortex = useAskCortex();
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);

  const tags = searchParams.get('tags') || '';

  const { data: results, isLoading } = useSearch(query, {
    type: type !== 'all' ? type : undefined,
    status: status || undefined,
    tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    limit: 30,
  });

  // Sync input with URL
  useEffect(() => {
    setInputValue(query);
  }, [query]);

  const updateParams = (updates: Record<string, string>) => {
    const newParams = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    }
    setSearchParams(newParams);
  };

  // Track search.executed when results load for a query
  const lastTrackedQuery = useRef('');
  useEffect(() => {
    if (query && query.length >= 2 && results && query !== lastTrackedQuery.current) {
      lastTrackedQuery.current = query;
      trackEvent('search.executed', { query, result_count: results.length });
    }
  }, [query, results, trackEvent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ q: inputValue });
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Search</h1>

      {/* Search bar */}
      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Search threads, artifacts, and comments..."
              autoFocus
              className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cortex-500 focus:border-cortex-500 text-sm"
            />
            <svg
              className="absolute left-3 top-3.5 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <button
            type="button"
            disabled={!inputValue.trim() || askCortex.isPending}
            onClick={() => {
              if (inputValue.trim()) {
                trackEvent('ask_ai.submitted', { query: inputValue.trim() });
                setAiAnswer(null);
                askCortex.mutate({ query: inputValue.trim() }, {
                  onSuccess: (data) => setAiAnswer(data.content),
                });
              }
            }}
            className="px-4 py-3 bg-cortex-600 text-white rounded-lg text-sm font-medium hover:bg-cortex-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {askCortex.isPending ? 'Asking...' : 'Ask AI'}
          </button>
        </div>
      </form>

      {/* AI Answer Panel */}
      {(askCortex.isPending || aiAnswer) && (
        <Card className="mb-6 border-cortex-200 bg-cortex-50/30">
          <CardBody>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-cortex-700">AI Answer</h3>
              {aiAnswer && (
                <button
                  onClick={() => setAiAnswer(null)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Dismiss
                </button>
              )}
            </div>
            {askCortex.isPending ? (
              <LoadingState message="Searching knowledge base and generating answer..." />
            ) : aiAnswer ? (
              <div className="prose prose-sm max-w-none">
                <Markdown>{aiAnswer}</Markdown>
              </div>
            ) : null}
            {askCortex.isError && (
              <p className="text-sm text-red-600">
                {askCortex.error instanceof Error ? askCortex.error.message : 'Failed to get AI answer'}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Type toggles */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {typeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateParams({ type: opt.value === 'all' ? '' : opt.value })}
              className={clsx(
                'px-3 py-1.5 text-sm font-medium transition-colors',
                type === opt.value || (opt.value === 'all' && !searchParams.get('type'))
                  ? 'bg-cortex-50 text-cortex-700'
                  : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Status dropdown */}
        <select
          value={status}
          onChange={(e) => updateParams({ status: e.target.value })}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-cortex-500"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Tag filter */}
        <input
          type="text"
          value={tags}
          onChange={(e) => updateParams({ tags: e.target.value })}
          placeholder="Filter by tags (e.g. negative-result, dead-end)"
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-cortex-500 min-w-[240px]"
        />
      </div>

      {/* Results */}
      {!query ? (
        <EmptyState
          title="Start searching"
          description="Enter a search query to find threads, artifacts, and comments."
          icon={<EmptyIcon />}
        />
      ) : isLoading ? (
        <LoadingState message="Searching..." />
      ) : !results || results.length === 0 ? (
        <EmptyState
          title="No results"
          description={`No results found for "${query}". Try different keywords or filters.`}
          icon={<EmptyIcon />}
        />
      ) : (
        <div>
          <p className="text-sm text-gray-500 mb-3">{results.length} result{results.length !== 1 ? 's' : ''}</p>
          <div className="space-y-2">
            {results.map((result, index) => (
              <ResultCard
                key={`${result.type}-${result.id}`}
                result={result}
                onResultClick={(r) => trackEvent('search.result_clicked', { result_type: r.type, result_id: r.id, position: index })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
