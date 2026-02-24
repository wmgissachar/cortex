import { useState } from 'react';
import type { PersonaDefinition } from '@cortex/shared';
import { useTriggerAiJob } from '../../api/hooks/useAiTeam';
import { useThreads } from '../../api/hooks/useThreads';
import { useArtifacts } from '../../api/hooks/useArtifacts';
import { Markdown } from '../common/Markdown';

interface RunAgentFormProps {
  persona: PersonaDefinition;
  onClose: () => void;
}

const targetLabels: Record<string, string> = {
  scribe: 'Target Thread',
  critic: 'Target Artifact',
  linker: 'Target Artifact',
};

export function RunAgentForm({ persona, onClose }: RunAgentFormProps) {
  const [targetId, setTargetId] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const trigger = useTriggerAiJob();

  const isThreadTarget = persona.name === 'scribe';
  const label = targetLabels[persona.name] || 'Target';

  // Fetch recent items for the dropdown
  const { data: threadsData } = useThreads({ limit: 30 });
  const { data: artifactsData } = useArtifacts({ status: 'accepted', limit: 30 });

  const threads = threadsData?.data || [];
  const artifacts = artifactsData?.data || [];
  const items = isThreadTarget ? threads : artifacts;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId.trim()) return;
    trigger.mutate({ persona: persona.name, target_id: targetId.trim() });
  };

  return (
    <div className="mt-4 border-t pt-4">
      {!trigger.isSuccess && !trigger.isError && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                {label}
              </label>
              <button
                type="button"
                onClick={() => { setManualMode(!manualMode); setTargetId(''); }}
                className="text-xs text-cortex-600 hover:text-cortex-700"
              >
                {manualMode ? 'Pick from list' : 'Enter UUID manually'}
              </button>
            </div>

            {manualMode ? (
              <input
                type="text"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder={isThreadTarget ? 'Enter a thread UUID' : 'Enter an artifact UUID'}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm
                           focus:outline-none focus:ring-2 focus:ring-cortex-500 focus:border-transparent"
                disabled={trigger.isPending}
              />
            ) : (
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-cortex-500 focus:border-transparent"
                disabled={trigger.isPending}
              >
                <option value="">
                  {isThreadTarget ? 'Select a thread...' : 'Select an artifact...'}
                </option>
                {items.map((item) => {
                  const title = item.title.length > 60
                    ? item.title.substring(0, 57) + '...'
                    : item.title;
                  const meta = isThreadTarget
                    ? `${(item as typeof threads[0]).type} · ${(item as typeof threads[0]).status}`
                    : `${(item as typeof artifacts[0]).type} · ${(item as typeof artifacts[0]).status}`;
                  return (
                    <option key={item.id} value={item.id}>
                      {title} — {meta}
                    </option>
                  );
                })}
              </select>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!targetId.trim() || trigger.isPending}
              className="px-4 py-2 bg-cortex-600 text-white text-sm font-medium rounded-md
                         hover:bg-cortex-700 disabled:opacity-50 disabled:cursor-not-allowed
                         flex items-center gap-2"
            >
              {trigger.isPending && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {trigger.isPending ? 'Running...' : 'Run'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={trigger.isPending}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {trigger.isError && (
        <div className="space-y-3">
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">
              {(trigger.error as Error)?.message || 'An error occurred'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => trigger.reset()}
              className="px-4 py-2 text-sm text-cortex-600 hover:text-cortex-700 font-medium"
            >
              Try again
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {trigger.isSuccess && trigger.data && (
        <div className="space-y-3">
          <div className="p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-800">
              Completed — {trigger.data.job.tokens_used?.toLocaleString()} tokens
              {trigger.data.posted_to && (
                <span className="text-green-600"> — posted to thread</span>
              )}
            </p>
          </div>
          <div className="max-h-96 overflow-y-auto p-4 bg-gray-50 rounded-lg border text-sm">
            <Markdown>{trigger.data.content}</Markdown>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { trigger.reset(); setTargetId(''); }}
              className="px-4 py-2 text-sm text-cortex-600 hover:text-cortex-700 font-medium"
            >
              Run another
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
