import { useState } from 'react';
import { clsx } from 'clsx';
import type { PersonaDefinition } from '@cortex/shared';
import { Card, CardBody } from '../common/Card';
import { Badge } from '../common/Badge';
import { Markdown } from '../common/Markdown';
import { RunAgentForm } from './RunAgentForm';

const personaColors: Record<string, { border: string; bg: string; dot: string }> = {
  scribe: { border: 'border-l-blue-500', bg: 'bg-blue-50', dot: 'bg-blue-500' },
  critic: { border: 'border-l-amber-500', bg: 'bg-amber-50', dot: 'bg-amber-500' },
  linker: { border: 'border-l-purple-500', bg: 'bg-purple-50', dot: 'bg-purple-500' },
};

const statusLabels: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-green-500' },
  disabled: { label: 'Disabled', color: 'bg-gray-400' },
  circuit_open: { label: 'Circuit Open', color: 'bg-red-500' },
};

interface PersonaCardProps {
  persona: PersonaDefinition;
}

export function PersonaCard({ persona }: PersonaCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showRun, setShowRun] = useState(false);
  const colors = personaColors[persona.name] || personaColors.scribe;
  const statusInfo = statusLabels[persona.status] || statusLabels.disabled;

  return (
    <Card className={clsx('border-l-4', colors.border)}>
      <CardBody>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-semibold text-gray-900">
                {persona.display_name}
              </h3>
              <span className="flex items-center gap-1.5">
                <span className={clsx('w-2 h-2 rounded-full', statusInfo.color)} />
                <span className="text-xs text-gray-500">{statusInfo.label}</span>
              </span>
              {persona.status === 'active' && (
                <button
                  onClick={() => setShowRun(!showRun)}
                  className="ml-auto px-3 py-1 text-xs font-medium rounded-md border
                             border-cortex-300 text-cortex-700 hover:bg-cortex-50
                             transition-colors"
                >
                  {showRun ? 'Cancel' : 'Run'}
                </button>
              )}
            </div>

            <p className="text-sm text-gray-600 mb-3">{persona.description}</p>

            <div className="flex flex-wrap gap-2 mb-3">
              <Badge variant="blue">{persona.default_model}</Badge>
              <Badge variant="gray">reasoning: {persona.default_reasoning_effort}</Badge>
              {persona.features.map((f) => (
                <Badge key={f} variant="purple">{f}</Badge>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Jobs today</p>
                <p className="font-medium text-gray-900">{persona.stats.jobs_today}</p>
              </div>
              <div>
                <p className="text-gray-500">Jobs this month</p>
                <p className="font-medium text-gray-900">{persona.stats.jobs_this_month}</p>
              </div>
              <div>
                <p className="text-gray-500">Tokens today</p>
                <p className="font-medium text-gray-900">
                  {persona.stats.tokens_today.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Tokens this month</p>
                <p className="font-medium text-gray-900">
                  {persona.stats.tokens_this_month.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-sm text-cortex-600 hover:text-cortex-700 font-medium"
        >
          {expanded ? 'Hide system prompt' : 'Show system prompt'}
        </button>

        {expanded && (
          <div className="mt-3 p-4 bg-gray-50 rounded-lg border text-sm">
            <Markdown>{persona.system_prompt}</Markdown>
          </div>
        )}

        {showRun && (
          <RunAgentForm persona={persona} onClose={() => setShowRun(false)} />
        )}
      </CardBody>
    </Card>
  );
}
