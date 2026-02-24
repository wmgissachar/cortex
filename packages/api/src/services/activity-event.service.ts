import { activityEventRepository } from '../repositories/activity-event.repository.js';
import type { EventsSummary } from '@cortex/shared';

export const activityEventService = {
  async recordEvents(
    workspaceId: string,
    principalId: string | null,
    source: 'human' | 'agent' | 'system',
    events: Array<{ event_type: string; payload?: Record<string, unknown>; occurred_at?: string }>,
  ): Promise<void> {
    await activityEventRepository.createBatch(
      events.map((e) => ({
        workspace_id: workspaceId,
        principal_id: principalId,
        source,
        event_type: e.event_type,
        payload: e.payload || {},
        created_at: e.occurred_at,
      })),
    );
  },

  async getSummary(workspaceId: string, days: number): Promise<EventsSummary> {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return activityEventRepository.summarize(workspaceId, from, to);
  },
};
