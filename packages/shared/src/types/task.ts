import type { TaskStatus, TaskPriority } from '../enums.js';

export interface Task {
  id: string;
  workspace_id: string;
  topic_id: string | null;
  thread_id: string | null;
  title: string;
  body: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  due_date: string | null; // ISO date string
  tags: string[];
  created_at: Date;
  created_by: string;
  updated_at: Date;
  completed_at: Date | null;
}

export interface CreateTaskInput {
  title: string;
  body?: string;
  topic_id?: string;
  thread_id?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee_id?: string;
  due_date?: string;
  tags?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  body?: string;
  topic_id?: string;
  thread_id?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee_id?: string;
  due_date?: string;
  tags?: string[];
}

export interface TaskWithRelations extends Task {
  creator: {
    id: string;
    handle: string;
    display_name: string;
  };
  assignee?: {
    id: string;
    handle: string;
    display_name: string;
  };
}
