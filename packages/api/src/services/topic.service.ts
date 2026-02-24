import { AppError, type CreateTopicInput, type UpdateTopicInput } from '@cortex/shared';
import { topicRepository } from '../repositories/topic.repository.js';
import { buildPaginatedResponse, type PaginatedResult } from '../utils/pagination.js';
import type { Topic } from '@cortex/shared';

export const topicService = {
  async list(
    workspaceId: string,
    options: { limit: number; cursor?: string; includeArchived?: boolean }
  ): Promise<PaginatedResult<Topic>> {
    const topics = await topicRepository.findAll(workspaceId, options);
    return buildPaginatedResponse(topics as Topic[], options.limit);
  },

  async getById(id: string): Promise<Topic> {
    const topic = await topicRepository.findById(id);
    if (!topic) {
      throw AppError.notFound('Topic');
    }
    return topic as Topic;
  },

  async getByHandle(workspaceId: string, handle: string): Promise<Topic> {
    const topic = await topicRepository.findByHandle(workspaceId, handle);
    if (!topic) {
      throw AppError.notFound('Topic');
    }
    return topic as Topic;
  },

  async create(
    workspaceId: string,
    createdBy: string,
    input: CreateTopicInput
  ): Promise<Topic> {
    // Check for duplicate handle
    const existing = await topicRepository.findByHandle(workspaceId, input.handle);
    if (existing) {
      throw AppError.conflict(`Topic with handle '${input.handle}' already exists`);
    }

    return topicRepository.create(workspaceId, createdBy, input) as Promise<Topic>;
  },

  async update(id: string, input: UpdateTopicInput): Promise<Topic> {
    const topic = await topicRepository.update(id, input);
    if (!topic) {
      throw AppError.notFound('Topic');
    }
    return topic as Topic;
  },

  async getTagsInUse(topicId: string): Promise<{ suggested: string[]; in_use: string[]; all: string[] }> {
    const topic = await topicRepository.findById(topicId);
    if (!topic) {
      throw AppError.notFound('Topic');
    }

    const inUse = await topicRepository.getTagsInUse(topicId);
    const settings = (topic.settings || {}) as { suggested_tags?: string[] };
    const suggested = settings.suggested_tags || [];
    const allTags = [...new Set([...suggested, ...inUse])].sort();

    return { suggested, in_use: inUse, all: allTags };
  },
};
