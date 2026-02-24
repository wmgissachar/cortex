import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSearch, useSuggestions, useTopics, usePageView, useTrackEvent } from '../api/hooks';
import { Badge, getTypeVariant } from '../components/common/Badge';
import { LoadingState } from '../components/common/Spinner';
import { EmptyState, EmptyIcon } from '../components/common/EmptyState';
import type { SearchResult } from '../api/hooks/useSearch';

export function Home() {
  usePageView('home');
  const trackEvent = useTrackEvent();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: results, isLoading: isSearching } = useSearch(debouncedQuery);
  const { data: suggestions } = useSuggestions(query);
  const { data: topics } = useTopics(6);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setShowSuggestions(false);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    trackEvent('search.result_clicked', { result_type: result.type, result_id: result.id, position: result.rank });
    if (result.type === 'thread') {
      navigate(`/threads/${result.id}`);
    } else if (result.type === 'artifact') {
      navigate(`/artifacts/${result.id}`);
    } else if (result.type === 'comment' && result.thread_id) {
      navigate(`/threads/${result.thread_id}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero search section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Search the Knowledge Base
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Find threads, artifacts, and discussions
        </p>

        {/* Search box */}
        <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Search for anything..."
              className="w-full px-6 py-4 text-lg rounded-xl border border-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-cortex-500 focus:border-cortex-500"
            />
            <button
              type="submit"
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-cortex-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>
          </div>

          {/* Suggestions dropdown */}
          {showSuggestions && suggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg border border-gray-200 shadow-lg z-10">
              {suggestions.map((suggestion, i) => (
                <button
                  key={i}
                  type="button"
                  className="w-full text-left px-4 py-2 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                  onClick={() => {
                    setQuery(suggestion);
                    setShowSuggestions(false);
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </form>
      </div>

      {/* Search results or default content */}
      {debouncedQuery.length >= 2 ? (
        <div>
          {isSearching ? (
            <LoadingState message="Searching..." />
          ) : results && results.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Found {results.length} result{results.length !== 1 ? 's' : ''} for "{debouncedQuery}"
              </p>
              {results.map((result) => (
                <div
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleResultClick(result)}
                  className="bg-white rounded-lg border border-gray-200 p-4 hover:border-cortex-200 hover:shadow cursor-pointer transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={getTypeVariant(result.type)}>
                          {result.type}
                        </Badge>
                        {result.topic_handle && (
                          <span className="text-xs text-gray-500">
                            in {result.topic_handle}
                          </span>
                        )}
                      </div>
                      <h3 className="font-medium text-gray-900">{result.title}</h3>
                      {result.snippet && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                          {result.snippet}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No results found"
              description={`Try different keywords or check your spelling`}
              icon={<EmptyIcon />}
            />
          )}
        </div>
      ) : (
        /* Quick links when not searching */
        <div className="grid gap-6 md:grid-cols-2">
          {/* Topics */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Browse Topics
            </h2>
            <div className="space-y-2">
              {topics?.map((topic) => (
                <Link
                  key={topic.id}
                  to={`/topics/${topic.id}`}
                  className="block p-3 bg-white rounded-lg border border-gray-200 hover:border-cortex-200 hover:shadow transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">{topic.name}</h3>
                      <p className="text-sm text-gray-500 truncate">
                        {topic.description || 'No description'}
                      </p>
                    </div>
                    <div className="text-right text-xs text-gray-400">
                      <div>{topic.thread_count} threads</div>
                      <div>{topic.artifact_count} artifacts</div>
                    </div>
                  </div>
                </Link>
              ))}
              <Link
                to="/topics"
                className="block text-center text-sm text-cortex-600 hover:text-cortex-700 py-2"
              >
                View all topics →
              </Link>
            </div>
          </div>

          {/* Quick actions */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Quick Actions
            </h2>
            <div className="space-y-2">
              <Link
                to="/tasks"
                className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-cortex-200 hover:shadow transition-all"
              >
                <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">View Tasks</h3>
                  <p className="text-sm text-gray-500">Check your open tasks</p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
