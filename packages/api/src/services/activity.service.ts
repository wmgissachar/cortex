import { activityRepository, type ActivityItem, type ActivityQueryOptions } from '../repositories/activity.repository.js';

export const activityService = {
  async getRecent(workspaceId: string, options: ActivityQueryOptions): Promise<{ items: ActivityItem[]; has_more: boolean }> {
    return activityRepository.getRecent(workspaceId, options);
  },
};
