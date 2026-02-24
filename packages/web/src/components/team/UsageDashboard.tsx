import { useAiUsage, useAiConfig } from '../../api/hooks/useAiTeam';
import { Card, CardBody, CardHeader } from '../common/Card';
import { LoadingState } from '../common/Spinner';
import { clsx } from 'clsx';

export function UsageDashboard() {
  const { data: usage, isLoading: usageLoading } = useAiUsage(30);
  const { data: config, isLoading: configLoading } = useAiConfig();

  if (usageLoading || configLoading) {
    return <LoadingState message="Loading usage data..." />;
  }

  if (!usage) return null;

  const budgetUsed = usage.total_cost_usd;
  const budgetLimit = config?.monthly_budget_usd ?? 50;
  const budgetPercent = budgetLimit > 0 ? Math.min((budgetUsed / budgetLimit) * 100, 100) : 0;
  const budgetColor =
    budgetPercent < 50 ? 'bg-green-500' : budgetPercent < 80 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="space-y-6">
      {/* Budget progress */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-gray-900">Monthly Budget</h3>
        </CardHeader>
        <CardBody>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-2xl font-bold text-gray-900">
              ${budgetUsed.toFixed(2)}
            </span>
            <span className="text-sm text-gray-500">
              of ${budgetLimit.toFixed(2)} budget
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={clsx('h-3 rounded-full transition-all', budgetColor)}
              style={{ width: `${budgetPercent}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {budgetPercent.toFixed(1)}% used this month
          </p>
        </CardBody>
      </Card>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500">Total Jobs</p>
            <p className="text-2xl font-bold text-gray-900">{usage.total_jobs}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500">Total Tokens</p>
            <p className="text-2xl font-bold text-gray-900">
              {usage.total_tokens.toLocaleString()}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500">Total Cost</p>
            <p className="text-2xl font-bold text-gray-900">
              ${usage.total_cost_usd.toFixed(2)}
            </p>
          </CardBody>
        </Card>
      </div>

      {/* Per-persona breakdown */}
      {usage.by_persona.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">By Persona</h3>
          </CardHeader>
          <CardBody>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 font-medium">Persona</th>
                  <th className="pb-2 font-medium text-right">Jobs</th>
                  <th className="pb-2 font-medium text-right">Tokens</th>
                  <th className="pb-2 font-medium text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {usage.by_persona.map((row) => (
                  <tr key={row.persona} className="border-b last:border-0">
                    <td className="py-2 capitalize font-medium text-gray-900">
                      {row.persona}
                    </td>
                    <td className="py-2 text-right text-gray-700">{row.job_count}</td>
                    <td className="py-2 text-right text-gray-700">
                      {row.total_tokens.toLocaleString()}
                    </td>
                    <td className="py-2 text-right text-gray-700">
                      ${row.total_cost_usd.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* Daily breakdown */}
      {usage.daily.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Daily Activity</h3>
          </CardHeader>
          <CardBody>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium text-right">Jobs</th>
                  <th className="pb-2 font-medium text-right">Tokens</th>
                  <th className="pb-2 font-medium text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {usage.daily.map((row) => (
                  <tr key={row.date} className="border-b last:border-0">
                    <td className="py-2 text-gray-900">{row.date}</td>
                    <td className="py-2 text-right text-gray-700">{row.job_count}</td>
                    <td className="py-2 text-right text-gray-700">
                      {row.total_tokens.toLocaleString()}
                    </td>
                    <td className="py-2 text-right text-gray-700">
                      ${row.total_cost_usd.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
