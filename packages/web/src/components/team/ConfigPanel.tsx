import { useState, useEffect } from 'react';
import type { AiConfig } from '@cortex/shared';
import { useUpdateAiConfig } from '../../api/hooks/useAiTeam';
import { useTrackEvent } from '../../api/hooks/useTrackEvent';
import { Card, CardBody, CardHeader } from '../common/Card';
import { Button } from '../common/Button';

interface ConfigPanelProps {
  config: AiConfig;
}

export function ConfigPanel({ config }: ConfigPanelProps) {
  const updateConfig = useUpdateAiConfig();
  const trackEvent = useTrackEvent();
  const [form, setForm] = useState({
    enabled: config.enabled,
    monthly_budget_usd: config.monthly_budget_usd,
    daily_digest_time: config.daily_digest_time.slice(0, 5), // trim seconds
    auto_summarize: config.auto_summarize,
    auto_review: config.auto_review,
    auto_link: config.auto_link,
    auto_tag: config.auto_tag,
    auto_triage: config.auto_triage,
    contradiction_detection: config.contradiction_detection,
    staleness_detection: config.staleness_detection,
    thread_resolution_prompt: config.thread_resolution_prompt,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({
      enabled: config.enabled,
      monthly_budget_usd: config.monthly_budget_usd,
      daily_digest_time: config.daily_digest_time.slice(0, 5),
      auto_summarize: config.auto_summarize,
      auto_review: config.auto_review,
      auto_link: config.auto_link,
      auto_tag: config.auto_tag,
      auto_triage: config.auto_triage,
      contradiction_detection: config.contradiction_detection,
      staleness_detection: config.staleness_detection,
      thread_resolution_prompt: config.thread_resolution_prompt,
    });
  }, [config]);

  const handleSave = async () => {
    // Track which settings changed
    const changedSettings: string[] = [];
    if (form.enabled !== config.enabled) changedSettings.push('enabled');
    if (form.monthly_budget_usd !== config.monthly_budget_usd) changedSettings.push('monthly_budget_usd');
    if (form.daily_digest_time !== config.daily_digest_time.slice(0, 5)) changedSettings.push('daily_digest_time');
    if (form.auto_summarize !== config.auto_summarize) changedSettings.push('auto_summarize');
    if (form.auto_review !== config.auto_review) changedSettings.push('auto_review');
    if (form.auto_link !== config.auto_link) changedSettings.push('auto_link');
    if (form.auto_tag !== config.auto_tag) changedSettings.push('auto_tag');
    if (form.auto_triage !== config.auto_triage) changedSettings.push('auto_triage');
    if (form.contradiction_detection !== config.contradiction_detection) changedSettings.push('contradiction_detection');
    if (form.staleness_detection !== config.staleness_detection) changedSettings.push('staleness_detection');
    if (form.thread_resolution_prompt !== config.thread_resolution_prompt) changedSettings.push('thread_resolution_prompt');

    await updateConfig.mutateAsync(form);

    for (const setting of changedSettings) {
      trackEvent('config.changed', {
        setting,
        old_value: (config as unknown as Record<string, unknown>)[setting],
        new_value: (form as unknown as Record<string, unknown>)[setting],
      });
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const hasChanges =
    form.enabled !== config.enabled ||
    form.monthly_budget_usd !== config.monthly_budget_usd ||
    form.daily_digest_time !== config.daily_digest_time.slice(0, 5) ||
    form.auto_summarize !== config.auto_summarize ||
    form.auto_review !== config.auto_review ||
    form.auto_link !== config.auto_link ||
    form.auto_tag !== config.auto_tag ||
    form.auto_triage !== config.auto_triage ||
    form.contradiction_detection !== config.contradiction_detection ||
    form.staleness_detection !== config.staleness_detection ||
    form.thread_resolution_prompt !== config.thread_resolution_prompt;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-gray-900">General</h3>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <label className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">AI Enabled</p>
                <p className="text-sm text-gray-500">Enable or disable all AI features</p>
              </div>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="w-5 h-5 rounded text-cortex-600 focus:ring-cortex-500"
              />
            </label>

            <div>
              <label className="block font-medium text-gray-900 mb-1">
                Monthly Budget (USD)
              </label>
              <p className="text-sm text-gray-500 mb-2">
                Maximum spend per month across all AI operations
              </p>
              <input
                type="number"
                min={0}
                max={10000}
                step={5}
                value={form.monthly_budget_usd}
                onChange={(e) =>
                  setForm({ ...form, monthly_budget_usd: parseFloat(e.target.value) || 0 })
                }
                className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-cortex-500 focus:border-cortex-500"
              />
            </div>

            <div>
              <label className="block font-medium text-gray-900 mb-1">
                Daily Digest Time
              </label>
              <p className="text-sm text-gray-500 mb-2">
                When to generate the daily digest summary
              </p>
              <input
                type="time"
                value={form.daily_digest_time}
                onChange={(e) => setForm({ ...form, daily_digest_time: e.target.value })}
                className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-cortex-500 focus:border-cortex-500"
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-semibold text-gray-900">Feature Toggles</h3>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <label className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Auto-Summarize</p>
                <p className="text-sm text-gray-500">
                  Automatically summarize threads when resolved
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.auto_summarize}
                onChange={(e) => setForm({ ...form, auto_summarize: e.target.checked })}
                className="w-5 h-5 rounded text-cortex-600 focus:ring-cortex-500"
              />
            </label>

            <label className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Auto-Review</p>
                <p className="text-sm text-gray-500">
                  Automatically review new artifacts for quality
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.auto_review}
                onChange={(e) => setForm({ ...form, auto_review: e.target.checked })}
                className="w-5 h-5 rounded text-cortex-600 focus:ring-cortex-500"
              />
            </label>

            <label className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Auto-Link</p>
                <p className="text-sm text-gray-500">
                  Automatically discover relationships between knowledge items
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.auto_link}
                onChange={(e) => setForm({ ...form, auto_link: e.target.checked })}
                className="w-5 h-5 rounded text-cortex-600 focus:ring-cortex-500"
              />
            </label>

            <label className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Auto-Tag Artifacts</p>
                <p className="text-sm text-gray-500">
                  Automatically suggest tags for new artifacts
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.auto_tag}
                onChange={(e) => setForm({ ...form, auto_tag: e.target.checked })}
                className="w-5 h-5 rounded text-cortex-600 focus:ring-cortex-500"
              />
            </label>

            <label className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Auto-Triage Observations</p>
                <p className="text-sm text-gray-500">
                  Automatically categorize observations in busy threads
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.auto_triage}
                onChange={(e) => setForm({ ...form, auto_triage: e.target.checked })}
                className="w-5 h-5 rounded text-cortex-600 focus:ring-cortex-500"
              />
            </label>

            <label className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Contradiction Detection</p>
                <p className="text-sm text-gray-500">
                  Weekly scan for contradictions between artifacts
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.contradiction_detection}
                onChange={(e) => setForm({ ...form, contradiction_detection: e.target.checked })}
                className="w-5 h-5 rounded text-cortex-600 focus:ring-cortex-500"
              />
            </label>

            <label className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Staleness Detection</p>
                <p className="text-sm text-gray-500">
                  Monthly scan for stale or outdated artifacts
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.staleness_detection}
                onChange={(e) => setForm({ ...form, staleness_detection: e.target.checked })}
                className="w-5 h-5 rounded text-cortex-600 focus:ring-cortex-500"
              />
            </label>

            <label className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Thread Resolution Prompts</p>
                <p className="text-sm text-gray-500">
                  Nudge stale open threads to check if they should be resolved
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.thread_resolution_prompt}
                onChange={(e) => setForm({ ...form, thread_resolution_prompt: e.target.checked })}
                className="w-5 h-5 rounded text-cortex-600 focus:ring-cortex-500"
              />
            </label>
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={!hasChanges}
          loading={updateConfig.isPending}
        >
          Save Changes
        </Button>
        {saved && <span className="text-sm text-green-600">Saved successfully</span>}
        {updateConfig.isError && (
          <span className="text-sm text-red-600">Failed to save configuration</span>
        )}
      </div>
    </div>
  );
}
