import { AppError, type CreateTaskInput, type UpdateTaskInput, type TaskWithRelations } from '@cortex/shared';
import { taskRepository } from '../repositories/task.repository.js';
import { auditLogRepository } from '../repositories/audit-log.repository.js';
import { buildPaginatedResponse, type PaginatedResult } from '../utils/pagination.js';

function formatTaskWithRelations(row: {
  id: string;
  workspace_id: string;
  topic_id: string | null;
  thread_id: string | null;
  title: string;
  body: string | null;
  status: string;
  priority: string;
  assignee_id: string | null;
  due_date: string | null;
  tags: string[];
  created_at: Date;
  created_by: string;
  updated_at: Date;
  completed_at: Date | null;
  creator_id: string;
  creator_handle: string;
  creator_display_name: string;
  assignee_handle?: string;
  assignee_display_name?: string;
}): TaskWithRelations {
  const task: TaskWithRelations = {
    id: row.id,
    workspace_id: row.workspace_id,
    topic_id: row.topic_id,
    thread_id: row.thread_id,
    title: row.title,
    body: row.body,
    status: row.status as TaskWithRelations['status'],
    priority: row.priority as TaskWithRelations['priority'],
    assignee_id: row.assignee_id,
    due_date: row.due_date,
    tags: row.tags,
    created_at: row.created_at,
    created_by: row.created_by,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    creator: {
      id: row.creator_id,
      handle: row.creator_handle,
      display_name: row.creator_display_name,
    },
  };

  if (row.assignee_id && row.assignee_handle && row.assignee_display_name) {
    task.assignee = {
      id: row.assignee_id,
      handle: row.assignee_handle,
      display_name: row.assignee_display_name,
    };
  }

  return task;
}

export const taskService = {
  async list(
    workspaceId: string,
    options: { limit: number; cursor?: string; status?: string; assigneeId?: string }
  ): Promise<PaginatedResult<TaskWithRelations>> {
    const tasks = await taskRepository.findAll(workspaceId, options);
    const formatted = tasks.map(formatTaskWithRelations);
    return buildPaginatedResponse(formatted, options.limit);
  },

  async getById(id: string): Promise<TaskWithRelations> {
    const task = await taskRepository.findById(id);
    if (!task) {
      throw AppError.notFound('Task');
    }
    return formatTaskWithRelations(task);
  },

  async create(
    workspaceId: string,
    createdBy: string,
    input: CreateTaskInput
  ): Promise<TaskWithRelations> {
    const task = await taskRepository.create(workspaceId, createdBy, input);

    // Fire-and-forget audit log
    auditLogRepository.create(
      workspaceId, createdBy, 'task.created', 'task', task.id,
      { after: { title: input.title, status: input.status || 'open', priority: input.priority || 'medium' } }
    ).catch(err => console.error('Audit log error:', err));

    return this.getById(task.id);
  },

  async update(id: string, input: UpdateTaskInput, userId?: string): Promise<TaskWithRelations> {
    // Capture previous status for audit logging
    let previousStatus: string | undefined;
    if (input.status && userId) {
      const existing = await taskRepository.findById(id);
      if (existing) {
        previousStatus = existing.status;
      }
    }

    const task = await taskRepository.update(id, input);
    if (!task) {
      throw AppError.notFound('Task');
    }

    // Fire-and-forget audit log for status changes
    if (input.status && userId && previousStatus && previousStatus !== input.status) {
      const actionMap: Record<string, string> = {
        in_progress: 'task.started',
        done: 'task.completed',
        cancelled: 'task.cancelled',
      };
      const action = actionMap[input.status] || `task.${input.status}`;
      auditLogRepository.create(
        task.workspace_id, userId, action, 'task', id,
        { before: { status: previousStatus }, after: { status: input.status } }
      ).catch(err => console.error('Audit log error:', err));
    }

    return this.getById(task.id);
  },

  async delete(id: string): Promise<void> {
    const deleted = await taskRepository.delete(id);
    if (!deleted) {
      throw AppError.notFound('Task');
    }
  },
};
