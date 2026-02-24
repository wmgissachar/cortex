import { useState } from 'react';
import { clsx } from 'clsx';
import { useAiJobs } from '../../api/hooks/useAiTeam';
import { Card, CardBody } from '../common/Card';
import { Badge } from '../common/Badge';
import { Markdown } from '../common/Markdown';
import { EmptyState, EmptyIcon } from '../common/EmptyState';
import { LoadingState } from '../common/Spinner';
import { format, formatDistanceStrict } from 'date-fns';

type PersonaFilter = 'all' | 'scribe' | 'critic' | 'linker';
type StatusFilter = 'all' | 'queued' | 'running' | 'completed' | 'failed';

const personaFilters: { value: PersonaFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'scribe', label: 'Scribe' },
  { value: 'critic', label: 'Critic' },
  { value: 'linker', label: 'Linker' },
];

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'running', label: 'Running' },
  { value: 'failed', label: 'Failed' },
];

const personaBadgeVariant: Record<string, 'blue' | 'yellow' | 'purple'> = {
  scribe: 'blue',
  critic: 'yellow',
  linker: 'purple',
};

const statusBadgeVariant: Record<string, 'gray' | 'blue' | 'green' | 'red'> = {
  queued: 'gray',
  running: 'blue',
  completed: 'green',
  failed: 'red',
};

export function ActivityLog() {
  const [personaFilter, setPersonaFilter] = useState<PersonaFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const { data: jobsData, isLoading } = useAiJobs({
    persona: personaFilter === 'all' ? undefined : personaFilter,
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 50,
  });

  const jobs = jobsData?.data || [];

  if (isLoading) {
    return <LoadingState message="Loading activity..." />;
  }

  return (
    <div>
      <div className="flex flex-wrap gap-4 mb-4">
        <div className="flex gap-1">
          {personaFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setPersonaFilter(f.value)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                personaFilter === f.value
                  ? 'bg-cortex-100 text-cortex-700'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                statusFilter === f.value
                  ? 'bg-cortex-100 text-cortex-700'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title="No AI activity yet"
          description="AI jobs will appear here once features are activated."
          icon={<EmptyIcon />}
        />
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => {
            const isExpanded = expandedJobId === job.id;
            const content = (job.output as { content?: string } | null)?.content;
            const hasOutput = job.status === 'completed' && !!content;
            const duration = job.completed_at && job.created_at
              ? formatDistanceStrict(new Date(job.completed_at), new Date(job.created_at))
              : null;

            return (
              <Card key={job.id}>
                <CardBody className="py-3">
                  <button
                    type="button"
                    onClick={() => hasOutput && setExpandedJobId(isExpanded ? null : job.id)}
                    className={clsx(
                      'w-full flex items-center justify-between gap-4',
                      hasOutput && 'cursor-pointer'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant={personaBadgeVariant[job.persona] || 'gray'}>
                        {job.persona}
                      </Badge>
                      <Badge variant={statusBadgeVariant[job.status] || 'gray'}>
                        {job.status}
                      </Badge>
                      <span className="text-sm text-gray-700 truncate">{job.feature}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 flex-shrink-0">
                      {duration && <span>{duration}</span>}
                      {job.tokens_used != null && (
                        <span>{job.tokens_used.toLocaleString()} tokens</span>
                      )}
                      {job.cost_usd != null && (
                        <span>${job.cost_usd.toFixed(4)}</span>
                      )}
                      <span>{format(new Date(job.created_at), 'MMM d, HH:mm')}</span>
                      {hasOutput && (
                        <svg
                          className={clsx(
                            'w-4 h-4 transition-transform',
                            isExpanded && 'rotate-180'
                          )}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </div>
                  </button>
                  {job.error && (
                    <p className="mt-2 text-xs text-red-600 truncate">{job.error}</p>
                  )}
                  {isExpanded && content && (
                    <div className="mt-3 max-h-96 overflow-y-auto p-4 bg-gray-50 rounded-lg border text-sm">
                      <Markdown>{content}</Markdown>
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
