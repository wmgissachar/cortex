import { useState } from 'react';
import { useEventsSummary } from '../../api/hooks/useTrackEvent';
import { Card, CardBody, CardHeader } from '../common/Card';
import { LoadingState } from '../common/Spinner';
import { clsx } from 'clsx';

function StatCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
      {detail && <div className="text-xs text-gray-400 mt-1">{detail}</div>}
    </div>
  );
}

function BarSegment({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex-1 bg-gray-100 rounded-full h-2">
      <div className={clsx('h-2 rounded-full', color)} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

export function InsightsPanel() {
  const [days, setDays] = useState(30);
  const { data: summary, isLoading } = useEventsSummary(days);

  if (isLoading) {
    return <LoadingState message="Loading insights..." />;
  }

  if (!summary) {
    return (
      <Card>
        <CardBody>
          <p className="text-gray-500 text-center py-4">
            No activity data available yet. Events will appear here as you use Cortex.
          </p>
        </CardBody>
      </Card>
    );
  }

  const human = summary.human || {};
  const agent = summary.agent || {};
  const daily = summary.daily || [];

  // Derived metrics
  const digestHabit = human.active_days > 0
    ? Math.round((human.digest_views / human.active_days) * 100)
    : 0;
  const searchToAiRatio = human.searches > 0
    ? (human.ask_ai_queries / human.searches).toFixed(1)
    : 'N/A';

  // Find max daily value for chart scaling
  const maxDaily = Math.max(
    ...daily.map((d: { human_events: number; agent_events: number }) => d.human_events + d.agent_events),
    1
  );

  // Top tools
  const topTools = Object.entries(agent.tools || {})
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Period:</span>
        {[7, 14, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={clsx(
              'px-3 py-1 rounded-lg text-sm font-medium transition-colors',
              days === d ? 'bg-cortex-100 text-cortex-700' : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            {d}d
          </button>
        ))}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard label="Active Days" value={human.active_days || 0} detail={`of ${days} days`} />
        <StatCard label="Digest Habit" value={`${digestHabit}%`} detail="views / active days" />
        <StatCard label="Ask AI Usage" value={human.ask_ai_queries || 0} detail="queries" />
        <StatCard
          label="Search vs AI"
          value={searchToAiRatio}
          detail={`${human.searches || 0} searches, ${human.ask_ai_queries || 0} AI queries`}
        />
        <StatCard label="Threads Resolved" value={human.threads_resolved || 0} />
        <StatCard label="Artifacts Edited" value={human.artifacts_edited || 0} />
        <StatCard label="Agent Tool Calls" value={agent.total_tool_calls || 0} detail={`~${agent.estimated_sessions || 0} sessions`} />
        <StatCard label="Total Human Events" value={human.total_events || 0} />
      </div>

      {/* Page views breakdown */}
      {human.pages && Object.keys(human.pages).length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Page Views</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-2">
              {Object.entries(human.pages)
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .map(([page, count]) => {
                  const maxPages = Math.max(...Object.values(human.pages as Record<string, number>));
                  return (
                    <div key={page} className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 w-28 truncate">{page}</span>
                      <BarSegment value={count as number} max={maxPages} color="bg-cortex-500" />
                      <span className="text-sm text-gray-500 w-10 text-right">{count as number}</span>
                    </div>
                  );
                })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Agent top tools */}
      {topTools.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Top Agent Tools</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-2">
              {topTools.map(([tool, count]) => {
                const maxToolCount = topTools[0][1] as number;
                return (
                  <div key={tool} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-40 truncate font-mono">{tool}</span>
                    <BarSegment value={count as number} max={maxToolCount} color="bg-blue-500" />
                    <span className="text-sm text-gray-500 w-10 text-right">{count as number}</span>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Daily activity chart */}
      {daily.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Daily Activity</h3>
          </CardHeader>
          <CardBody>
            <div className="flex items-end gap-1" style={{ height: 120 }}>
              {daily.slice(-Math.min(daily.length, 30)).map((day: { date: string; human_events: number; agent_events: number }) => {
                const total = day.human_events + day.agent_events;
                const humanPct = maxDaily > 0 ? (day.human_events / maxDaily) * 100 : 0;
                const agentPct = maxDaily > 0 ? (day.agent_events / maxDaily) * 100 : 0;
                return (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col justify-end gap-px"
                    title={`${day.date}: ${day.human_events} human, ${day.agent_events} agent`}
                  >
                    {day.human_events > 0 && (
                      <div className="bg-cortex-400 rounded-t-sm" style={{ height: `${humanPct}%`, minHeight: total > 0 ? 2 : 0 }} />
                    )}
                    {day.agent_events > 0 && (
                      <div className="bg-blue-400 rounded-b-sm" style={{ height: `${agentPct}%`, minHeight: total > 0 ? 2 : 0 }} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-4 mt-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <span className="w-3 h-2 bg-cortex-400 rounded-sm inline-block" /> Human
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-2 bg-blue-400 rounded-sm inline-block" /> Agent
              </span>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
