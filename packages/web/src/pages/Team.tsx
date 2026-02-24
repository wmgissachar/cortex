import { clsx } from 'clsx';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { usePageView } from '../api/hooks';
import { useAiTeam } from '../api/hooks/useAiTeam';
import { PersonaCard } from '../components/team/PersonaCard';
import { ConfigPanel } from '../components/team/ConfigPanel';
import { ActivityLog } from '../components/team/ActivityLog';
import { UsageDashboard } from '../components/team/UsageDashboard';
import { InsightsPanel } from '../components/team/InsightsPanel';
import { LoadingState } from '../components/common/Spinner';
import { EmptyState, EmptyIcon } from '../components/common/EmptyState';

type Tab = 'team' | 'config' | 'activity' | 'usage' | 'insights';

const allTabs: { value: Tab; label: string; adminOnly?: boolean }[] = [
  { value: 'team', label: 'Team' },
  { value: 'config', label: 'Configuration', adminOnly: true },
  { value: 'activity', label: 'Activity' },
  { value: 'usage', label: 'Usage' },
  { value: 'insights', label: 'Insights' },
];

export function Team() {
  usePageView('team');
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin } = useAuthStore();
  const admin = isAdmin();

  const tabParam = searchParams.get('tab') as Tab | null;
  const activeTab = tabParam && allTabs.some((t) => t.value === tabParam) ? tabParam : 'team';

  const { data: team, isLoading, error } = useAiTeam();

  const setTab = (tab: Tab) => {
    setSearchParams({ tab });
  };

  const visibleTabs = allTabs.filter((t) => !t.adminOnly || admin);

  if (isLoading) {
    return <LoadingState message="Loading AI team..." />;
  }

  if (error) {
    const is404 = (error as { response?: { status: number } })?.response?.status === 404;
    if (is404) {
      return (
        <EmptyState
          title="AI layer not yet configured"
          description="The AI agent layer has not been set up for this workspace."
          icon={<EmptyIcon />}
        />
      );
    }
    return (
      <EmptyState
        title="Failed to load AI team"
        description="An error occurred while loading the AI team data."
        icon={<EmptyIcon />}
      />
    );
  }

  if (!team) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Team</h1>
          <p className="text-sm text-gray-500 mt-1">
            {team.personas.length} personas &middot; Circuit: {team.circuit_breaker_state}
          </p>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {visibleTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setTab(tab.value)}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.value
                ? 'border-cortex-600 text-cortex-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'team' && (
        <div className="space-y-4">
          {team.personas.map((persona) => (
            <PersonaCard key={persona.name} persona={persona} />
          ))}
        </div>
      )}

      {activeTab === 'config' && admin && <ConfigPanel config={team.config} />}

      {activeTab === 'activity' && <ActivityLog />}

      {activeTab === 'usage' && <UsageDashboard />}

      {activeTab === 'insights' && <InsightsPanel />}
    </div>
  );
}
